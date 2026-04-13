/**
 * File system IPC handlers module.
 *
 * All file/directory operations exposed to the renderer.
 * Uses path validation (pathValidator) for security.
 * Most operations use Node's fs.promises; special cases use system tools
 * (shell.trashItem, sips for image conversion, zip for compression).
 */

const { ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const { validatePath } = require('./pathValidator');

const MAX_DIR_ENTRIES = 500;

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.cache',
  'dist', 'build', '.DS_Store', '__pycache__', '.venv', 'venv',
  '.pytest_cache', '.mypy_cache', 'target', '.idea', '.vscode',
]);

function initFsIPC() {
  // Directory listing
  ipcMain.handle('fs:listDir', async (_, dirPath) => {
    if (!dirPath || typeof dirPath !== 'string') return { error: 'Invalid path' };
    const validation = validatePath(dirPath);
    if (!validation.valid) return { error: validation.error };
    try {
      const entries = await fs.promises.readdir(validation.resolved, { withFileTypes: true });
      // Truncate raw entries first to bound memory usage for huge directories,
      // then filter and sort.  hasMore is determined by whether the raw list
      // was truncated (the directory had more entries than we read).
      const rawHasMore = entries.length > MAX_DIR_ENTRIES * 2;
      if (rawHasMore) entries.length = MAX_DIR_ENTRIES * 2;
      const items = entries
        .filter((e) => !(e.isDirectory() && IGNORED_DIRS.has(e.name)))
        .map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          path: path.join(validation.resolved, e.name),
          hidden: e.name.startsWith('.'),
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      const hasMore = rawHasMore || items.length > MAX_DIR_ENTRIES;
      if (items.length > MAX_DIR_ENTRIES) items.length = MAX_DIR_ENTRIES;
      return { items, hasMore };
    } catch (e) {
      return { error: e.message };
    }
  });

  // File exists check
  ipcMain.handle('fs:exists', async (_, filePath) => {
    const validation = validatePath(filePath);
    if (!validation.valid) return false;
    try {
      await fs.promises.access(validation.resolved, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  });

  // Write a text file
  ipcMain.handle('fs:writeFile', async (_, filePath, content) => {
    const validation = validatePath(filePath);
    if (!validation.valid) return { error: validation.error };
    try {
      await fs.promises.mkdir(path.dirname(validation.resolved), { recursive: true });
      await fs.promises.writeFile(validation.resolved, content, 'utf-8');
      return { ok: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  // Reveal in Finder
  ipcMain.handle('fs:reveal', async (_, filePath) => {
    const validation = validatePath(filePath);
    if (!validation.valid) return { error: validation.error };
    try {
      const stat = await fs.promises.stat(validation.resolved);
      if (stat.isDirectory()) {
        shell.openPath(validation.resolved);
      } else {
        shell.showItemInFolder(validation.resolved);
      }
      return { ok: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  // Open with default app
  ipcMain.handle('fs:openFile', async (_, filePath) => {
    const validation = validatePath(filePath);
    if (!validation.valid) return { error: validation.error };
    try {
      await shell.openPath(validation.resolved);
      return { ok: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  // Send to Trash
  ipcMain.handle('fs:trash', async (_, filePath) => {
    const validation = validatePath(filePath);
    if (!validation.valid) return { error: validation.error };
    try {
      await shell.trashItem(validation.resolved);
      return { ok: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  // File stat info
  ipcMain.handle('fs:stat', async (_, filePath) => {
    const validation = validatePath(filePath);
    if (!validation.valid) return { error: validation.error };
    try {
      const stat = await fs.promises.stat(validation.resolved);
      return {
        size: stat.size,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        mtime: stat.mtimeMs,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  // Rename (no path traversal — newName must be a basename)
  ipcMain.handle('fs:rename', async (_, oldPath, newName) => {
    const validation = validatePath(oldPath);
    if (!validation.valid) return { error: validation.error };
    try {
      if (typeof newName !== 'string' || newName.includes('/') || newName.includes('\\')) {
        return { error: 'newName 必须是文件名（不含路径分隔符）' };
      }
      const dir = path.dirname(validation.resolved);
      const newPath = path.join(dir, newName);
      const destValidation = validatePath(newPath);
      if (!destValidation.valid) return { error: destValidation.error };
      await fs.promises.rename(validation.resolved, destValidation.resolved);
      return { ok: true, newPath: destValidation.resolved };
    } catch (e) {
      return { error: e.message };
    }
  });

  // Recursive copy
  ipcMain.handle('fs:copy', async (_, src, dest) => {
    const srcV = validatePath(src);
    if (!srcV.valid) return { error: srcV.error };
    const destV = validatePath(dest);
    if (!destV.valid) return { error: destV.error };
    try {
      await fs.promises.cp(srcV.resolved, destV.resolved, { recursive: true, errorOnExist: false, force: true });
      return { ok: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  // Move (rename across paths, fallback to copy+delete for cross-filesystem)
  ipcMain.handle('fs:move', async (_, src, dest) => {
    const srcV = validatePath(src);
    if (!srcV.valid) return { error: srcV.error };
    const destV = validatePath(dest);
    if (!destV.valid) return { error: destV.error };
    try {
      await fs.promises.rename(srcV.resolved, destV.resolved);
      return { ok: true };
    } catch (e) {
      if (e.code === 'EXDEV') {
        try {
          await fs.promises.cp(srcV.resolved, destV.resolved, { recursive: true });
          await fs.promises.rm(srcV.resolved, { recursive: true, force: true });
          return { ok: true };
        } catch (e2) {
          return { error: e2.message };
        }
      }
      return { error: e.message };
    }
  });

  // Zip using system `zip` command
  ipcMain.handle('fs:zip', async (_, srcPath) => {
    const validation = validatePath(srcPath);
    if (!validation.valid) return { error: validation.error };
    return new Promise((resolve) => {
      const dir = path.dirname(validation.resolved);
      const name = path.basename(srcPath);
      const zipName = `${name}.zip`;
      const zipPath = path.join(dir, zipName);
      execFile('zip', ['-r', '-q', zipName, name], { cwd: dir, timeout: 60000 }, (err) => {
        if (err) return resolve({ error: err.message });
        resolve({ ok: true, path: zipPath });
      });
    });
  });

  // Create empty file
  ipcMain.handle('fs:newFile', async (_, dirPath, name) => {
    const dirValidation = validatePath(dirPath);
    if (!dirValidation.valid) return { error: dirValidation.error };
    try {
      if (typeof name !== 'string' || name.includes('/') || name.includes('\\')) {
        return { error: '文件名必须不含路径分隔符' };
      }
      const filePath = path.join(dirValidation.resolved, name);
      const fileValidation = validatePath(filePath);
      if (!fileValidation.valid) return { error: fileValidation.error };
      await fs.promises.writeFile(fileValidation.resolved, '', { flag: 'wx' });
      return { ok: true, path: fileValidation.resolved };
    } catch (e) {
      return { error: e.message };
    }
  });

  // Create empty directory
  ipcMain.handle('fs:newFolder', async (_, dirPath, name) => {
    const dirValidation = validatePath(dirPath);
    if (!dirValidation.valid) return { error: dirValidation.error };
    try {
      if (typeof name !== 'string' || name.includes('/') || name.includes('\\')) {
        return { error: '文件夹名必须不含路径分隔符' };
      }
      const folderPath = path.join(dirValidation.resolved, name);
      const folderValidation = validatePath(folderPath);
      if (!folderValidation.valid) return { error: folderValidation.error };
      await fs.promises.mkdir(folderValidation.resolved);
      return { ok: true, path: folderValidation.resolved };
    } catch (e) {
      return { error: e.message };
    }
  });

  // HEIC -> PNG conversion via macOS sips
  ipcMain.handle('fs:convertHeic', async (_, sourcePath) => {
    if (!sourcePath) return { error: 'No source path' };
    const validation = validatePath(sourcePath);
    if (!validation.valid) return { error: validation.error };
    return new Promise((resolve) => {
      const baseName = path.basename(validation.resolved, path.extname(validation.resolved));
      const outputPath = path.join(
        os.tmpdir(),
        `zhishu-${baseName}-${Date.now()}.png`
      );
      execFile('sips',
        ['-s', 'format', 'png', validation.resolved, '--out', outputPath],
        { timeout: 10000 },
        (err, stdout, stderr) => {
          if (err) {
            return resolve({ error: stderr || err.message });
          }
          resolve({ ok: true, path: outputPath });
        }
      );
    });
  });

  // Generic image -> PNG conversion
  ipcMain.handle('fs:normalizeImage', async (_, sourcePath) => {
    if (!sourcePath) return { error: 'No source path' };
    const validation = validatePath(sourcePath);
    if (!validation.valid) return { error: validation.error };
    const ext = path.extname(validation.resolved).toLowerCase();
    const WEB_SAFE = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
    if (WEB_SAFE.includes(ext)) {
      return { ok: true, path: validation.resolved, converted: false };
    }
    return new Promise((resolve) => {
      const baseName = path.basename(validation.resolved, ext);
      const outputPath = path.join(
        os.tmpdir(),
        `zhishu-${baseName}-${Date.now()}.png`
      );
      execFile('sips',
        ['-s', 'format', 'png', validation.resolved, '--out', outputPath],
        { timeout: 10000 },
        (err, stdout, stderr) => {
          if (err) return resolve({ error: stderr || err.message });
          resolve({ ok: true, path: outputPath, converted: true });
        }
      );
    });
  });

  // Read first ~10KB of a file as text preview
  ipcMain.handle('fs:readFilePreview', async (_, filePath) => {
    const validation = validatePath(filePath);
    if (!validation.valid) return { error: validation.error };
    try {
      const stat = await fs.promises.stat(validation.resolved);
      if (stat.size > 1024 * 1024) return { error: 'File too large (>1MB)' };
      if (stat.isDirectory()) return { error: 'Is a directory' };
      const buffer = Buffer.alloc(Math.min(stat.size, 10 * 1024));
      const fd = await fs.promises.open(validation.resolved, 'r');
      await fd.read(buffer, 0, buffer.length, 0);
      await fd.close();
      return { content: buffer.toString('utf-8'), size: stat.size };
    } catch (e) {
      return { error: e.message };
    }
  });
}

module.exports = {
  initFsIPC,
};

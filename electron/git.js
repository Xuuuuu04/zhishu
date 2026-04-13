/**
 * Git IPC handlers module.
 *
 * Lightweight git wrapper using execFile (no shell injection).
 * Returns structured data for the renderer to display directly.
 * All commands run with the project directory as cwd.
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { parseGitStatus } = require('./gitStatus');
const { validatePath } = require('./pathValidator');
const { interruptAndRunInShell } = require('./pty');

function runGit(cwd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 5000, maxBuffer: 4 * 1024 * 1024, ...opts },
      (err, stdout, stderr) => {
        if (err) return resolve({ error: stderr || err.message });
        resolve({ stdout: stdout || '' });
      });
  });
}

// Directories to skip during recursive git repo scanning
const SCAN_IGNORED = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.cache',
  'dist', 'build', '__pycache__', '.venv', 'venv', '.pytest_cache',
  '.mypy_cache', 'target', '.idea', '.vscode', '.DS_Store',
  'vendor', 'tmp', 'temp', '.terraform',
]);

async function scanGitRepoPaths(rootDir, maxDepth = 4) {
  const results = [];

  async function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((e) => e.name === '.git' && (e.isDirectory() || e.isFile()))) {
      results.push(dir);
      return;
    }

    const subDirs = entries.filter(
      (e) => e.isDirectory() && !SCAN_IGNORED.has(e.name) && !e.name.startsWith('.')
    );
    await Promise.all(subDirs.map((e) => walk(path.join(dir, e.name), depth + 1)));
  }

  await walk(rootDir, 0);
  return results;
}

function initGitIPC() {
  ipcMain.handle('git:status', async (_, cwd) => {
    if (!cwd) return { error: 'No cwd' };
    const v = validatePath(cwd);
    if (!v.valid) return { error: v.error };
    const r = await runGit(v.resolved, ['status', '--porcelain=v1', '-b']);
    if (r.error) return { isRepo: false, error: r.error };
    return { isRepo: true, ...parseGitStatus(r.stdout) };
  });

  ipcMain.handle('git:branches', async (_, cwd) => {
    if (!cwd) return { error: 'No cwd' };
    const v = validatePath(cwd);
    if (!v.valid) return { error: v.error };
    const r = await runGit(v.resolved, ['branch', '-a', '--no-color']);
    if (r.error) return { error: r.error };
    const branches = r.stdout.split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const current = line.startsWith('* ');
        const name = line.replace(/^\*\s+/, '').trim();
        return { name, current, remote: name.startsWith('remotes/') };
      });
    return { branches };
  });

  ipcMain.handle('git:log', async (_, cwd, limit = 15) => {
    if (!cwd) return { error: 'No cwd' };
    const v = validatePath(cwd);
    if (!v.valid) return { error: v.error };
    const fmt = '%h%x1f%an%x1f%ar%x1f%s%x1e';
    const r = await runGit(v.resolved, ['log', `--pretty=format:${fmt}`, `-${limit}`, '--no-color']);
    if (r.error) return { error: r.error };

    const commits = r.stdout
      .split('\x1e')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const [hash, author, relativeDate, subject] = c.split('\x1f');
        return { hash, author, relativeDate, subject };
      });
    return { commits };
  });

  ipcMain.handle('git:fileDiff', async (_, cwd, filePath) => {
    if (!cwd || !filePath) return { error: 'Missing args' };
    const v = validatePath(cwd);
    if (!v.valid) return { error: v.error };
    const r = await runGit(v.resolved, ['diff', '--no-color', '--', filePath]);
    if (r.error) return { error: r.error };
    return { diff: r.stdout };
  });

  ipcMain.handle('git:scanRepos', async (_, rootDir) => {
    if (!rootDir) return { error: 'No rootDir' };
    const v = validatePath(rootDir);
    if (!v.valid) return { error: v.error };

    const startedAt = Date.now();
    const repoPaths = await scanGitRepoPaths(v.resolved);

    const statuses = await Promise.all(
      repoPaths.map(async (repoPath) => {
        const r = await runGit(repoPath, ['status', '--porcelain=v1', '-b']);
        if (r.error) {
          return { path: repoPath, name: path.basename(repoPath), error: r.error };
        }
        const parsed = parseGitStatus(r.stdout);
        return {
          path: repoPath,
          name: path.basename(repoPath),
          relativePath: path.relative(v.resolved, repoPath),
          ...parsed,
          changeCount: parsed.files.length,
        };
      })
    );

    statuses.sort((a, b) => {
      const aDirty = (a.changeCount || 0) + (a.ahead || 0) + (a.behind || 0);
      const bDirty = (b.changeCount || 0) + (b.ahead || 0) + (b.behind || 0);
      if (aDirty !== bDirty) return bDirty - aDirty;
      return a.name.localeCompare(b.name);
    });

    return {
      rootDir: v.resolved,
      repos: statuses,
      elapsedMs: Date.now() - startedAt,
    };
  });

  ipcMain.on('git:runInSession', (_, { sessionId, command }) => {
    interruptAndRunInShell(sessionId, command, { resetUserInput: true }).catch(() => {});
  });
}

module.exports = {
  initGitIPC,
};

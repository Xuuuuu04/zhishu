const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, typed API surface to the renderer process.
// contextIsolation: true means this runs in a separate V8 context from the renderer.
// We only expose the minimal surface needed — no raw Node.js globals leak through.
contextBridge.exposeInMainWorld('electronAPI', {
  // Config persistence
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (data) => ipcRenderer.invoke('config:save', data),
  selectDir: () => ipcRenderer.invoke('dialog:selectDir'),

  // PTY lifecycle
  createPty: (opts) => ipcRenderer.invoke('pty:create', opts),
  writePty: (sessionId, data) => ipcRenderer.send('pty:write', { sessionId, data }),
  resizePty: (sessionId, cols, rows) => ipcRenderer.send('pty:resize', { sessionId, cols, rows }),
  killPty: (sessionId) => ipcRenderer.send('pty:kill', { sessionId }),
  launchTool: (sessionId, command, toolId, toolLabel) =>
    ipcRenderer.send('pty:launch', { sessionId, command, toolId, toolLabel }),

  // System info — obtained synchronously from main process to avoid needing
  // Node.js 'os' module in preload (which is unavailable in Electron 20+ sandbox mode)
  homeDir: ipcRenderer.sendSync('system:homeDir'),

  // Listen for terminal output (returns an unsubscribe fn)
  onPtyData: (sessionId, callback) => {
    const channel = `pty:data:${sessionId}`;
    const handler = (_, data) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  onPtyExit: (sessionId, callback) => {
    const channel = `pty:exit:${sessionId}`;
    const handler = (_, code) => callback(code);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  // ── Session monitoring ──────────────────────────────────────────────────
  onSessionStatus: (sessionId, callback) => {
    const channel = `session:status:${sessionId}`;
    const handler = (_, status) => callback(status);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  updateSessionNames: (names) => ipcRenderer.send('session:updateNames', names),
  cleanupSession: (sessionId) => ipcRenderer.send('session:cleanup', sessionId),
  markSessionViewed: (sessionId) => ipcRenderer.send('session:markViewed', { sessionId }),

  // Global event: fired when an AI tool finishes its current response (busy → idle).
  // Unlike onSessionStatus which is per-session, this is broadcast across all sessions
  // so a single listener in App can show toasts and play sounds.
  onResponseComplete: (callback) => {
    const handler = (_, payload) => callback(payload);
    ipcRenderer.on('session:responseComplete', handler);
    return () => ipcRenderer.removeListener('session:responseComplete', handler);
  },

  // ── Notification preferences ────────────────────────────────────────────
  setNotificationsEnabled: (enabled) => ipcRenderer.send('notifications:setEnabled', enabled),

  // ── Window controls ─────────────────────────────────────────────────────
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop'),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:isAlwaysOnTop'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),

  // ── Tool catalog & installation ─────────────────────────────────────────
  getToolCatalog: () => ipcRenderer.invoke('tools:catalog'),
  checkAllTools: () => ipcRenderer.invoke('tools:checkAll'),
  installToolInSession: (sessionId, toolId, action) =>
    ipcRenderer.send('tools:installInSession', { sessionId, toolId, action }),

  // ── File system browsing & manipulation ────────────────────────────────
  listDir: (dirPath) => ipcRenderer.invoke('fs:listDir', dirPath),
  readFilePreview: (filePath) => ipcRenderer.invoke('fs:readFilePreview', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  revealInFinder: (filePath) => ipcRenderer.invoke('fs:reveal', filePath),
  openFile: (filePath) => ipcRenderer.invoke('fs:openFile', filePath),
  // ── File operations ────────────────────────────────────────────────────
  trashFile: (filePath) => ipcRenderer.invoke('fs:trash', filePath),
  statFile: (filePath) => ipcRenderer.invoke('fs:stat', filePath),
  renameFile: (oldPath, newName) => ipcRenderer.invoke('fs:rename', oldPath, newName),
  copyFile: (src, dest) => ipcRenderer.invoke('fs:copy', src, dest),
  moveFile: (src, dest) => ipcRenderer.invoke('fs:move', src, dest),
  zipFile: (filePath) => ipcRenderer.invoke('fs:zip', filePath),
  newFile: (dirPath, name) => ipcRenderer.invoke('fs:newFile', dirPath, name),
  newFolder: (dirPath, name) => ipcRenderer.invoke('fs:newFolder', dirPath, name),
  // ── Insert text into a pty (used for drag-drop file paths) ─────────────
  insertTextInPty: (sessionId, text) =>
    ipcRenderer.send('pty:insertText', { sessionId, text }),
  // ── HEIC → PNG conversion via macOS `sips` ─────────────────────────────
  convertHeic: (sourcePath) => ipcRenderer.invoke('fs:convertHeic', sourcePath),
  normalizeImage: (sourcePath) => ipcRenderer.invoke('fs:normalizeImage', sourcePath),
  // ── 外部文件导入（Finder 拖入） ─────────────────────────────────────────
  importExternal: (sources, targetDir) =>
    ipcRenderer.invoke('fs:importExternal', { sources, targetDir }),

  // ── Git operations ──────────────────────────────────────────────────────
  gitStatus: (cwd) => ipcRenderer.invoke('git:status', cwd),
  gitBranches: (cwd) => ipcRenderer.invoke('git:branches', cwd),
  gitLog: (cwd, limit) => ipcRenderer.invoke('git:log', cwd, limit),
  gitFileDiff: (cwd, filePath) => ipcRenderer.invoke('git:fileDiff', cwd, filePath),
  gitScanRepos: (rootDir) => ipcRenderer.invoke('git:scanRepos', rootDir),
  gitRunInSession: (sessionId, command) =>
    ipcRenderer.send('git:runInSession', { sessionId, command }),

  // ── Todo AI Chat ─────────────────────────────────────────────────────────
  // System resource monitoring (CPU, memory, battery) — pushed from main 1.5s tick
  onSystemResources: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('system:resources', handler);
    return () => ipcRenderer.removeListener('system:resources', handler);
  },
  // Returns array of provider IDs that have API keys in Keychain
  getAvailableAIProviders: (providerConfigs) =>
    ipcRenderer.invoke('todo:providers:available', providerConfigs),
  // Start a streaming AI chat request (results arrive via onTodoStream* listeners)
  startTodoChat: (opts) => ipcRenderer.send('todo:chat:start', opts),
  // Abort current in-flight request
  abortTodoChat: () => ipcRenderer.send('todo:chat:abort'),
  // Subscribe to streaming text chunks — returns unsubscribe fn
  onTodoStreamChunk: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('todo:stream:chunk', handler);
    return () => ipcRenderer.removeListener('todo:stream:chunk', handler);
  },
  // Subscribe to stream completion — returns unsubscribe fn
  onTodoStreamDone: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('todo:stream:done', handler);
    return () => ipcRenderer.removeListener('todo:stream:done', handler);
  },
  // Subscribe to stream error — returns unsubscribe fn
  onTodoStreamError: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('todo:stream:error', handler);
    return () => ipcRenderer.removeListener('todo:stream:error', handler);
  },
});

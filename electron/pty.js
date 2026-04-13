/**
 * PTY lifecycle module.
 *
 * Owns the core data structures shared with monitor, tray, and session IPC:
 *   - ptyProcesses   (Map<sessionId, ptyProcess>)
 *   - ptyMeta        (Map<sessionId, { lastOutputAt, hasUserInput }>)
 *   - sessionStatus  (Map<sessionId, status object>)
 *   - sessionLaunchedTool (Map<sessionId, { id, label }>)
 *   - notifyTimers   (Map<sessionId, timeout handle>)
 *   - sessionNames   (Map<sessionId, friendly name>)
 *
 * Other modules import these maps and the functions that operate on them.
 * This keeps the "who owns what" boundary clear: pty.js is the single owner,
 * everyone else reads/mutates through exported references.
 */

const { ipcMain, BrowserWindow } = require('electron');
const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');

// ─── Shared state (exported for monitor, tray, session IPC) ───────────────

const ptyProcesses = new Map();
const ptyMeta = new Map();
const sessionStatus = new Map();
const sessionLaunchedTool = new Map();
const notifyTimers = new Map();
const sessionNames = new Map();

// Primitive state — exported via getter/setter to avoid stale copies
let _notificationsEnabled = true;
function isNotificationsEnabled() { return _notificationsEnabled; }
function setNotificationsEnabled(v) { _notificationsEnabled = !!v; }

// node-pty is a native module — loaded lazily after app is ready
let pty;

function loadPtyModule() {
  try {
    pty = require('node-pty');
  } catch (e) {
    console.error('node-pty not available:', e.message);
  }
}

// ─── Process cleanup helpers ──────────────────────────────────────────────

function collectDescendants(rootPid) {
  try {
    const out = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8', timeout: 2000 });
    const byPpid = new Map();
    for (const line of out.trim().split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(\d+)$/);
      if (!m) continue;
      const pid = +m[1], ppid = +m[2];
      if (!byPpid.has(ppid)) byPpid.set(ppid, []);
      byPpid.get(ppid).push(pid);
    }
    const result = [];
    const queue = [rootPid];
    while (queue.length) {
      const pid = queue.shift();
      result.push(pid);
      for (const child of (byPpid.get(pid) || [])) queue.push(child);
    }
    return result;
  } catch (_) {
    return [rootPid];
  }
}

function killPtyTree(ptyProc) {
  const pids = collectDescendants(ptyProc.pid);
  for (const pid of [...pids].reverse()) {
    try { process.kill(pid, 'SIGKILL'); } catch (_) {}
  }
  try { ptyProc.kill(); } catch (_) {}
}

// ─── Shell helpers ────────────────────────────────────────────────────────

function waitForShellQuiet(sessionId, minQuietMs = 180, maxWaitMs = 1500) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const initialLastOutputAt = ptyMeta.get(sessionId)?.lastOutputAt || startedAt;

    function check() {
      const meta = ptyMeta.get(sessionId);
      if (!meta) return resolve();

      const sawPostInterruptOutput = meta.lastOutputAt > initialLastOutputAt;
      const quietForMs = Date.now() - meta.lastOutputAt;
      const waitedForMs = Date.now() - startedAt;

      if ((sawPostInterruptOutput && quietForMs >= minQuietMs) ||
          (!sawPostInterruptOutput && waitedForMs >= minQuietMs) ||
          waitedForMs >= maxWaitMs) {
        return resolve();
      }

      setTimeout(check, 40);
    }

    setTimeout(check, 40);
  });
}

async function interruptAndRunInShell(sessionId, command, { prelude = null, resetUserInput = false } = {}) {
  const proc = ptyProcesses.get(sessionId);
  if (!proc) return false;

  const meta = ptyMeta.get(sessionId);
  if (meta && resetUserInput) meta.hasUserInput = false;

  proc.write('\x03');
  await waitForShellQuiet(sessionId);

  const currentProc = ptyProcesses.get(sessionId);
  if (!currentProc) return false;

  if (prelude) currentProc.write(`${prelude}\r`);
  currentProc.write(`${command}\r`);
  return true;
}

// ─── Status broadcast helpers ─────────────────────────────────────────────

function broadcastStatus(sessionId, status) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send(`session:status:${sessionId}`, status);
  }
}

function broadcastResponseComplete(sessionId, tool, duration) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('session:responseComplete', {
      sessionId,
      tool: tool.id,
      toolLabel: tool.label,
      duration,
      sessionName: sessionNames.get(sessionId) || 'Session',
    });
  }
}

// ─── Cleanup for before-quit ──────────────────────────────────────────────

function cleanupAll() {
  for (const [, proc] of ptyProcesses) killPtyTree(proc);
  ptyProcesses.clear();
  ptyMeta.clear();
  sessionStatus.clear();
  sessionLaunchedTool.clear();
  for (const [, timer] of notifyTimers) clearTimeout(timer);
  notifyTimers.clear();
}

// ─── IPC registration ─────────────────────────────────────────────────────

function initPtyIPC() {
  ipcMain.handle('pty:create', (event, { sessionId, cwd, cols, rows }) => {
    if (!pty) return { error: 'node-pty not available' };

    const existing = ptyProcesses.get(sessionId);
    if (existing) {
      return { pid: existing.pid, reused: true };
    }

    const shell = process.env.SHELL || '/bin/zsh';
    const resolvedCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();

    const shellArgs = shell.includes('zsh') || shell.includes('bash') ? ['-i', '-l'] : [];

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: resolvedCwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: process.env.LANG || 'en_US.UTF-8',
      },
    });

    ptyProcess.onData((data) => {
      const meta = ptyMeta.get(sessionId);
      if (meta) meta.lastOutputAt = Date.now();

      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send(`pty:data:${sessionId}`, data);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      const prev = sessionStatus.get(sessionId);
      if (prev?.tool) {
        const next = {
          tool: null,
          phase: 'not_started',
          startedAt: null,
          runningStartedAt: null,
          lastRanTool: prev.tool,
          lastDuration: prev.startedAt ? Date.now() - prev.startedAt : prev.lastDuration,
        };
        broadcastStatus(sessionId, next);
      }

      ptyProcesses.delete(sessionId);
      ptyMeta.delete(sessionId);
      sessionStatus.delete(sessionId);
      sessionLaunchedTool.delete(sessionId);
      const pending = notifyTimers.get(sessionId);
      if (pending) { clearTimeout(pending); notifyTimers.delete(sessionId); }

      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send(`pty:exit:${sessionId}`, exitCode);
      }
    });

    ptyProcesses.set(sessionId, ptyProcess);
    ptyMeta.set(sessionId, { lastOutputAt: Date.now(), hasUserInput: false });
    return { pid: ptyProcess.pid };
  });

  ipcMain.on('pty:write', (_, { sessionId, data }) => {
    const proc = ptyProcesses.get(sessionId);
    if (!proc) {
      console.warn(`[pty:write] no pty for session ${sessionId?.slice(0, 8)} — input dropped`);
      return;
    }
    proc.write(data);

    if (data && (data.includes('\r') || data.includes('\n'))) {
      const meta = ptyMeta.get(sessionId);
      if (meta) meta.hasUserInput = true;
    }
  });

  ipcMain.on('pty:resize', (_, { sessionId, cols, rows }) => {
    const proc = ptyProcesses.get(sessionId);
    if (proc) {
      try { proc.resize(cols, rows); } catch (_) {}
    }
  });

  ipcMain.on('pty:kill', (_, { sessionId }) => {
    const proc = ptyProcesses.get(sessionId);
    if (proc) {
      killPtyTree(proc);
      ptyProcesses.delete(sessionId);
      ptyMeta.delete(sessionId);
    }
  });

  ipcMain.on('pty:insertText', (_, { sessionId, text }) => {
    const proc = ptyProcesses.get(sessionId);
    if (!proc) return;
    proc.write(text);
  });

  ipcMain.on('pty:launch', (_, { sessionId, command, toolId, toolLabel }) => {
    if (toolId) {
      sessionLaunchedTool.set(sessionId, { id: toolId, label: toolLabel || toolId });
    }
    interruptAndRunInShell(sessionId, command, { resetUserInput: true }).catch(() => {});
  });

  // Session metadata & notifications
  ipcMain.on('session:updateNames', (_, names) => {
    sessionNames.clear();
    for (const [id, name] of Object.entries(names)) {
      sessionNames.set(id, name);
    }
  });

  ipcMain.on('notifications:setEnabled', (_, enabled) => {
    setNotificationsEnabled(enabled);
  });

  ipcMain.on('session:cleanup', (_, sessionId) => {
    sessionStatus.delete(sessionId);
    sessionNames.delete(sessionId);
    sessionLaunchedTool.delete(sessionId);
    const pending = notifyTimers.get(sessionId);
    if (pending) { clearTimeout(pending); notifyTimers.delete(sessionId); }
  });
}

module.exports = {
  // Shared state maps
  ptyProcesses,
  ptyMeta,
  sessionStatus,
  sessionLaunchedTool,
  notifyTimers,
  sessionNames,

  // Primitive state accessors
  isNotificationsEnabled,
  setNotificationsEnabled,

  // Functions
  loadPtyModule,
  killPtyTree,
  interruptAndRunInShell,
  broadcastStatus,
  broadcastResponseComplete,
  cleanupAll,
  initPtyIPC,
};

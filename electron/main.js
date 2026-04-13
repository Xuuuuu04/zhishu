const { app, BrowserWindow, ipcMain, dialog, Notification, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile, execFileSync } = require('child_process');
const { parseGitStatus } = require('./gitStatus');

// node-pty is a native module — loaded lazily after app is ready
let pty;

// Map: sessionId -> ptyProcess
const ptyProcesses = new Map();

// Map: sessionId -> { lastOutputAt: number, hasUserInput: boolean }
//
// lastOutputAt — timestamp of the pty's most recent stdout byte, used to
//                detect the busy/quiet transition (= "AI finished responding")
// hasUserInput — set to true once we observe the user pressing Enter (\r).
//                This is the signal separating '未指令' (never instructed)
//                from '运行后待审查' (finished a real instruction).
//                Reset to false whenever a new AI tool is launched.
const ptyMeta = new Map();

// Map: sessionId -> { tool, label, phase, startedAt, runningStartedAt }
//
// phase ∈ {
//   'not_started'        — no AI process in this session (未启动)
//   'idle_no_instruction' — AI running but user hasn't sent a command yet (未指令)
//   'running'            — user sent a command, AI is actively outputting (运行中)
//   'awaiting_review'    — AI finished generating, awaiting user review (运行后待审查)
// }
const sessionStatus = new Map();

// Map: sessionId -> setTimeout handle
//
// Debounce for "response complete" notifications. When a session transitions
// running → awaiting_review we don't fire the toast/notification immediately.
// Instead we schedule a delayed check: if the session STAYS in awaiting_review
// for NOTIFY_DEBOUNCE_MS, then we fire. If it flips back to running before
// then (AI was just pausing to think / fetch / call a tool), we cancel.
//
// This prevents the "reminder spam during a single AI turn" issue where a
// long Claude response with multiple tool-call pauses fires several toasts.
const notifyTimers = new Map();
const NOTIFY_DEBOUNCE_MS = 3500;

// Map: sessionId -> { id, label } of the most recently launched tool
//
// IMPORTANT: GLM and MiniMax spawn the *same* `claude` binary with different
// ANTHROPIC_BASE_URL env vars. From `ps` they're indistinguishable. So when
// the renderer launches a tool, it declares its INTENDED id here. Monitor
// tick prefers this declared id over command-line regex matching whenever a
// claude descendant is detected.
const sessionLaunchedTool = new Map();

// Silence threshold (ms) after which we consider an AI tool "done responding".
// Claude/Codex/Gemini emit spinner frames every ~100-300ms while processing,
// but tool calls (Read / Bash / Edit) can pause for 1-3 seconds between bursts.
// 3 seconds is a safer threshold — combined with NOTIFY_DEBOUNCE_MS (3.5s),
// the total "confirmed idle" time is ~6.5s before notification fires.
const IDLE_SILENCE_MS = 3000;

// User preference: whether to show desktop notifications on completion
let notificationsEnabled = true;

// Persist sessions config
const CONFIG_PATH = path.join(os.homedir(), '.ai-terminal-manager.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return { projects: [] };
}

function saveConfig(data) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;

  // When the user clicks the red traffic light, hide to the menu bar instead
  // of quitting. On the FIRST time, show a one-shot info dialog so the user
  // knows the app is still running and how to fully exit.
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();

      if (!hasShownHideHint) {
        hasShownHideHint = true;
        // Non-blocking — dialog.showMessageBox returns a Promise on macOS
        dialog.showMessageBox(null, {
          type: 'info',
          title: '智枢正在后台运行',
          message: '智枢已收起到菜单栏，所有 AI 会话仍在继续。',
          detail: '点击菜单栏图标可重新打开窗口。\n右键菜单栏图标 → 退出，可完全关闭并终止所有进程。',
          buttons: ['知道了'],
          defaultId: 0,
        });
      }
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_START_URL;
  const url = process.env.ELECTRON_START_URL || 'http://localhost:3000';
  console.log('[main] isDev:', isDev, '| loading:', isDev ? url : 'build/index.html');

  if (isDev) {
    win.loadURL(url);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../build/index.html'));
  }

  // Capture renderer-process JS errors into the main process log
  win.webContents.on('console-message', (_, level, message, line, sourceId) => {
    const levelName = ['verbose', 'info', 'warning', 'error'][level] || 'log';
    if (level >= 2) {  // warning and error only
      console.log(`[renderer:${levelName}] ${message}  (${sourceId}:${line})`);
    }
  });

  win.webContents.on('did-fail-load', (_, code, desc, url) => {
    console.error('[main] did-fail-load:', code, desc, url);
  });

  win.webContents.on('render-process-gone', (_, details) => {
    console.error('[main] render-process-gone:', details);
  });

  return win;
}

// ─── Process monitoring ──────────────────────────────────────────────────────
//
// Strategy: once every 1.5s, take ONE snapshot of all processes with `ps -axo pid,ppid,command`
// (one execFile call → cheap and safe), build a child-lookup map, then BFS each pty's
// process tree looking for known AI CLIs. This catches wrappers (e.g. glmcode is a shell
// function that eventually exec's `claude`), tools that fork subprocesses, etc.
//
// State transitions (idle ↔ running) trigger:
//   • UI updates via IPC to the renderer ("currently running claude for 00:45")
//   • Desktop notifications with sound when a long-running task finishes

// Known AI CLI tools — regex matched against the full command line of each descendant.
const AI_TOOL_MATCHERS = [
  { id: 'claude',   label: 'Claude',    regex: /(^|\/|\s)claude(\s|$)/ },
  { id: 'codex',    label: 'Codex',     regex: /(^|\/|\s)codex(\s|$)/ },
  { id: 'gemini',   label: 'Gemini',    regex: /(^|\/|\s)gemini(\s|$)/ },
  { id: 'qwen',     label: 'Qwen',      regex: /(^|\/|\s)qwen(\s|$)/ },
  { id: 'opencode', label: 'OpenCode',  regex: /(^|\/|\s)opencode(\s|$)/ },
];

// ─── Tool & Provider Catalog ──────────────────────────────────────────────
//
// Single source of truth for:
//   • the commands used to probe / install / upgrade each AI CLI
//   • the environment-variable recipes for Anthropic-compatible providers
//     (GLM, MiniMax) that reuse the `claude` binary
//
// Frontend reads this via IPC (tools:catalog). Providers are mergeable —
// the persisted config only stores user overrides (API key etc.); defaults
// come from here.
// Each tool entry includes:
//   continueArgs — the args to resume the most recent session in the CURRENT cwd
//                  (subtle differences per tool, verified by reading their --help)
//   memoryFile  — the per-project markdown file the tool reads as project context
const TOOL_CATALOG = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    kind: 'native',
    command: 'claude',
    versionArgs: ['--version'],
    installCmd: 'curl -fsSL https://claude.ai/install.sh | bash',
    upgradeCmd: 'curl -fsSL https://claude.ai/install.sh | bash',
    yoloFlag: '--dangerously-skip-permissions',
    continueArgs: '--continue',     // claude -c also works
    memoryFile: 'CLAUDE.md',
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    kind: 'npm',
    command: 'codex',
    versionArgs: ['--version'],
    installCmd: 'npm install -g @openai/codex',
    upgradeCmd: 'npm update -g @openai/codex',
    yoloFlag: '--dangerously-bypass-approvals-and-sandbox',
    continueArgs: 'resume --last',  // codex uses subcommand syntax
    memoryFile: 'AGENTS.md',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini CLI',
    kind: 'npm',
    command: 'gemini',
    versionArgs: ['--version'],
    installCmd: 'npm install -g @google/gemini-cli',
    upgradeCmd: 'npm update -g @google/gemini-cli',
    yoloFlag: '-y',
    continueArgs: '--resume latest',  // no --continue, must use --resume latest
    memoryFile: 'GEMINI.md',
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen Code',
    kind: 'npm',
    command: 'qwen',
    versionArgs: ['--version'],
    installCmd: 'npm install -g @qwen-code/qwen-code',
    upgradeCmd: 'npm update -g @qwen-code/qwen-code',
    yoloFlag: '-y',
    continueArgs: '--continue',
    memoryFile: 'QWEN.md',
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    kind: 'npm',
    command: 'opencode',
    versionArgs: ['--version'],
    installCmd: 'npm install -g opencode-ai',
    upgradeCmd: 'opencode upgrade',
    yoloFlag: null,
    continueArgs: '--continue',
    memoryFile: 'AGENTS.md',
  },
};

const PROVIDER_CATALOG = {
  glm: {
    id: 'glm',
    name: 'GLM Code',
    baseTool: 'claude',       // uses the claude binary with env overrides
    configurable: true,       // requires user to set API key
    defaults: {
      baseUrl: 'https://open.bigmodel.cn/api/anthropic',
      opusModel: 'glm-5.1',
      sonnetModel: 'glm-5.1',
      haikuModel: 'glm-5-turbo',
    },
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    baseTool: 'claude',
    configurable: true,
    defaults: {
      baseUrl: 'https://api.minimaxi.com/anthropic',
      opusModel: 'MiniMax-M2.7-highspeed',
      sonnetModel: 'MiniMax-M2.7-highspeed',
      haikuModel: 'MiniMax-M2.7-highspeed',
    },
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi Code',
    baseTool: 'claude',       // uses the claude binary with env overrides
    configurable: true,       // requires user to set API key
    defaults: {
      baseUrl: 'https://api.kimi.com/coding',
      opusModel: 'kimi-for-coding',
      sonnetModel: 'kimi-for-coding',
      haikuModel: 'kimi-for-coding',
    },
  },
};

function snapshotProcesses() {
  return new Promise((resolve) => {
    // execFile avoids shell injection; args are passed as an array
    execFile('ps', ['-axo', 'pid=,ppid=,command='],
      { maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve({ ok: false, byPpid: new Map(), byPid: new Map() });

        const byPpid = new Map();
        const byPid = new Map();
        const lines = stdout.split('\n');

        for (const line of lines) {
          const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
          if (!m) continue;
          const proc = { pid: +m[1], ppid: +m[2], command: m[3] };
          byPid.set(proc.pid, proc);
          if (!byPpid.has(proc.ppid)) byPpid.set(proc.ppid, []);
          byPpid.get(proc.ppid).push(proc);
        }
        resolve({ ok: true, byPpid, byPid });
      });
  });
}

/**
 * BFS the process tree rooted at `shellPid`. Returns the first AI tool found.
 */
function findActiveAITool(shellPid, byPpid) {
  const visited = new Set();
  const queue = [shellPid];

  while (queue.length) {
    const pid = queue.shift();
    if (visited.has(pid)) continue;
    visited.add(pid);

    const children = byPpid.get(pid) || [];
    for (const child of children) {
      for (const tool of AI_TOOL_MATCHERS) {
        if (tool.regex.test(child.command)) {
          return tool;
        }
      }
      queue.push(child.pid);
    }
  }
  return null;
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function sendCompletionNotification(sessionName, tool, duration) {
  if (!notificationsEnabled || !Notification.isSupported()) return;

  try {
    const notif = new Notification({
      title: `${tool.label} 响应完成`,
      body: `${sessionName} · 耗时 ${formatDuration(duration)} · 点击查看`,
      silent: false,
      sound: 'Glass',  // macOS system sound
    });

    // Clicking the system notification focuses the app window
    notif.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    });

    notif.show();
  } catch (e) {
    console.error('Failed to show notification:', e);
  }
}

// sessionId -> friendly name (kept in sync via IPC from renderer)
const sessionNames = new Map();

// ─── Four-state monitor state machine ──────────────────────────────────────
//
// Phases:
//   not_started         - no AI process (未启动)
//   idle_no_instruction - AI running, user hasn't sent a command yet (未指令)
//   running             - user sent command, AI actively outputting (运行中)
//   awaiting_review     - AI finished responding to a real command (运行后待审查) → 🔔
//
// Transition rules:
//   no AI             → idle_no_instruction  (when AI tool appears in ps tree)
//   idle_no_instruction → running            (user pressed Enter + AI emitting output)
//   running           → awaiting_review      (output silent > IDLE_SILENCE_MS) → NOTIFY
//   awaiting_review   → running              (user pressed Enter + AI emitting output)
//   any               → not_started          (AI process gone from ps tree)

function computePhase({ hasUserInput, isOutputting }) {
  if (!hasUserInput) return 'idle_no_instruction';
  return isOutputting ? 'running' : 'awaiting_review';
}

async function monitorTick() {
  if (ptyProcesses.size === 0) return;

  const { ok, byPpid } = await snapshotProcesses();
  if (!ok) return;
  const now = Date.now();

  for (const [sessionId, ptyProc] of ptyProcesses) {
    let activeTool = findActiveAITool(ptyProc.pid, byPpid);

    // ── Disambiguate claude vs GLM vs MiniMax via the declared launch intent ──
    // GLM and MiniMax both spawn the SAME claude binary with different env vars,
    // so findActiveAITool always returns 'claude' for them. Override with the
    // declared launchedTool when we have one and the detected tool is claude.
    if (activeTool && activeTool.id === 'claude') {
      const declared = sessionLaunchedTool.get(sessionId);
      if (declared && (declared.id === 'glm' || declared.id === 'minimax' || declared.id === 'kimi')) {
        activeTool = { id: declared.id, label: declared.label };
      }
    }

    const prev = sessionStatus.get(sessionId) || {
      tool: null, phase: 'not_started', startedAt: null, runningStartedAt: null,
    };
    const meta = ptyMeta.get(sessionId);

    // ── CASE 1: AI tool is present in the process tree ─────────────────
    if (activeTool) {
      const silenceMs = meta ? now - meta.lastOutputAt : Infinity;
      const isOutputting = silenceMs < IDLE_SILENCE_MS;
      const hasUserInput = !!meta?.hasUserInput;
      const phase = computePhase({ hasUserInput, isOutputting });

      // A new tool was launched (or a completely different tool took over)
      if (!prev.tool || prev.tool !== activeTool.id) {
        const next = {
          tool: activeTool.id,
          label: activeTool.label,
          phase,
          startedAt: now,
          runningStartedAt: phase === 'running' ? now : null,
        };
        sessionStatus.set(sessionId, next);
        broadcastStatus(sessionId, next);
      }
      // Same tool, just a phase change
      else if (prev.phase !== phase) {
        const next = {
          ...prev,
          phase,
          runningStartedAt: phase === 'running' ? now : prev.runningStartedAt,
        };
        sessionStatus.set(sessionId, next);
        broadcastStatus(sessionId, next);

        // ── Transition A: running → awaiting_review ─────────────────
        // Schedule a DEBOUNCED notification. If the session stays idle for
        // NOTIFY_DEBOUNCE_MS, we fire. Otherwise (AI resumes output), the
        // timer gets cancelled when we hit the reverse transition below.
        if (prev.phase === 'running' && phase === 'awaiting_review' && prev.runningStartedAt) {
          const responseDuration = now - prev.runningStartedAt;

          // Clear any existing pending timer first
          const existing = notifyTimers.get(sessionId);
          if (existing) clearTimeout(existing);

          // Ignore very short bursts (startup flicker, echoing prompts, etc.)
          if (responseDuration >= 2000) {
            const capturedTool = activeTool;
            const capturedSessionId = sessionId;
            const capturedDuration = responseDuration;

            const timer = setTimeout(() => {
              notifyTimers.delete(capturedSessionId);
              // Re-check that we're STILL in awaiting_review — if the AI
              // resumed between schedule and fire, abort.
              const current = sessionStatus.get(capturedSessionId);
              if (current?.phase !== 'awaiting_review') return;

              broadcastResponseComplete(capturedSessionId, capturedTool, capturedDuration);
              const sessionName = sessionNames.get(capturedSessionId) || 'Session';
              sendCompletionNotification(sessionName, capturedTool, capturedDuration);
            }, NOTIFY_DEBOUNCE_MS);

            notifyTimers.set(sessionId, timer);
          }
        }

        // ── Transition B: awaiting_review → running (AI resumed) ─────
        // The user was about to be notified, but the AI kept thinking/working.
        // Cancel the pending notification — this was just a tool-call pause.
        if (prev.phase === 'awaiting_review' && phase === 'running') {
          const pending = notifyTimers.get(sessionId);
          if (pending) {
            clearTimeout(pending);
            notifyTimers.delete(sessionId);
          }
        }
      }
    }
    // ── CASE 2: AI tool fully exited (no descendant process) ───────────
    else if (prev.tool) {
      const duration = now - (prev.startedAt || now);
      const next = {
        tool: null,
        phase: 'not_started',
        startedAt: null,
        runningStartedAt: null,
        lastRanTool: prev.tool,
        lastDuration: duration,
      };
      sessionStatus.set(sessionId, next);
      broadcastStatus(sessionId, next);

      // Reset state for the next launch + cancel any pending notification
      if (meta) meta.hasUserInput = false;
      sessionLaunchedTool.delete(sessionId);
      const pending = notifyTimers.get(sessionId);
      if (pending) { clearTimeout(pending); notifyTimers.delete(sessionId); }
    }
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

function broadcastStatus(sessionId, status) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send(`session:status:${sessionId}`, status);
  }
}

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

let monitorInterval = null;
let tray = null;
let mainWindow = null;
let hasShownHideHint = false;  // one-time hint: "app moved to menu bar"

// ─── Process cleanup helpers ──────────────────────────────────────────────────
//
// node-pty's proc.kill() only sends SIGHUP to the pty master. The shell exits
// but its children (claude, codex, etc.) are reparented to init and keep running.
// We must synchronously collect the entire process subtree and SIGKILL all of them.
//
// We use execFileSync (synchronous) because before-quit cannot await promises.
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
  // Kill children first (reverse BFS order), then the shell itself
  for (const pid of [...pids].reverse()) {
    try { process.kill(pid, 'SIGKILL'); } catch (_) {}
  }
  // node-pty cleanup (closes file descriptors, removes from internal map)
  try { ptyProc.kill(); } catch (_) {}
}

// ─── Tray (macOS menu bar resident) ─────────────────────────────────────────
//
// Generates a tiny 16x16 PNG with a stylized "Z" icon entirely in code so we
// don't need to ship a separate asset file. Uses Electron's nativeImage API.
// On macOS we mark it as a template image so it auto-adapts to dark/light bar.

function createTrayIcon() {
  // Minimal 16x16 black PNG with a centered "Z"-like glyph (template image style).
  // Encoded as base64 to avoid bundling a binary file.
  const ICON_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAvklEQVQ4je3SsUoDQRDG8d/u' +
    'JeJZJEEIBgvBQrCwsLCwsLCwsLCwsLAQ7HwAH8DCwsLCwsLCwsLCRrCwsLCwELERG7GwsLCw' +
    'sLCw8AECCQpJTHaLnbvN3eXuuLuZ+f5nZvcm/qcQqupJaT0xs7u4Wb5fPS9+/wAGgGwLYBjY' +
    'BBaBR8DDAvAAvAC2gCMzm4ImYAGYAhaBBaACvALOgCowAayY2VRzPi3gXFXfgAvgBDgBToED' +
    'YA1YAFaABWAFWASOgRPgxMzeAW0YS5IAQTKxAAAAAElFTkSuQmCC';
  return nativeImage.createFromBuffer(Buffer.from(ICON_BASE64, 'base64'));
}

function buildTrayMenu() {
  const totalSessions = Array.from(sessionStatus.values())
    .filter((s) => s.tool && s.phase !== 'not_started').length;
  const reviewCount = Array.from(sessionStatus.values())
    .filter((s) => s.phase === 'awaiting_review').length;

  return Menu.buildFromTemplate([
    {
      label: `智枢 ZhiShu`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: `运行中: ${totalSessions}`,
      enabled: false,
    },
    {
      label: `待审查: ${reviewCount}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '显示窗口',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: '隐藏窗口',
      click: () => mainWindow?.hide(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray() {
  try {
    const icon = createTrayIcon();
    icon.setTemplateImage(true);  // adapts to macOS dark/light menu bar
    tray = new Tray(icon);
    tray.setToolTip('智枢 · ZhiShu AI Hub');
    tray.setContextMenu(buildTrayMenu());

    // Click the tray icon → toggle main window
    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (e) {
    console.error('Tray init failed:', e);
  }
}

// Refresh tray menu periodically so the session counts stay accurate
function refreshTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

app.whenReady().then(() => {
  // Load node-pty after app ready (native module)
  try {
    pty = require('node-pty');
  } catch (e) {
    console.error('node-pty not available:', e.message);
  }

  createWindow();
  createTray();

  // Start process monitor (1.5s cadence — responsive without being noisy).
  // monitorTick() is async (spawns `ps`). Using a guard flag prevents overlapping
  // invocations when ps is slow (e.g. many processes), which would pile up child
  // processes and delay IPC message handling (making key input feel "stuck").
  let monitorRunning = false;
  monitorInterval = setInterval(async () => {
    if (!monitorRunning) {
      monitorRunning = true;
      try { await monitorTick(); } catch (_) {}
      monitorRunning = false;
    }
    refreshTrayMenu();
  }, 1500);

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
});

// On macOS we keep the app running in the menu bar even when all windows close
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (monitorInterval) clearInterval(monitorInterval);
    for (const [, proc] of ptyProcesses) killPtyTree(proc);
    ptyProcesses.clear();
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (monitorInterval) { clearInterval(monitorInterval); monitorInterval = null; }

  // Kill every pty shell AND all its AI-tool children (SIGKILL for reliability)
  for (const [, proc] of ptyProcesses) killPtyTree(proc);
  ptyProcesses.clear();
  ptyMeta.clear();
  sessionStatus.clear();
  sessionLaunchedTool.clear();

  if (tray) { tray.destroy(); tray = null; }
});

// ─── IPC: System ────────────────────────────────────────────────────────────

// Synchronous handler — preload calls this at startup to get homeDir
// (avoids needing `require('os')` in sandboxed preload context)
ipcMain.on('system:homeDir', (event) => {
  event.returnValue = os.homedir();
});

// ─── IPC: Window controls ───────────────────────────────────────────────────

// Toggle always-on-top. Uses 'floating' level so it stays above normal app
// windows but below full-screen apps. Returns the new state.
ipcMain.handle('window:toggleAlwaysOnTop', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  const next = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(next, 'floating');
  return next;
});

ipcMain.handle('window:isAlwaysOnTop', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isAlwaysOnTop() : false;
});

// ─── IPC: Config ────────────────────────────────────────────────────────────

ipcMain.handle('config:load', () => loadConfig());

ipcMain.handle('config:save', (_, data) => {
  saveConfig(data);
  return true;
});

ipcMain.handle('dialog:selectDir', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

// ─── IPC: File tree ────────────────────────────────────────────────────────
//
// Lazy directory listing — returns immediate children only. The renderer
// requests sub-children when the user expands a folder. This avoids reading
// huge directories upfront and keeps the UI snappy.

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.cache',
  'dist', 'build', '.DS_Store', '__pycache__', '.venv', 'venv',
  '.pytest_cache', '.mypy_cache', 'target', '.idea', '.vscode',
]);

ipcMain.handle('fs:listDir', async (_, dirPath) => {
  if (!dirPath || typeof dirPath !== 'string') return { error: 'Invalid path' };
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const items = entries
      // Show ALL files and directories — including hidden dotfiles like .env, .git, .config
      // Only skip the noisy build/cache directories defined in IGNORED_DIRS
      .filter((e) => !(e.isDirectory() && IGNORED_DIRS.has(e.name)))
      .map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
        path: path.join(dirPath, e.name),
        // Mark hidden so the renderer can de-emphasize visually
        hidden: e.name.startsWith('.'),
      }))
      // Sort: directories first, then alphabetical (hidden mixed in naturally)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    return { items };
  } catch (e) {
    return { error: e.message };
  }
});

// ─── IPC: Git ───────────────────────────────────────────────────────────────
//
// Lightweight git wrapper — uses execFile (no shell injection) and returns
// structured data the renderer can render directly. All commands run with
// the project directory as cwd.

function runGit(cwd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 5000, maxBuffer: 4 * 1024 * 1024, ...opts },
      (err, stdout, stderr) => {
        if (err) return resolve({ error: stderr || err.message });
        resolve({ stdout: stdout || '' });
      });
  });
}

ipcMain.handle('git:status', async (_, cwd) => {
  if (!cwd) return { error: 'No cwd' };
  const r = await runGit(cwd, ['status', '--porcelain=v1', '-b']);
  if (r.error) return { isRepo: false, error: r.error };
  return { isRepo: true, ...parseGitStatus(r.stdout) };
});

ipcMain.handle('git:branches', async (_, cwd) => {
  if (!cwd) return { error: 'No cwd' };
  const r = await runGit(cwd, ['branch', '-a', '--no-color']);
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
  // Use a custom format with NUL separators to safely parse arbitrary commit messages
  const fmt = '%h%x1f%an%x1f%ar%x1f%s%x1e';
  const r = await runGit(cwd, ['log', `--pretty=format:${fmt}`, `-${limit}`, '--no-color']);
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
  const r = await runGit(cwd, ['diff', '--no-color', '--', filePath]);
  if (r.error) return { error: r.error };
  return { diff: r.stdout };
});

// ─── Recursive git repo scanner ─────────────────────────────────────────────
//
// Walks the filesystem tree starting from `rootDir`, looking for directories
// that contain `.git` (i.e. are git repository roots). When a repo is found
// we DO NOT recurse into it (avoids submodule descent and explosion in node_modules).
//
// Then we run `git status` on each repo in PARALLEL (Promise.all). For 20-30
// repos this typically completes in 200-500ms.

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

    // If this directory itself contains .git → it's a repo. Record and stop.
    if (entries.some((e) => e.name === '.git' && (e.isDirectory() || e.isFile()))) {
      results.push(dir);
      return;
    }

    // Otherwise recurse into non-ignored subdirectories
    const subDirs = entries.filter(
      (e) => e.isDirectory() && !SCAN_IGNORED.has(e.name) && !e.name.startsWith('.')
    );
    await Promise.all(subDirs.map((e) => walk(path.join(dir, e.name), depth + 1)));
  }

  await walk(rootDir, 0);
  return results;
}

ipcMain.handle('git:scanRepos', async (_, rootDir) => {
  if (!rootDir) return { error: 'No rootDir' };

  const startedAt = Date.now();
  const repoPaths = await scanGitRepoPaths(rootDir);

  // Probe status for each repo in parallel — bail early on slow ones
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
        relativePath: path.relative(rootDir, repoPath),
        ...parsed,
        changeCount: parsed.files.length,
      };
    })
  );

  // Sort: dirty repos first, then ahead/behind, then alphabetical
  statuses.sort((a, b) => {
    const aDirty = (a.changeCount || 0) + (a.ahead || 0) + (a.behind || 0);
    const bDirty = (b.changeCount || 0) + (b.ahead || 0) + (b.behind || 0);
    if (aDirty !== bDirty) return bDirty - aDirty;
    return a.name.localeCompare(b.name);
  });

  return {
    rootDir,
    repos: statuses,
    elapsedMs: Date.now() - startedAt,
  };
});

// Run a git command inside a session's pty so the user can see the output
// and interact (e.g. enter credentials for push).
ipcMain.on('git:runInSession', (_, { sessionId, command }) => {
  interruptAndRunInShell(sessionId, command, { resetUserInput: true }).catch(() => {});
});

// Check if a file exists at the given path
ipcMain.handle('fs:exists', async (_, filePath) => {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
});

// Write a text file (used by template system + Agent config quick-create)
ipcMain.handle('fs:writeFile', async (_, filePath, content) => {
  try {
    // Make sure the parent directory exists
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

// Reveal file/directory in Finder (or open with default app)
const { shell } = require('electron');
ipcMain.handle('fs:reveal', async (_, filePath) => {
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
      shell.openPath(filePath);
    } else {
      shell.showItemInFolder(filePath);
    }
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('fs:openFile', async (_, filePath) => {
  try {
    await shell.openPath(filePath);
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

// ─── File operations (delete / rename / copy / move / zip / new) ──────────
//
// All operations use Node's fs.promises API except:
//   • trash → uses shell.trashItem (sends to system Trash, not permanent delete)
//   • zip   → shells out to system `zip` command via execFile

// Send to Trash (safer than permanent delete)
ipcMain.handle('fs:trash', async (_, filePath) => {
  try {
    await shell.trashItem(filePath);
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

// Get file size + stat info (used by FileTree to display "1.2 KB" labels)
ipcMain.handle('fs:stat', async (_, filePath) => {
  try {
    const stat = await fs.promises.stat(filePath);
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

// Rename a file/directory in-place (no path traversal — newName must be a basename)
ipcMain.handle('fs:rename', async (_, oldPath, newName) => {
  try {
    if (typeof newName !== 'string' || newName.includes('/') || newName.includes('\\')) {
      return { error: 'newName 必须是文件名（不含路径分隔符）' };
    }
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);
    await fs.promises.rename(oldPath, newPath);
    return { ok: true, newPath };
  } catch (e) {
    return { error: e.message };
  }
});

// Recursive copy — works for files and directories
ipcMain.handle('fs:copy', async (_, src, dest) => {
  try {
    await fs.promises.cp(src, dest, { recursive: true, errorOnExist: false, force: true });
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

// Move = rename across paths (works within same filesystem)
ipcMain.handle('fs:move', async (_, src, dest) => {
  try {
    await fs.promises.rename(src, dest);
    return { ok: true };
  } catch (e) {
    // Cross-filesystem move falls back to copy + delete
    if (e.code === 'EXDEV') {
      try {
        await fs.promises.cp(src, dest, { recursive: true });
        await fs.promises.rm(src, { recursive: true, force: true });
        return { ok: true };
      } catch (e2) {
        return { error: e2.message };
      }
    }
    return { error: e.message };
  }
});

// Create a zip archive of the given file/directory using the system `zip` command
// Output is placed alongside the source: foo/ → foo/foo.zip
ipcMain.handle('fs:zip', async (_, srcPath) => {
  return new Promise((resolve) => {
    const dir = path.dirname(srcPath);
    const name = path.basename(srcPath);
    const zipName = `${name}.zip`;
    const zipPath = path.join(dir, zipName);
    // Run from dir so the archive uses relative paths inside
    execFile('zip', ['-r', '-q', zipName, name], { cwd: dir, timeout: 60000 }, (err) => {
      if (err) return resolve({ error: err.message });
      resolve({ ok: true, path: zipPath });
    });
  });
});

// Create an empty file (fails if it exists)
ipcMain.handle('fs:newFile', async (_, dirPath, name) => {
  try {
    if (typeof name !== 'string' || name.includes('/') || name.includes('\\')) {
      return { error: '文件名必须不含路径分隔符' };
    }
    const filePath = path.join(dirPath, name);
    await fs.promises.writeFile(filePath, '', { flag: 'wx' });
    return { ok: true, path: filePath };
  } catch (e) {
    return { error: e.message };
  }
});

// Create an empty directory
ipcMain.handle('fs:newFolder', async (_, dirPath, name) => {
  try {
    if (typeof name !== 'string' || name.includes('/') || name.includes('\\')) {
      return { error: '文件夹名必须不含路径分隔符' };
    }
    const folderPath = path.join(dirPath, name);
    await fs.promises.mkdir(folderPath);
    return { ok: true, path: folderPath };
  } catch (e) {
    return { error: e.message };
  }
});

// Insert one or more file paths into a session's pty as quoted text.
// Used by file-tree drag-drop into the terminal area — the AI tool can then
// reference the path. We DO NOT send Enter; the user decides what to do next.
ipcMain.on('pty:insertText', (_, { sessionId, text }) => {
  const proc = ptyProcesses.get(sessionId);
  if (!proc) return;
  proc.write(text);
});

// ─── HEIC → PNG conversion (macOS only, via built-in `sips`) ──────────────
//
// macOS screenshots default to HEIC format since Ventura, which most AI CLI
// tools don't understand. `sips` is a system-provided image processor that
// can convert to PNG in ~50ms with zero extra dependencies.
//
// Output goes to the system temp dir with a unique timestamp so repeated
// drops of the same file don't clobber each other.
ipcMain.handle('fs:convertHeic', async (_, sourcePath) => {
  if (!sourcePath) return { error: 'No source path' };
  return new Promise((resolve) => {
    const baseName = path.basename(sourcePath, path.extname(sourcePath));
    const outputPath = path.join(
      os.tmpdir(),
      `zhishu-${baseName}-${Date.now()}.png`
    );
    execFile('sips',
      ['-s', 'format', 'png', sourcePath, '--out', outputPath],
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

// ─── Generic image → PNG conversion ────────────────────────────────────────
// Catches HEIC, TIFF, BMP, and anything else sips can handle. Returns the
// original path untouched if it's already in a web-friendly format.
ipcMain.handle('fs:normalizeImage', async (_, sourcePath) => {
  if (!sourcePath) return { error: 'No source path' };
  const ext = path.extname(sourcePath).toLowerCase();
  const WEB_SAFE = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
  if (WEB_SAFE.includes(ext)) {
    return { ok: true, path: sourcePath, converted: false };
  }
  // Fall through to sips-based conversion
  return new Promise((resolve) => {
    const baseName = path.basename(sourcePath, ext);
    const outputPath = path.join(
      os.tmpdir(),
      `zhishu-${baseName}-${Date.now()}.png`
    );
    execFile('sips',
      ['-s', 'format', 'png', sourcePath, '--out', outputPath],
      { timeout: 10000 },
      (err, stdout, stderr) => {
        if (err) return resolve({ error: stderr || err.message });
        resolve({ ok: true, path: outputPath, converted: true });
      }
    );
  });
});

// Read the first ~10KB of a file as text (for the file preview pane)
ipcMain.handle('fs:readFilePreview', async (_, filePath) => {
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > 1024 * 1024) return { error: 'File too large (>1MB)' };
    if (stat.isDirectory()) return { error: 'Is a directory' };
    const buffer = Buffer.alloc(Math.min(stat.size, 10 * 1024));
    const fd = await fs.promises.open(filePath, 'r');
    await fd.read(buffer, 0, buffer.length, 0);
    await fd.close();
    return { content: buffer.toString('utf-8'), size: stat.size };
  } catch (e) {
    return { error: e.message };
  }
});

// ─── IPC: Tool catalog & installation ───────────────────────────────────────

// Return the static catalog of tools + providers so the renderer can render
// buttons without hardcoding any command strings.
ipcMain.handle('tools:catalog', () => ({
  tools: TOOL_CATALOG,
  providers: PROVIDER_CATALOG,
}));

/**
 * Check whether a command exists on PATH AND, if so, what version it reports.
 * Uses execFile to avoid shell injection. Runs in a zsh login shell so that
 * PATH extensions from ~/.zshrc (nvm, brew shellenv, etc.) are picked up.
 */
function checkToolInstalled(tool) {
  return new Promise((resolve) => {
    // Use `command -v` in a login shell so that PATH includes user additions
    // (nvm-installed node, ~/.local/bin, etc.). This is more portable than `which`.
    const shellProbe = `command -v ${tool.command} >/dev/null 2>&1 && ${tool.command} ${tool.versionArgs.join(' ')} 2>&1 || echo __NOT_INSTALLED__`;
    execFile('zsh', ['-i', '-l', '-c', shellProbe],
      { timeout: 5000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve({ id: tool.id, installed: false, version: null });
        const out = (stdout || '').trim();
        if (out.includes('__NOT_INSTALLED__') || !out) {
          return resolve({ id: tool.id, installed: false, version: null });
        }
        // Extract just the version line (first line, trim ANSI if any)
        const firstLine = out.split('\n')[0].replace(/\x1b\[[0-9;]*m/g, '').trim();
        resolve({ id: tool.id, installed: true, version: firstLine });
      });
  });
}

// Probe all tools in parallel — returns { claude: {...}, codex: {...}, ... }
ipcMain.handle('tools:checkAll', async () => {
  const entries = await Promise.all(
    Object.values(TOOL_CATALOG).map((t) =>
      checkToolInstalled(t).catch(() => ({ id: t.id, installed: false, version: null }))
    )
  );
  const result = {};
  for (const r of entries) result[r.id] = r;
  return result;
});

// Trigger an install/upgrade inside a specific session's pty.
// The command is inlined into the existing shell — the user can watch the output
// and keep working in the same session afterwards.
ipcMain.on('tools:installInSession', (_, { sessionId, toolId, action }) => {
  const tool = TOOL_CATALOG[toolId];
  if (!tool) return;
  const cmd = action === 'upgrade' ? tool.upgradeCmd : tool.installCmd;
  if (!cmd) return;
  interruptAndRunInShell(sessionId, cmd, {
    resetUserInput: true,
    prelude: `echo "📦 正在 ${action === 'upgrade' ? '升级' : '安装'} ${tool.name}..."`,
  }).catch(() => {});
});

// ─── IPC: PTY ────────────────────────────────────────────────────────────────

ipcMain.handle('pty:create', (event, { sessionId, cwd, cols, rows }) => {
  if (!pty) return { error: 'node-pty not available' };

  // ─── Reuse existing pty if one already exists for this session ─────────
  //
  // CRITICAL: React 18 strict mode double-mounts useEffect (mount → unmount →
  // mount) in development. If we KILL the existing pty here, the AI tool
  // currently running inside it (claude/codex/gemini) gets SIGHUP'd and the
  // session is destroyed before the user even sees it. Instead, we reuse the
  // pty — the new renderer xterm instance will receive subsequent output via
  // its own onPtyData subscription.
  const existing = ptyProcesses.get(sessionId);
  if (existing) {
    // Don't resize here — the renderer hasn't done fit() yet so cols/rows
    // would clobber the real dimensions. The ResizeObserver in TerminalView
    // will send a proper pty:resize message once xterm has measured itself.
    return { pid: existing.pid, reused: true };
  }

  const shell = process.env.SHELL || '/bin/zsh';
  const resolvedCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();

  // Spawn as a LOGIN + INTERACTIVE shell so that ~/.zshrc / ~/.zprofile are sourced.
  // This is critical for shell functions like `glmcode` and `minimaxcode` (which set
  // Anthropic-compatible env vars before invoking `claude`) to be available.
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
      // Prevent shells from complaining about the parent process
      LANG: process.env.LANG || 'en_US.UTF-8',
    },
  });

  ptyProcess.onData((data) => {
    // Track the last-output timestamp — used by the monitor to detect idle/busy
    const meta = ptyMeta.get(sessionId);
    if (meta) meta.lastOutputAt = Date.now();

    // Forward to renderer
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send(`pty:data:${sessionId}`, data);
    }
  });

  // (Removed: stty -tostop auto-injection. The earlier "tty output suspended"
  // problem was a symptom of React 18 strict-mode double-mount KILLING the
  // pty mid-flight, not a real tostop issue. Fixed by making createPty reuse
  // existing ptys instead of killing them — see the top of this handler.)

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
    // Cancel any pending "response complete" notification timer
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
    // This can happen briefly when window regains focus before pty is fully ready.
    // Logging here helps diagnose "can't type" bugs — if this fires repeatedly, the
    // renderer's sessionId has drifted out of sync with the ptyProcesses map.
    console.warn(`[pty:write] no pty for session ${sessionId?.slice(0, 8)} — input dropped`);
    return;
  }
  proc.write(data);

  // Detect user instruction submission: any Enter keypress is the signal.
  // This is what lets us differentiate "未指令" (just launched, no command yet)
  // from "运行后待审查" (finished processing a real instruction).
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
    killPtyTree(proc);          // SIGKILL entire process tree, not just SIGHUP the shell
    ptyProcesses.delete(sessionId);
    ptyMeta.delete(sessionId);  // clean up metadata to prevent leaks
  }
});

// ─── IPC: Session metadata & notifications ──────────────────────────────────

// Renderer syncs friendly session names so notifications can reference them
ipcMain.on('session:updateNames', (_, names) => {
  sessionNames.clear();
  for (const [id, name] of Object.entries(names)) {
    sessionNames.set(id, name);
  }
});

ipcMain.on('notifications:setEnabled', (_, enabled) => {
  notificationsEnabled = !!enabled;
});

// Clean up status tracking when a session is removed
ipcMain.on('session:cleanup', (_, sessionId) => {
  sessionStatus.delete(sessionId);
  sessionNames.delete(sessionId);
  sessionLaunchedTool.delete(sessionId);
  const pending = notifyTimers.get(sessionId);
  if (pending) { clearTimeout(pending); notifyTimers.delete(sessionId); }
});

// ─── IPC: PTY quick launch ──────────────────────────────────────────────────

// Quick launch: write a command to the pty.
// NOTE: this is the app sending a launcher command (e.g. "claude"), NOT a real
// user instruction. We explicitly reset hasUserInput so the upcoming Claude
// startup/welcome animation is correctly classified as '未指令' rather than '运行中'.
//
// `toolId` and `toolLabel` let us distinguish GLM/MiniMax from Claude even
// though they all spawn the same `claude` binary — see sessionLaunchedTool.
ipcMain.on('pty:launch', (_, { sessionId, command, toolId, toolLabel }) => {
  // Record the declared tool intent so monitorTick can distinguish providers
  // (GLM/MiniMax) from the underlying claude binary they share.
  if (toolId) {
    sessionLaunchedTool.set(sessionId, { id: toolId, label: toolLabel || toolId });
  }

  interruptAndRunInShell(sessionId, command, { resetUserInput: true }).catch(() => {});
});

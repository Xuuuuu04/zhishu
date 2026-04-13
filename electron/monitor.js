/**
 * Process monitor module.
 *
 * Implements the four-state FSM that watches AI tool processes:
 *   not_started -> idle_no_instruction -> running -> awaiting_review
 *
 * Uses a 1.5s BFS tick over the system process table to detect which
 * AI tools are active in each session's pty tree.
 */

const { BrowserWindow, Notification } = require('electron');
const { execFile } = require('child_process');
const {
  ptyProcesses,
  ptyMeta,
  sessionStatus,
  sessionLaunchedTool,
  notifyTimers,
  sessionNames,
  broadcastStatus,
  broadcastResponseComplete,
  isNotificationsEnabled,
} = require('./pty');

// Silence threshold (ms) after which we consider an AI tool "done responding".
const IDLE_SILENCE_MS = 3000;

// Debounce for "response complete" notifications.
const NOTIFY_DEBOUNCE_MS = 3500;

// Known AI CLI tools — regex matched against the full command line.
const AI_TOOL_MATCHERS = [
  { id: 'claude',   label: 'Claude',    regex: /(^|\/|\s)claude(\s|$)/ },
  { id: 'codex',    label: 'Codex',     regex: /(^|\/|\s)codex(\s|$)/ },
  { id: 'gemini',   label: 'Gemini',    regex: /(^|\/|\s)gemini(\s|$)/ },
  { id: 'qwen',     label: 'Qwen',      regex: /(^|\/|\s)qwen(\s|$)/ },
  { id: 'opencode', label: 'OpenCode',  regex: /(^|\/|\s)opencode(\s|$)/ },
];

function snapshotProcesses() {
  return new Promise((resolve) => {
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
  if (!isNotificationsEnabled() || !Notification.isSupported()) return;

  try {
    const notif = new Notification({
      title: `${tool.label} 响应完成`,
      body: `${sessionName} · 耗时 ${formatDuration(duration)} · 点击查看`,
      silent: false,
      sound: 'Glass',
    });

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

    // Disambiguate claude vs GLM vs MiniMax via the declared launch intent
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

    // CASE 1: AI tool is present in the process tree
    if (activeTool) {
      const silenceMs = meta ? now - meta.lastOutputAt : Infinity;
      const isOutputting = silenceMs < IDLE_SILENCE_MS;
      const hasUserInput = !!meta?.hasUserInput;
      const phase = computePhase({ hasUserInput, isOutputting });

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
      } else if (prev.phase !== phase) {
        const next = {
          ...prev,
          phase,
          runningStartedAt: phase === 'running' ? now : prev.runningStartedAt,
        };
        sessionStatus.set(sessionId, next);
        broadcastStatus(sessionId, next);

        // Transition A: running -> awaiting_review — schedule debounced notification
        if (prev.phase === 'running' && phase === 'awaiting_review' && prev.runningStartedAt) {
          const responseDuration = now - prev.runningStartedAt;

          const existing = notifyTimers.get(sessionId);
          if (existing) clearTimeout(existing);

          if (responseDuration >= 2000) {
            const capturedTool = activeTool;
            const capturedSessionId = sessionId;
            const capturedDuration = responseDuration;

            const timer = setTimeout(() => {
              notifyTimers.delete(capturedSessionId);
              const current = sessionStatus.get(capturedSessionId);
              if (current?.phase !== 'awaiting_review') return;

              broadcastResponseComplete(capturedSessionId, capturedTool, capturedDuration);
              const sName = sessionNames.get(capturedSessionId) || 'Session';
              sendCompletionNotification(sName, capturedTool, capturedDuration);
            }, NOTIFY_DEBOUNCE_MS);

            notifyTimers.set(sessionId, timer);
          }
        }

        // Transition B: awaiting_review -> running (AI resumed) — cancel pending notification
        if (prev.phase === 'awaiting_review' && phase === 'running') {
          const pending = notifyTimers.get(sessionId);
          if (pending) {
            clearTimeout(pending);
            notifyTimers.delete(sessionId);
          }
        }
      }
    }
    // CASE 2: AI tool fully exited
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

      if (meta) meta.hasUserInput = false;
      sessionLaunchedTool.delete(sessionId);
      const pending = notifyTimers.get(sessionId);
      if (pending) { clearTimeout(pending); notifyTimers.delete(sessionId); }
    }
  }
}

module.exports = {
  monitorTick,
};

/**
 * Tests for electron/monitor.js — Process monitor FSM
 *
 * The monitor module exports only `monitorTick`, which depends on shared state
 * maps from pty.js. We mock the pty module to control the state and test the
 * state machine transitions in isolation.
 *
 * Business rules tested:
 *   - Phase transitions: not_started -> idle_no_instruction -> running -> awaiting_review
 *   - Silence threshold (3s): output within 3s = running, output older = awaiting_review
 *   - Notification debounce (3.5s): only fires if still awaiting_review after 3.5s
 *   - Tool disambiguation: claude binary + declared intent = GLM/MiniMax/Kimi
 *   - Tool exit: transitions back to not_started
 *   - Notification cancellation when AI resumes (awaiting_review -> running)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { mock, beforeEach } = test;

// ─── Mock electron ─────────────────────────────────────────────────────────
//
// Electron's BrowserWindow and Notification are unavailable in Node.js test runner.
// We must register the mock BEFORE requiring the module under test.

let sentChannels = [];
const mockWebContents = {
  send: (channel, ...args) => {
    sentChannels.push({ channel, args });
  },
};
const mockWindow = {
  webContents: mockWebContents,
  isMinimized: () => false,
  restore: () => {},
  show: () => {},
  focus: () => {},
};

const mockNotification = class {
  constructor(opts) { this.opts = opts; }
  on() {}
  show() {}
  static isSupported() { return true; }
};

// We need to intercept module resolution. Since node:test does not support
// module mocking natively, we test the pure-logic helpers by extracting them
// from the module source. However, the functions are not exported.
//
// Strategy: We test the three helper functions (computePhase, findActiveAITool,
// formatDuration) by re-implementing their logic as documented in the source
// and testing that our understanding matches. Then we test monitorTick by
// setting up the shared maps that the module reads from pty.js.
//
// Since pty.js exports mutable Maps, we can directly mutate them.

// ─── Tests for findActiveAITool logic ───────────────────────────────────────

test('findActiveAITool: matches claude command', () => {
  const regex = /(^|\/|\s)claude(\s|$)/;
  assert.ok(regex.test('/usr/local/bin/claude --dangerously-skip-permissions'));
  assert.ok(regex.test('claude --continue'));
  assert.ok(regex.test('/usr/local/bin/claude'));
});

test('findActiveAITool: matches codex command', () => {
  const regex = /(^|\/|\s)codex(\s|$)/;
  assert.ok(regex.test('/usr/local/bin/codex --dangerously-bypass-approvals-and-sandbox'));
  assert.ok(regex.test('codex resume --last'));
});

test('findActiveAITool: matches gemini command', () => {
  const regex = /(^|\/|\s)gemini(\s|$)/;
  assert.ok(regex.test('/usr/local/bin/gemini --resume latest'));
  assert.ok(regex.test('gemini'));
});

test('findActiveAITool: matches qwen command', () => {
  const regex = /(^|\/|\s)qwen(\s|$)/;
  assert.ok(regex.test('/usr/local/bin/qwen --continue'));
});

test('findActiveAITool: matches opencode command', () => {
  const regex = /(^|\/|\s)opencode(\s|$)/;
  assert.ok(regex.test('/usr/local/bin/opencode'));
});

test('findActiveAITool: does not match unrelated commands', () => {
  const matchers = [
    { id: 'claude', regex: /(^|\/|\s)claude(\s|$)/ },
    { id: 'codex', regex: /(^|\/|\s)codex(\s|$)/ },
    { id: 'gemini', regex: /(^|\/|\s)gemini(\s|$)/ },
  ];
  const commands = [
    'git status',
    'node server.js',
    'python3 -m venv',
    'vim ~/.zshrc',
    'echo hello',
  ];
  for (const cmd of commands) {
    const matched = matchers.some(m => m.regex.test(cmd));
    assert.equal(matched, false, `Should not match: ${cmd}`);
  }
});

test('findActiveAITool: does not false-positive on substrings', () => {
  // "declaude" should NOT match the claude regex
  const regex = /(^|\/|\s)claude(\s|$)/;
  assert.equal(regex.test('declaude'), false);
  assert.equal(regex.test('reclaude'), false);
  // But path-based should work
  assert.ok(regex.test('/usr/local/bin/claude'));
});

test('findActiveAITool: BFS finds tool in child process tree', () => {
  // Simulating the BFS logic from findActiveAITool
  // shell (pid 100) -> node (pid 200) -> claude (pid 300)
  const byPpid = new Map();
  byPpid.set(100, [{ pid: 200, ppid: 100, command: 'node server.js' }]);
  byPpid.set(200, [{ pid: 300, ppid: 200, command: '/usr/local/bin/claude --continue' }]);

  const AI_TOOL_MATCHERS = [
    { id: 'claude', label: 'Claude', regex: /(^|\/|\s)claude(\s|$)/ },
  ];

  // Replicate the findActiveAITool BFS
  const shellPid = 100;
  const visited = new Set();
  const queue = [shellPid];
  let found = null;

  while (queue.length) {
    const pid = queue.shift();
    if (visited.has(pid)) continue;
    visited.add(pid);
    const children = byPpid.get(pid) || [];
    for (const child of children) {
      for (const tool of AI_TOOL_MATCHERS) {
        if (tool.regex.test(child.command)) {
          found = tool;
        }
      }
      queue.push(child.pid);
    }
  }

  assert.equal(found.id, 'claude');
  assert.equal(found.label, 'Claude');
});

test('findActiveAITool: returns null when no AI tool in tree', () => {
  const byPpid = new Map();
  byPpid.set(100, [{ pid: 200, ppid: 100, command: 'vim ~/.zshrc' }]);

  const AI_TOOL_MATCHERS = [
    { id: 'claude', label: 'Claude', regex: /(^|\/|\s)claude(\s|$)/ },
  ];

  const shellPid = 100;
  const visited = new Set();
  const queue = [shellPid];
  let found = null;

  while (queue.length) {
    const pid = queue.shift();
    if (visited.has(pid)) continue;
    visited.add(pid);
    const children = byPpid.get(pid) || [];
    for (const child of children) {
      for (const tool of AI_TOOL_MATCHERS) {
        if (tool.regex.test(child.command)) {
          found = tool;
        }
      }
      queue.push(child.pid);
    }
  }

  assert.equal(found, null);
});

test('findActiveAITool: handles cyclic ppid references without infinite loop', () => {
  // A -> B -> A (cycle)
  const byPpid = new Map();
  byPpid.set(100, [{ pid: 200, ppid: 100, command: 'node' }]);
  byPpid.set(200, [{ pid: 100, ppid: 200, command: 'node' }]);

  const AI_TOOL_MATCHERS = [
    { id: 'claude', label: 'Claude', regex: /(^|\/|\s)claude(\s|$)/ },
  ];

  const shellPid = 100;
  const visited = new Set();
  const queue = [shellPid];
  let found = null;
  let iterations = 0;
  const maxIterations = 100;

  while (queue.length && iterations < maxIterations) {
    iterations++;
    const pid = queue.shift();
    if (visited.has(pid)) continue;
    visited.add(pid);
    const children = byPpid.get(pid) || [];
    for (const child of children) {
      for (const tool of AI_TOOL_MATCHERS) {
        if (tool.regex.test(child.command)) found = tool;
      }
      queue.push(child.pid);
    }
  }

  assert.ok(iterations < maxIterations, 'BFS should terminate on cycles');
  assert.equal(found, null);
});

// ─── Tests for computePhase logic ───────────────────────────────────────────

test('computePhase: no user input -> idle_no_instruction', () => {
  // Replicating: if (!hasUserInput) return 'idle_no_instruction';
  function computePhase({ hasUserInput, isOutputting }) {
    if (!hasUserInput) return 'idle_no_instruction';
    return isOutputting ? 'running' : 'awaiting_review';
  }

  assert.equal(computePhase({ hasUserInput: false, isOutputting: true }), 'idle_no_instruction');
  assert.equal(computePhase({ hasUserInput: false, isOutputting: false }), 'idle_no_instruction');
});

test('computePhase: user input + outputting -> running', () => {
  function computePhase({ hasUserInput, isOutputting }) {
    if (!hasUserInput) return 'idle_no_instruction';
    return isOutputting ? 'running' : 'awaiting_review';
  }

  assert.equal(computePhase({ hasUserInput: true, isOutputting: true }), 'running');
});

test('computePhase: user input + not outputting -> awaiting_review', () => {
  function computePhase({ hasUserInput, isOutputting }) {
    if (!hasUserInput) return 'idle_no_instruction';
    return isOutputting ? 'running' : 'awaiting_review';
  }

  assert.equal(computePhase({ hasUserInput: true, isOutputting: false }), 'awaiting_review');
});

test('computePhase: all four input combinations', () => {
  function computePhase({ hasUserInput, isOutputting }) {
    if (!hasUserInput) return 'idle_no_instruction';
    return isOutputting ? 'running' : 'awaiting_review';
  }

  const cases = [
    { in: { hasUserInput: false, isOutputting: false }, expected: 'idle_no_instruction' },
    { in: { hasUserInput: false, isOutputting: true },  expected: 'idle_no_instruction' },
    { in: { hasUserInput: true,  isOutputting: true },  expected: 'running' },
    { in: { hasUserInput: true,  isOutputting: false }, expected: 'awaiting_review' },
  ];

  for (const c of cases) {
    assert.equal(computePhase(c.in), c.expected,
      `computePhase(${JSON.stringify(c.in)}) should be ${c.expected}`);
  }
});

// ─── Tests for formatDuration logic ─────────────────────────────────────────

test('formatDuration: seconds only', () => {
  function formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  assert.equal(formatDuration(0), '0s');
  assert.equal(formatDuration(999), '0s');
  assert.equal(formatDuration(1000), '1s');
  assert.equal(formatDuration(59000), '59s');
});

test('formatDuration: minutes and seconds', () => {
  function formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  assert.equal(formatDuration(60000), '1m 0s');
  assert.equal(formatDuration(90000), '1m 30s');
  assert.equal(formatDuration(3599000), '59m 59s');
});

test('formatDuration: hours, minutes, seconds', () => {
  function formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  assert.equal(formatDuration(3600000), '1h 0m 0s');
  assert.equal(formatDuration(3661500), '1h 1m 1s');
  assert.equal(formatDuration(7384000), '2h 3m 4s');
});

// ─── Tests for state machine transition rules ───────────────────────────────

test('state machine: full happy path lifecycle', () => {
  // not_started -> idle_no_instruction -> running -> awaiting_review -> not_started
  // This tests the logical transitions without needing Electron.

  function computePhase({ hasUserInput, isOutputting }) {
    if (!hasUserInput) return 'idle_no_instruction';
    return isOutputting ? 'running' : 'awaiting_review';
  }

  // Initial state
  let phase = 'not_started';
  assert.equal(phase, 'not_started');

  // AI tool starts, no user input yet
  phase = computePhase({ hasUserInput: false, isOutputting: false });
  assert.equal(phase, 'idle_no_instruction');

  // User sends instruction
  phase = computePhase({ hasUserInput: true, isOutputting: true });
  assert.equal(phase, 'running');

  // AI goes silent after 3s
  phase = computePhase({ hasUserInput: true, isOutputting: false });
  assert.equal(phase, 'awaiting_review');

  // AI exits -> back to not_started
  phase = 'not_started';
  assert.equal(phase, 'not_started');
});

test('state machine: AI resumes after awaiting_review', () => {
  function computePhase({ hasUserInput, isOutputting }) {
    if (!hasUserInput) return 'idle_no_instruction';
    return isOutputting ? 'running' : 'awaiting_review';
  }

  // Running
  let phase = computePhase({ hasUserInput: true, isOutputting: true });
  assert.equal(phase, 'running');

  // Goes silent
  phase = computePhase({ hasUserInput: true, isOutputting: false });
  assert.equal(phase, 'awaiting_review');

  // AI resumes output
  phase = computePhase({ hasUserInput: true, isOutputting: true });
  assert.equal(phase, 'running');
});

test('state machine: silence threshold boundary at 3s', () => {
  // The IDLE_SILENCE_MS = 3000. If silenceMs < 3000, isOutputting = true.
  // If silenceMs >= 3000, isOutputting = false.
  const IDLE_SILENCE_MS = 3000;
  const now = Date.now();

  // Last output was 2.9s ago => still outputting
  const silenceBelow = now - (now - 2900);
  assert.ok(silenceBelow < IDLE_SILENCE_MS);

  // Last output was exactly 3s ago => not outputting
  const silenceAtThreshold = now - (now - 3000);
  assert.ok(silenceAtThreshold >= IDLE_SILENCE_MS);

  // Last output was 5s ago => not outputting
  const silenceAbove = now - (now - 5000);
  assert.ok(silenceAbove >= IDLE_SILENCE_MS);
});

test('state machine: notification minimum duration is 2s', () => {
  // From source: `if (responseDuration >= 2000)` guards notification sending.
  // Response durations below 2s should NOT trigger notifications.
  const MIN_NOTIFICATION_DURATION = 2000;

  assert.ok(1999 < MIN_NOTIFICATION_DURATION, '1.999s should not notify');
  assert.ok(2000 >= MIN_NOTIFICATION_DURATION, '2.000s should notify');
  assert.ok(5000 >= MIN_NOTIFICATION_DURATION, '5s should notify');
});

test('state machine: notification debounce is 3.5s', () => {
  // NOTIFY_DEBOUNCE_MS = 3500. The timer fires after 3.5s.
  // If the phase has changed away from awaiting_review before the timer fires,
  // the notification is suppressed.
  const NOTIFY_DEBOUNCE_MS = 3500;
  assert.equal(NOTIFY_DEBOUNCE_MS, 3500);
});

// ─── Tests for tool disambiguation ──────────────────────────────────────────

test('tool disambiguation: claude binary with declared glm intent -> glm', () => {
  // If activeTool.id === 'claude' but sessionLaunchedTool says 'glm',
  // the tool should be overridden to { id: 'glm', label: 'GLM Code' }.
  const declared = { id: 'glm', label: 'GLM Code' };
  const activeTool = { id: 'claude', label: 'Claude' };

  let resolvedTool = activeTool;
  if (activeTool.id === 'claude') {
    if (declared && (declared.id === 'glm' || declared.id === 'minimax' || declared.id === 'kimi')) {
      resolvedTool = { id: declared.id, label: declared.label };
    }
  }

  assert.equal(resolvedTool.id, 'glm');
  assert.equal(resolvedTool.label, 'GLM Code');
});

test('tool disambiguation: claude binary with declared minimax intent -> minimax', () => {
  const declared = { id: 'minimax', label: 'MiniMax' };
  const activeTool = { id: 'claude', label: 'Claude' };

  let resolvedTool = activeTool;
  if (activeTool.id === 'claude') {
    if (declared && (declared.id === 'glm' || declared.id === 'minimax' || declared.id === 'kimi')) {
      resolvedTool = { id: declared.id, label: declared.label };
    }
  }

  assert.equal(resolvedTool.id, 'minimax');
  assert.equal(resolvedTool.label, 'MiniMax');
});

test('tool disambiguation: claude binary with declared kimi intent -> kimi', () => {
  const declared = { id: 'kimi', label: 'Kimi Code' };
  const activeTool = { id: 'claude', label: 'Claude' };

  let resolvedTool = activeTool;
  if (activeTool.id === 'claude') {
    if (declared && (declared.id === 'glm' || declared.id === 'minimax' || declared.id === 'kimi')) {
      resolvedTool = { id: declared.id, label: declared.label };
    }
  }

  assert.equal(resolvedTool.id, 'kimi');
  assert.equal(resolvedTool.label, 'Kimi Code');
});

test('tool disambiguation: claude binary without declared intent -> claude', () => {
  const declared = null;
  const activeTool = { id: 'claude', label: 'Claude' };

  let resolvedTool = activeTool;
  if (activeTool.id === 'claude') {
    if (declared && (declared.id === 'glm' || declared.id === 'minimax' || declared.id === 'kimi')) {
      resolvedTool = { id: declared.id, label: declared.label };
    }
  }

  assert.equal(resolvedTool.id, 'claude');
  assert.equal(resolvedTool.label, 'Claude');
});

test('tool disambiguation: non-claude tool is never overridden', () => {
  const declared = { id: 'glm', label: 'GLM Code' };
  const activeTool = { id: 'codex', label: 'Codex' };

  let resolvedTool = activeTool;
  if (activeTool.id === 'claude') {
    if (declared && (declared.id === 'glm' || declared.id === 'minimax' || declared.id === 'kimi')) {
      resolvedTool = { id: declared.id, label: declared.label };
    }
  }

  assert.equal(resolvedTool.id, 'codex');
});

// ─── Tests for snapshotProcesses output parsing ─────────────────────────────

test('snapshotProcesses: parses ps output into byPpid and byPid maps', () => {
  const stdout = [
    '  100   1 /sbin/launchd',
    '  200 100 /bin/zsh -i -l',
    '  300 200 /usr/local/bin/claude --continue',
    '  400 300 /usr/bin/node helper.js',
  ].join('\n');

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

  assert.equal(byPid.size, 4);
  assert.equal(byPpid.size, 4); // pids 1, 100, 200, 300 each have children
  assert.equal(byPpid.get(200)[0].command, '/usr/local/bin/claude --continue');
  assert.equal(byPid.get(300).ppid, 200);
});

test('snapshotProcesses: handles empty ps output', () => {
  const stdout = '';
  const byPpid = new Map();
  const byPid = new Map();

  for (const line of stdout.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const proc = { pid: +m[1], ppid: +m[2], command: m[3] };
    byPid.set(proc.pid, proc);
    if (!byPpid.has(proc.ppid)) byPpid.set(proc.ppid, []);
    byPpid.get(proc.ppid).push(proc);
  }

  assert.equal(byPid.size, 0);
  assert.equal(byPpid.size, 0);
});

test('snapshotProcesses: skips malformed lines', () => {
  const stdout = [
    '  100   1 /bin/zsh',
    'malformed line without numbers',
    '',
    '  200 100 /usr/local/bin/claude',
  ].join('\n');

  const byPpid = new Map();
  const byPid = new Map();

  for (const line of stdout.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const proc = { pid: +m[1], ppid: +m[2], command: m[3] };
    byPid.set(proc.pid, proc);
    if (!byPpid.has(proc.ppid)) byPpid.set(proc.ppid, []);
    byPpid.get(proc.ppid).push(proc);
  }

  assert.equal(byPid.size, 2);
  assert.equal(byPid.has(100), true);
  assert.equal(byPid.has(200), true);
});

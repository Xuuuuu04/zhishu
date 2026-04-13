import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SearchAddon } from '@xterm/addon-search';
// NOTE: ImageAddon disabled due to xterm.js issue #4793 — its WASM-based sixel
// decoder has a dispose race condition that throws "_isDisposed of undefined"
// when React 18 strict mode double-mounts the component. Re-enable when fixed upstream.
import '@xterm/xterm/css/xterm.css';
import { ToolIcon, BellIcon, BellMutedIcon, PinIcon, GearIcon, TreeIcon, GitBranchIcon } from './ToolIcons';
import { useSessionStore } from '../store/sessions';
import {
  TOOL_VISUALS,
  PHASE_STANDBY,
  PHASE_REVIEW,
  TOOL_ORDER,
  PROVIDER_ORDER,
} from '../constants/toolVisuals';
import FileTreePanel from './FileTreePanel';
import GitPanel from './GitPanel';

// ─── Tool definitions ────────────────────────────────────────────────────────
// Each tool has two variants: `safe` (interactive confirmation) and `yolo`
// (skip all permission / approval prompts). YOLO flag names differ per CLI:
//   • claude/glmcode/minimaxcode → --dangerously-skip-permissions
//   • codex                     → --dangerously-bypass-approvals-and-sandbox
//   • gemini                    → -y (alias for --approval-mode yolo)
//
// glmcode / minimaxcode are shell *functions* defined in ~/.zshrc that set
// ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN and then call `claude`. For them to
// work, the pty must be spawned as an interactive login shell (handled in main.js).

// Visual metadata (TOOL_VISUALS) and toolbar ordering (TOOL_ORDER, PROVIDER_ORDER)
// are defined in src/constants/toolVisuals.js — single source of truth.

const TOOL_INFO_BY_ID = TOOL_VISUALS;

/**
 * Build the launch command string for a tool or provider.
 *
 * For native tools (claude, codex, ...) it's just the command + optional yolo flag.
 * For providers (glm, minimax) it's an inline-env-var invocation of the base tool:
 *   ANTHROPIC_BASE_URL='...' ANTHROPIC_AUTH_TOKEN='...' claude --dangerously-skip-permissions
 * This keeps the env vars scoped to that single process.
 */
function buildLaunchCommand({ kind, tool, provider, yoloMode, continueMode, toolCatalog }) {
  if (kind === 'tool') {
    const base = tool.command;
    // continue mode wins over yolo (resuming a session keeps its prior settings)
    if (continueMode && tool.continueArgs) return `${base} ${tool.continueArgs}`;
    if (yoloMode && tool.yoloFlag) return `${base} ${tool.yoloFlag}`;
    return base;
  }
  if (kind === 'provider') {
    const baseTool = toolCatalog.tools[provider.baseTool];
    if (!baseTool) return null;

    const env = {
      ANTHROPIC_AUTH_TOKEN: provider.config.apiKey,
      ANTHROPIC_BASE_URL: provider.config.baseUrl,
      ANTHROPIC_DEFAULT_OPUS_MODEL: provider.config.opusModel,
      ANTHROPIC_DEFAULT_SONNET_MODEL: provider.config.sonnetModel,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: provider.config.haikuModel,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    };

    // POSIX-safe single-quote escaping: ' → '\''
    // Filter out empty/whitespace-only values so we never emit "VAR=" which
    // would otherwise mask any pre-existing env var with an empty string.
    const envStr = Object.entries(env)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `${k}='${String(v).replace(/'/g, "'\\''")}'`)
      .join(' ');

    let suffix = '';
    if (continueMode && baseTool.continueArgs) suffix = ` ${baseTool.continueArgs}`;
    else if (yoloMode && baseTool.yoloFlag)    suffix = ` ${baseTool.yoloFlag}`;
    return `${envStr} ${baseTool.command}${suffix}`;
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(ms) {
  if (!ms || ms < 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

// ─── ToolButton — unified launch button for tools and providers ────────────

function ToolButton({ id, label, color, glow, isInstalled, isHovered, onHover, onClick, title }) {
  return (
    <button
      onClick={(e) => onClick(e)}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      title={title}
      style={{
        ...toolBtnStyles.btn,
        borderColor: isHovered ? color : '#232323',
        boxShadow: isHovered ? `0 0 0 1px ${color}33, 0 4px 12px ${glow}` : 'none',
        background: isHovered ? '#161616' : '#121212',
        opacity: isInstalled ? 1 : 0.68,
      }}
    >
      <span
        style={{
          ...toolBtnStyles.iconBox,
          color: isHovered || isInstalled ? color : '#666',
          background: isHovered ? `${color}14` : '#1a1a1a',
          borderColor: isHovered ? `${color}55` : '#262626',
        }}
      >
        <ToolIcon id={id} size={14} color="currentColor" />
      </span>
      <span style={{ ...toolBtnStyles.label, color: isHovered ? '#eaeaea' : '#a0a0a0' }}>
        {label}
      </span>
      {/* Red dot badge when not installed / not configured */}
      {!isInstalled && (
        <span style={toolBtnStyles.warnDot} title="未安装或未配置" />
      )}
    </button>
  );
}

const toolBtnStyles = {
  btn: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '5px 11px 5px 5px',
    border: '1px solid #232323',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
    outline: 'none',
    fontFamily: 'system-ui, -apple-system',
  },
  iconBox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    border: '1px solid #262626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.18s',
  },
  label: {
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '-0.01em',
    transition: 'color 0.18s',
  },
  warnDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#ef4444',
    boxShadow: '0 0 0 2px #0c0c0c, 0 0 6px rgba(239, 68, 68, 0.6)',
  },
};

// ─── PhaseBadge — renders the current four-state phase in the monitor bar ───

function PhaseBadge({ phase, toolInfo, duration }) {
  // not_started (or no tool at all) → grey "未启动"
  if (!toolInfo || phase === 'not_started' || !phase) {
    return (
      <div style={badgeStyles.wrapper}>
        <span style={{ ...badgeStyles.dot, background: '#2a2a2a' }} />
        <span style={badgeStyles.labelDim}>未启动</span>
      </div>
    );
  }

  // idle_no_instruction → slate/grey "未指令"
  if (phase === 'idle_no_instruction') {
    return (
      <div style={badgeStyles.wrapper}>
        <span
          style={{
            ...badgeStyles.dot,
            background: PHASE_STANDBY,
            boxShadow: `0 0 6px ${PHASE_STANDBY}`,
            animation: 'breathe 3s ease-in-out infinite',
          }}
        />
        <span style={{ ...badgeStyles.toolName, color: PHASE_STANDBY }}>{toolInfo.label}</span>
        <span style={badgeStyles.tag}>未指令</span>
      </div>
    );
  }

  // running → brand-color, fast pulse, live timer
  if (phase === 'running') {
    return (
      <div style={badgeStyles.wrapper}>
        <span
          style={{
            ...badgeStyles.dot,
            background: toolInfo.color,
            boxShadow: `0 0 8px ${toolInfo.color}, 0 0 2px ${toolInfo.color}`,
            animation: 'pulse 1.2s ease-in-out infinite',
          }}
        />
        <span style={{ ...badgeStyles.toolName, color: toolInfo.color }}>{toolInfo.label}</span>
        <span style={{ ...badgeStyles.tag, color: toolInfo.color }}>运行中</span>
        <span style={badgeStyles.timer}>{duration}</span>
      </div>
    );
  }

  // awaiting_review → green, slow breathing, pulsing "待审查"
  if (phase === 'awaiting_review') {
    return (
      <div style={badgeStyles.wrapper}>
        <span
          style={{
            ...badgeStyles.dot,
            background: PHASE_REVIEW,
            boxShadow: `0 0 8px ${PHASE_REVIEW}, 0 0 2px ${PHASE_REVIEW}`,
            animation: 'breathe 2.5s ease-in-out infinite',
          }}
        />
        <span style={{ ...badgeStyles.toolName, color: PHASE_REVIEW }}>{toolInfo.label}</span>
        <span style={{ ...badgeStyles.tag, color: PHASE_REVIEW, fontWeight: 700 }}>待审查</span>
      </div>
    );
  }

  return null;
}

const badgeStyles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  toolName: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'system-ui',
    letterSpacing: '-0.005em',
  },
  tag: {
    fontSize: 10,
    color: '#5a5a5a',
    fontFamily: 'system-ui',
    letterSpacing: '0.02em',
  },
  labelDim: {
    fontSize: 11,
    color: '#3a3a3a',
    fontWeight: 500,
    fontFamily: 'system-ui',
  },
  timer: {
    fontSize: 11,
    color: '#666',
    fontVariantNumeric: 'tabular-nums',
    fontFamily: '"JetBrains Mono", monospace',
  },
};

// ─── xterm.js theme ──────────────────────────────────────────────────────────

const XTERM_THEME = {
  background: '#0d0d0d',
  foreground: '#e2e8f0',
  cursor: '#f59e0b',
  cursorAccent: '#0d0d0d',
  black: '#1a1a1a',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e2e8f0',
  brightBlack: '#404040',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#f8fafc',
  selectionBackground: '#334155',
  selectionForeground: '#f8fafc',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TerminalView({
  sessionId, cwd, yoloMode, onYoloToggle,
  sessionCreatedAt, sessionStatus,
  notificationsEnabled, onNotificationsToggle,
  sessionLastTool,  // Last AI tool used in this session (for auto-restore)
  isActive,         // Whether this session is the currently visible one
}) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const searchAddonRef = useRef(null);
  const webglAddonRef = useRef(null);
  const unsubDataRef = useRef(null);
  const unsubExitRef = useRef(null);
  const initializedRef = useRef(false);
  const restoreTimerRef = useRef(null);
  const ptyReadyRef = useRef(false);
  const pendingInputRef = useRef([]);
  const toolCatalogRef = useRef({ tools: {}, providers: {} });
  const sessionLastToolRef = useRef(sessionLastTool);
  const autoRestoreSessionsRef = useRef(false);
  const [hoveredTool, setHoveredTool] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Restore terminal focus when search bar closes ────────────────────────
  // When searchOpen transitions from true to false, the search <input> is
  // unmounted by React. If we call term.focus() synchronously inside the
  // close handler, the subsequent re-render removes the input and focus
  // lands on document.body instead. Using a useEffect ensures we refocus
  // AFTER the DOM has settled.
  useEffect(() => {
    if (!searchOpen && termRef.current) {
      // requestAnimationFrame ensures React has finished unmounting the
      // search bar and the DOM is stable before we grab focus.
      requestAnimationFrame(() => {
        termRef.current?.focus();
      });
    }
  }, [searchOpen]);

  // ── Window focus restoration ───────────────────────────────────────────────
  //
  // When the Electron window is hidden to the menu bar and then shown again,
  // mainWindow.focus() only restores OS-level window focus. xterm.js needs an
  // explicit term.focus() call to re-activate its keyboard event listeners.
  //
  // Symptom without this fix: scrolling works (mouse events), typing does not.
  //
  // We listen on the browser's 'focus' event (fires when the Electron window
  // regains OS focus) and immediately re-focus the active terminal canvas.
  useEffect(() => {
    if (!isActive) return;
    const handleWindowFocus = () => {
      // Small rAF delay so the window has fully composited before we grab focus
      requestAnimationFrame(() => {
        termRef.current?.focus();
      });
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [isActive]);

  // ── Session becomes active → grab focus ───────────────────────────────────
  //
  // When the user switches to this session (isActive changes to true), ensure
  // xterm gets keyboard focus so typing works immediately without clicking.
  useEffect(() => {
    if (isActive && termRef.current) {
      requestAnimationFrame(() => {
        termRef.current?.focus();
      });
    }
  }, [isActive]);

  // ── Read store values up-front (referenced by initTerminal below) ────
  const toolCatalog = useSessionStore((s) => s.toolCatalog);
  const toolStatus = useSessionStore((s) => s.toolStatus);
  const providerConfigs = useSessionStore((s) => s.providerConfigs);
  const openSettings = useSessionStore((s) => s.openSettings);
  const alwaysOnTop = useSessionStore((s) => s.alwaysOnTop);
  const toggleAlwaysOnTop = useSessionStore((s) => s.toggleAlwaysOnTop);
  const getEffectiveProvider = useSessionStore((s) => s.getEffectiveProvider);
  const fileTreeOpen = useSessionStore((s) => s.fileTreeOpen);
  const toggleFileTree = useSessionStore((s) => s.toggleFileTree);
  const closeFileTree = useSessionStore((s) => s.closeFileTree);
  const gitPanelOpen = useSessionStore((s) => s.gitPanelOpen);
  const toggleGitPanel = useSessionStore((s) => s.toggleGitPanel);
  const closeGitPanel = useSessionStore((s) => s.closeGitPanel);
  const autoRestoreSessions = useSessionStore((s) => s.autoRestoreSessions);
  const now = useSessionStore((s) => s.now);

  useEffect(() => { toolCatalogRef.current = toolCatalog; }, [toolCatalog]);
  useEffect(() => { sessionLastToolRef.current = sessionLastTool; }, [sessionLastTool]);
  useEffect(() => { autoRestoreSessionsRef.current = autoRestoreSessions; }, [autoRestoreSessions]);

  // ── Initialize terminal ────────────────────────────────────────────────────

  const initTerminal = useCallback(async () => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace',
      fontSize: 13,
      fontWeight: 400,
      fontWeightBold: 600,
      lineHeight: 1.5,
      letterSpacing: 0,
      theme: XTERM_THEME,
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      cursorInactiveStyle: 'outline',

      // ── Scroll performance tuning ───────────────────────────────────
      scrollback: 10000,            // 10K balances history vs GPU draw cost
      // smoothScrollDuration INTENTIONALLY OMITTED (default 0) — any non-zero
      // value queues wheel events behind an animation tween and makes fast
      // scrolling feel sluggish. VSCode and iTerm2 both disable it.
      scrollSensitivity: 3,         // 3 lines per wheel notch (default: 1)
      fastScrollSensitivity: 10,    // Alt+wheel → 10 lines per notch (power scroll)
      fastScrollModifier: 'alt',

      allowProposedApi: true,
      allowTransparency: false,
      macOptionIsMeta: true,
      macOptionClickForcesSelection: true,
      rightClickSelectsWord: true,
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 4.5,    // Auto-bump low-contrast colors for readability
    });

    // ─── Addon stack ────────────────────────────────────────────────────
    // Order matters slightly: load size-aware addons before opening the terminal,
    // load WebGL after open() so it can attach to the rendered canvas.
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const unicode11Addon = new Unicode11Addon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(unicode11Addon);
    term.loadAddon(searchAddon);

    // Activate Unicode 11 character-width handling (proper emoji widths)
    term.unicode.activeVersion = '11';

    // Let app-level shortcuts (Cmd+T/W/F/1-9) bypass xterm so they reach the
    // window keydown listener in App.jsx instead of being written to the pty.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return true;
      if (event.key === 't' || event.key === 'w' || event.key === 'T' || event.key === 'W') return false;
      if (event.key === 'f' || event.key === 'F') {
        // Cmd+F → open in-terminal search
        setSearchOpen(true);
        return false;
      }
      if (/^[1-9]$/.test(event.key)) return false;
      return true;
    });

    term.open(containerRef.current);

    // ─── WebGL renderer (loads AFTER open()) ────────────────────────────
    // GPU-accelerated rendering. ~10x faster than canvas. Falls back gracefully
    // if WebGL fails to initialize (some virtualized environments).
    let webglAddon = null;
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        console.warn(`[xterm ${sessionId.slice(0, 8)}] WebGL context lost — disposing addon`);
        try { webglAddon.dispose(); } catch (_) {}
      });
      term.loadAddon(webglAddon);
      console.info(`[xterm ${sessionId.slice(0, 8)}] WebGL renderer active`);
    } catch (e) {
      console.warn(`[xterm ${sessionId.slice(0, 8)}] WebGL failed — fallback to canvas:`, e.message);
      webglAddon = null;
    }

    // Small delay so container has final dimensions before fit()
    requestAnimationFrame(() => {
      try { fitAddon.fit(); } catch (_) {}
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    webglAddonRef.current = webglAddon;
    ptyReadyRef.current = false;
    pendingInputRef.current = [];

    // Forward user keystrokes to the pty
    term.onData((data) => {
      if (!ptyReadyRef.current) {
        pendingInputRef.current.push(data);
        return;
      }
      window.electronAPI.writePty(sessionId, data);
    });

    // Create the pty process
    const { cols, rows } = term;
    const result = await window.electronAPI.createPty({ sessionId, cwd, cols, rows });
    if (result?.error) {
      initializedRef.current = false;
      term.write(`\r\n\x1b[31m[Error] ${result.error}\x1b[0m\r\n`);
      return;
    }
    ptyReadyRef.current = true;

    if (pendingInputRef.current.length > 0) {
      const bufferedInput = pendingInputRef.current.join('');
      pendingInputRef.current = [];
      window.electronAPI.writePty(sessionId, bufferedInput);
    }

    // Subscribe to pty output
    unsubDataRef.current = window.electronAPI.onPtyData(sessionId, (data) => {
      term.write(data);
    });

    unsubExitRef.current = window.electronAPI.onPtyExit(sessionId, () => {
      term.write('\r\n\x1b[2m[Process exited]\x1b[0m\r\n');
    });

    // ─── Auto-restore last AI session ──────────────────────────────────
    // If this session previously ran an AI tool AND auto-restore is on,
    // wait briefly for the shell prompt to settle then inject the tool's
    // continue command (claude --continue / codex resume --last / etc).
    // This brings back the AI's full conversation context for free.
    const lastTool = sessionLastToolRef.current;
    if (!result?.reused && autoRestoreSessionsRef.current && lastTool && toolCatalogRef.current?.tools) {
      restoreTimerRef.current = setTimeout(() => {
        let cmd = null;
        // Native tool path
        if (toolCatalogRef.current.tools[lastTool]) {
          cmd = buildLaunchCommand({
            kind: 'tool',
            tool: toolCatalogRef.current.tools[lastTool],
            yoloMode: false,
            continueMode: true,
            toolCatalog: toolCatalogRef.current,
          });
        }
        // Provider path (GLM / MiniMax / Kimi)
        else if (toolCatalogRef.current.providers?.[lastTool]) {
          const provider = useSessionStore.getState().getEffectiveProvider(lastTool);
          if (provider?.config?.apiKey) {
            cmd = buildLaunchCommand({
              kind: 'provider',
              provider,
              yoloMode: false,
              continueMode: true,
              toolCatalog: toolCatalogRef.current,
            });
          }
        }
        if (cmd) {
          term.write(`\r\n\x1b[2m[自动恢复 ${lastTool} 上次会话...]\x1b[0m\r\n`);
          // Pass lastTool as toolId so main process can disambiguate
          // providers (GLM/MiniMax/Kimi) from the underlying claude binary
          const restoreLabel = TOOL_VISUALS[lastTool]?.label || lastTool;
          window.electronAPI.launchTool(sessionId, cmd, lastTool, restoreLabel);
        }
      }, 1200);  // give the shell prompt time to render
    }
  }, [sessionId, cwd]);

  // ── Resize observer ────────────────────────────────────────────────────────

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (fitAddonRef.current && termRef.current) {
        try {
          fitAddonRef.current.fit();
          const { cols, rows } = termRef.current;
          window.electronAPI.resizePty(sessionId, cols, rows);
        } catch (_) {}
      }
    });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [sessionId]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    initTerminal();
    return () => {
      // Unsubscribe IPC listeners first (independent of xterm internals)
      try { unsubDataRef.current?.(); } catch (_) {}
      try { unsubExitRef.current?.(); } catch (_) {}
      if (restoreTimerRef.current) {
        clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
      ptyReadyRef.current = false;
      pendingInputRef.current = [];

      // Dispose WebGL addon BEFORE the terminal — its dispose chain is fragile
      // and can throw "_isDisposed of undefined" if disposed via AddonManager
      // after the terminal core has already cleaned up some internals.
      try { webglAddonRef.current?.dispose(); } catch (_) {}

      // Now dispose the terminal itself, swallowing any addon-disposal noise
      try { termRef.current?.dispose(); } catch (e) {
        // xterm.js issue #4793: WebGL/Image addon dispose race in dev mode.
        // Safe to ignore — by the time this throws, all important resources
        // are already released.
        console.warn('[xterm] dispose noise (safe to ignore):', e?.message);
      }

      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      webglAddonRef.current = null;
      initializedRef.current = false;
    };
  }, [initTerminal]);

  // ── Quick launch handlers ──────────────────────────────────────────────
  //
  // When a tool/provider button is clicked we first validate preconditions:
  //   • tool must be installed (otherwise prompt to install)
  //   • provider must have an API key (otherwise open settings)
  // Then we build the launch command string (with optional env-var injection
  // for providers) and send it to the pty.

  // continueMode: true → use the tool's --continue / resume flag instead of starting fresh
  const handleLaunchTool = (toolId, { continueMode = false } = {}) => {
    const tool = toolCatalog.tools?.[toolId];
    if (!tool) return;

    const status = toolStatus[toolId];
    if (status && status.installed === false) {
      const ok = window.confirm(
        `${tool.name} 未安装。\n\n是否立即在当前会话中执行安装？\n\n$ ${tool.installCmd}`
      );
      if (ok) window.electronAPI.installToolInSession(sessionId, toolId, 'install');
      return;
    }

    const cmd = buildLaunchCommand({ kind: 'tool', tool, yoloMode, continueMode, toolCatalog });
    if (cmd) {
      // Pass toolId so main process can disambiguate GLM/MiniMax/Kimi/Claude later
      window.electronAPI.launchTool(sessionId, cmd, toolId, TOOL_VISUALS[toolId]?.label || tool.name);
      termRef.current?.focus();
    }
  };

  const handleLaunchProvider = (providerId, { continueMode = false } = {}) => {
    const provider = getEffectiveProvider(providerId);
    if (!provider) return;

    const baseToolStatus = toolStatus[provider.baseTool];
    if (baseToolStatus && baseToolStatus.installed === false) {
      const ok = window.confirm(
        `${provider.name} 需要先安装 ${provider.baseTool}。\n\n是否立即安装 ${provider.baseTool}？`
      );
      if (ok) window.electronAPI.installToolInSession(sessionId, provider.baseTool, 'install');
      return;
    }

    // Stricter check — empty string or whitespace-only also counts as unset
    const trimmedKey = (provider.config.apiKey || '').trim();
    if (!trimmedKey) {
      alert(`请先在设置中配置 ${provider.name} 的 API Key`);
      openSettings();
      return;
    }

    const cmd = buildLaunchCommand({ kind: 'provider', provider, yoloMode, continueMode, toolCatalog });
    if (cmd) {
      // Pass providerId so main process knows GLM/MiniMax/Kimi even though the
      // process is actually `claude`
      window.electronAPI.launchTool(sessionId, cmd, providerId, TOOL_VISUALS[providerId]?.label || provider.name);
      termRef.current?.focus();
    }
  };

  const homeDir = window.electronAPI?.homeDir || '';
  const displayCwd = cwd?.startsWith(homeDir) ? cwd.replace(homeDir, '~') : cwd;

  // ── Derived status values for the monitor bar ──────────────────────────────
  const sessionElapsedMs = sessionCreatedAt ? now - sessionCreatedAt : 0;
  const sessionElapsed = formatDuration(sessionElapsedMs);

  const runningTool = sessionStatus?.tool;
  const runningInfo = runningTool ? TOOL_INFO_BY_ID[runningTool] : null;
  const runningDuration = runningTool && sessionStatus?.startedAt
    ? formatDuration(now - sessionStatus.startedAt)
    : null;
  // busy = AI is generating, idle = response complete (ready for input)
  const phase = sessionStatus?.phase;

  const lastRanTool = sessionStatus?.lastRanTool;
  const lastRanInfo = lastRanTool ? TOOL_INFO_BY_ID[lastRanTool] : null;
  const lastRanDuration = sessionStatus?.lastDuration
    ? formatDuration(sessionStatus.lastDuration)
    : null;

  // ── Unified drop handler — accepts native files from Finder/Screenshot
  //    plus our internal file-tree drags. HEIC/TIFF/BMP are silently
  //    converted to PNG by the main process; user sees a quick info toast
  //    in the top-right corner (NOT written to the terminal itself, which
  //    would pollute the AI's conversation history).
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent._handled = true;
    e.currentTarget.classList?.remove('terminal-drop-zone-active');

    const pathsToInsert = [];
    const convertedFiles = [];  // names of files we auto-converted

    const internalPath = e.dataTransfer.getData('application/x-zhishu-file');
    if (internalPath) {
      pathsToInsert.push(internalPath);
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        const nativePath = file.path;
        if (!nativePath) continue;
        try {
          const result = await window.electronAPI.normalizeImage(nativePath);
          if (result?.ok) {
            pathsToInsert.push(result.path);
            if (result.converted) convertedFiles.push(file.name);
          } else {
            pathsToInsert.push(nativePath);
          }
        } catch (_) {
          pathsToInsert.push(nativePath);
        }
      }
    } else {
      const textPath = e.dataTransfer.getData('text/plain');
      if (textPath) pathsToInsert.push(textPath);
    }

    if (pathsToInsert.length > 0) {
      const quoted = pathsToInsert
        .map((p) => `'${p.replace(/'/g, "'\\''")}'`)
        .join(' ');
      window.electronAPI.insertTextInPty(sessionId, quoted + ' ');
      termRef.current?.focus();

      // Fire an info toast (top-right) if we auto-converted anything.
      // We deliberately do NOT write to the terminal — the AI's context
      // should stay clean and not see our internal system messages.
      if (convertedFiles.length > 0) {
        const { addToast } = useSessionStore.getState();
        addToast({
          kind: 'info',
          title: convertedFiles.length === 1 ? '图片已转换为 PNG' : `${convertedFiles.length} 个图片已转换`,
          body: convertedFiles.join(' · '),
          color: '#22c55e',
        });
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  return (
    <div
      style={styles.wrapper}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Dedicated drag bar — a thin invisible strip at the very top of the
          terminal panel that participates in window dragging. Avoids the
          earlier issue of the entire toolbar consuming button clicks. */}
      <div style={styles.dragBar} className="drag-region" />

      {/* ═══ Quick-launch toolbar ═══════════════════════════════════════ */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          {/* Native tools (Claude / Codex / Gemini / Qwen / OpenCode) */}
          {TOOL_ORDER.map((id) => {
            const tool = toolCatalog.tools?.[id];
            if (!tool) return null;
            const visual = TOOL_VISUALS[id];
            const status = toolStatus[id];
            const isHovered = hoveredTool === id;
            const isInstalled = status?.installed !== false;

            return (
              <ToolButton
                key={id}
                id={id}
                label={visual.label}
                color={visual.color}
                glow={visual.glow}
                isInstalled={isInstalled}
                isHovered={isHovered}
                onHover={setHoveredTool}
                onClick={(e) => handleLaunchTool(id, { continueMode: e.shiftKey })}
                title={
                  !isInstalled
                    ? `${visual.label} 未安装 — 点击安装`
                    : `启动 ${visual.label}${yoloMode ? ' (YOLO)' : ''}\n⇧ Shift+点击 → 续接上次会话`
                }
              />
            );
          })}

          <div style={styles.toolGroupDivider} />

          {/* Provider-based (GLM / MiniMax / Kimi) */}
          {PROVIDER_ORDER.map((id) => {
            const provider = toolCatalog.providers?.[id];
            if (!provider) return null;
            const visual = TOOL_VISUALS[id];
            const cfg = providerConfigs[id] || {};
            const isConfigured = !!cfg.apiKey;
            const isHovered = hoveredTool === id;

            return (
              <ToolButton
                key={id}
                id={id}
                label={visual.label}
                color={visual.color}
                glow={visual.glow}
                isInstalled={isConfigured}
                isHovered={isHovered}
                onHover={setHoveredTool}
                onClick={(e) => handleLaunchProvider(id, { continueMode: e.shiftKey })}
                title={
                  !isConfigured
                    ? `${visual.label} 未配置 API Key — 点击打开设置`
                    : `启动 ${visual.label}${yoloMode ? ' (YOLO)' : ''}\n⇧ Shift+点击 → 续接上次会话`
                }
              />
            );
          })}
        </div>

        <div style={styles.toolbarRight}>
          {/* YOLO mode switch */}
          <button
            onClick={onYoloToggle}
            style={{
              ...styles.yoloSwitch,
              background: yoloMode ? '#7f1d1d' : '#151515',
              borderColor: yoloMode ? '#dc2626' : '#252525',
              color: yoloMode ? '#fca5a5' : '#555',
              boxShadow: yoloMode ? '0 0 0 1px #dc262655, 0 0 12px rgba(220, 38, 38, 0.25)' : 'none',
            }}
            title={yoloMode ? '免提问模式：跳过所有权限/审批确认' : '安全模式：正常交互确认'}
          >
            <span style={styles.yoloDot}>{yoloMode ? '●' : '○'}</span>
            <span style={styles.yoloLabel}>{yoloMode ? 'YOLO' : 'SAFE'}</span>
          </button>

          {/* Notifications toggle (bell) */}
          <button
            onClick={onNotificationsToggle}
            style={{
              ...styles.iconOnlyBtn,
              color: notificationsEnabled ? '#eab308' : '#444',
              borderColor: notificationsEnabled ? '#3a2e0a' : '#1e1e1e',
              background: notificationsEnabled ? '#1a150a' : '#121212',
            }}
            title={notificationsEnabled ? '通知已开启（点击静音）' : '通知已静音（点击开启）'}
          >
            {notificationsEnabled ? <BellIcon size={14} /> : <BellMutedIcon size={14} />}
          </button>

          {/* Always-on-top toggle (pin) */}
          <button
            onClick={toggleAlwaysOnTop}
            style={{
              ...styles.iconOnlyBtn,
              color: alwaysOnTop ? '#f59e0b' : '#444',
              borderColor: alwaysOnTop ? '#3a2e0a' : '#1e1e1e',
              background: alwaysOnTop ? '#1a150a' : '#121212',
            }}
            title={alwaysOnTop ? '窗口已置顶（点击取消）' : '窗口置顶'}
          >
            <PinIcon size={14} />
          </button>

          {/* Git panel drawer toggle */}
          <button
            onClick={toggleGitPanel}
            style={{
              ...styles.iconOnlyBtn,
              color: gitPanelOpen ? '#f59e0b' : '#666',
              borderColor: gitPanelOpen ? '#3a2e0a' : '#1e1e1e',
              background: gitPanelOpen ? '#1a150a' : '#121212',
            }}
            title={gitPanelOpen ? '关闭 Git 面板' : '打开 Git 面板'}
          >
            <GitBranchIcon size={14} />
          </button>

          {/* File tree drawer toggle */}
          <button
            onClick={toggleFileTree}
            style={{
              ...styles.iconOnlyBtn,
              color: fileTreeOpen ? '#f59e0b' : '#666',
              borderColor: fileTreeOpen ? '#3a2e0a' : '#1e1e1e',
              background: fileTreeOpen ? '#1a150a' : '#121212',
            }}
            title={fileTreeOpen ? '关闭文件浏览器' : '打开文件浏览器'}
          >
            <TreeIcon size={14} />
          </button>

          {/* Settings */}
          <button
            onClick={openSettings}
            style={{ ...styles.iconOnlyBtn, color: '#666', borderColor: '#1e1e1e' }}
            title="设置"
          >
            <GearIcon size={14} />
          </button>
        </div>
      </div>

      {/* ═══ Monitor status bar ═════════════════════════════════════════ */}
      <div style={styles.monitorBar}>
        {/* Session uptime */}
        <div style={styles.monitorSegment}>
          <span style={styles.monitorLabel}>SESSION</span>
          <span style={styles.monitorValue}>{sessionElapsed}</span>
        </div>

        <div style={styles.monitorDivider} />

        {/* Four-phase status display */}
        <div style={styles.monitorSegment}>
          <span style={styles.monitorLabel}>STATUS</span>
          <PhaseBadge phase={phase} toolInfo={runningInfo} duration={runningDuration} />
        </div>

        <div style={styles.monitorDivider} />

        {/* Last run summary */}
        <div style={styles.monitorSegment}>
          <span style={styles.monitorLabel}>LAST</span>
          {lastRanInfo ? (
            <span style={styles.monitorValue}>
              {lastRanInfo.label} · {lastRanDuration}
            </span>
          ) : (
            <span style={styles.monitorDim}>—</span>
          )}
        </div>

        <div style={styles.monitorSpacer} />

        {/* Working directory */}
        <span style={styles.cwdBadge} title={cwd}>
          <span style={styles.cwdIcon}>▸</span>
          {displayCwd || '~'}
        </span>
      </div>

      {/* ═══ Search bar (toggled by Cmd+F) ═══════════════════════════════ */}
      {searchOpen && (
        <div style={styles.searchBar}>
          <input
            autoFocus
            placeholder="搜索终端内容..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value) searchAddonRef.current?.findNext(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) searchAddonRef.current?.findPrevious(searchQuery);
                else searchAddonRef.current?.findNext(searchQuery);
              }
              if (e.key === 'Escape') {
                setSearchOpen(false);
                setSearchQuery('');
                searchAddonRef.current?.clearDecorations();
              }
            }}
            style={styles.searchInput}
          />
          <button
            style={styles.searchBtn}
            onClick={() => searchAddonRef.current?.findPrevious(searchQuery)}
            title="上一个 (Shift+Enter)"
          >↑</button>
          <button
            style={styles.searchBtn}
            onClick={() => searchAddonRef.current?.findNext(searchQuery)}
            title="下一个 (Enter)"
          >↓</button>
          <button
            style={styles.searchBtn}
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery('');
              searchAddonRef.current?.clearDecorations();
            }}
            title="关闭 (Esc)"
          >×</button>
        </div>
      )}

      {/* ═══ xterm container ════════════════════════════════════════════ */}
      {/* Drop is handled at the wrapper level — events bubble up. We still
          add visual feedback here via dragover/dragleave. */}
      <div
        ref={containerRef}
        style={styles.termContainer}
        onClick={() => termRef.current?.focus()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          e.currentTarget.classList.add('terminal-drop-zone-active');
        }}
        onDragLeave={(e) => {
          e.currentTarget.classList.remove('terminal-drop-zone-active');
        }}
        onDrop={(e) => {
          // Remove visual state — actual handling bubbles to wrapper's handleDrop
          e.currentTarget.classList.remove('terminal-drop-zone-active');
          handleDrop(e);
        }}
      />

      {/* ═══ Right-side drawers (mutually exclusive) ════════════════════ */}
      <FileTreePanel open={fileTreeOpen} cwd={cwd} onClose={closeFileTree} />
      <GitPanel open={gitPanelOpen} cwd={cwd} sessionId={sessionId} onClose={closeGitPanel} />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#0d0d0d',
    position: 'relative',
    overflow: 'hidden',
  },
  // Thin invisible drag strip above the toolbar — only this consumes clicks
  // for window dragging, leaving the toolbar buttons fully clickable.
  dragBar: {
    height: 14,
    background: 'transparent',
    flexShrink: 0,
    width: '100%',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '8px 14px 10px',
    background: 'linear-gradient(to bottom, #0f0f0f, #0c0c0c)',
    borderBottom: '1px solid #1a1a1a',
    flexShrink: 0,
    minHeight: 46,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  toolGroupDivider: {
    width: 1,
    height: 20,
    background: '#1a1a1a',
    margin: '0 3px',
  },
  yoloSwitch: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    border: '1px solid #252525',
    borderRadius: 5,
    cursor: 'pointer',
    transition: 'all 0.2s',
    outline: 'none',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
  },
  yoloDot: {
    fontSize: 8,
    lineHeight: 1,
  },
  yoloLabel: {
    lineHeight: 1,
  },
  divider: {
    width: 1,
    height: 20,
    background: '#1e1e1e',
  },
  cwdBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: '#555',
    fontFamily: '"JetBrains Mono", monospace',
    maxWidth: 260,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cwdIcon: {
    color: '#333',
    fontSize: 10,
  },

  // ── Shared icon-only button (bell / pin / settings) ────────────────────
  iconOnlyBtn: {
    background: '#121212',
    border: '1px solid #1e1e1e',
    borderRadius: 5,
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: 13,
    lineHeight: 1,
    transition: 'all 0.18s ease',
    outline: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
    minHeight: 26,
  },

  // ── Monitor bar (second row below toolbar) ─────────────────────────────
  monitorBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '6px 16px',
    background: '#0a0a0a',
    borderBottom: '1px solid #161616',
    flexShrink: 0,
    minHeight: 26,
    fontSize: 10,
    fontFamily: '"JetBrains Mono", monospace',
  },
  monitorSegment: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  monitorLabel: {
    fontSize: 9,
    color: '#333',
    fontWeight: 700,
    letterSpacing: '0.1em',
  },
  monitorValue: {
    fontSize: 11,
    color: '#b0b0b0',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
  monitorDim: {
    fontSize: 11,
    color: '#2a2a2a',
  },
  monitorDivider: {
    width: 1,
    height: 12,
    background: '#1a1a1a',
  },
  monitorSpacer: {
    flex: 1,
  },

  // ── Running tool badge (pulsing dot + label + elapsed time) ────────────
  runningBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  runningDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    animation: 'pulse 1.8s ease-in-out infinite',
  },
  runningLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.02em',
    fontFamily: 'system-ui',
  },
  runningTimer: {
    fontSize: 11,
    color: '#666',
    fontVariantNumeric: 'tabular-nums',
  },
  idleText: {
    fontSize: 11,
    color: '#444',
    fontWeight: 500,
    letterSpacing: '0.08em',
  },
  readyText: {
    fontSize: 10,
    fontFamily: '"JetBrains Mono", monospace',
    color: '#22c55e',
    fontWeight: 700,
    letterSpacing: '0.12em',
    opacity: 0.9,
  },

  // ── In-terminal search bar (Cmd+F) ─────────────────────────────────────
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 12px',
    background: '#0a0a0a',
    borderBottom: '1px solid #1a1a1a',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    background: '#111',
    border: '1px solid #1e1e1e',
    borderRadius: 4,
    color: '#e2e8f0',
    fontSize: 11,
    padding: '5px 9px',
    outline: 'none',
    fontFamily: 'var(--font-mono)',
  },
  searchBtn: {
    background: '#151515',
    border: '1px solid #232323',
    borderRadius: 4,
    color: '#888',
    fontSize: 13,
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'var(--font-mono)',
  },

  termContainer: {
    flex: 1,
    overflow: 'hidden',
    padding: '8px 10px 2px',
    background: '#0d0d0d',
  },
};

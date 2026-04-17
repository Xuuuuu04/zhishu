import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import TerminalView from './components/TerminalView';
import SplitContainer from './components/SplitContainer';
import FileTreePanel from './components/FileTreePanel';
import FilePreviewPanel from './components/FilePreviewPanel';
import GitPanel from './components/GitPanel';
import TodoPanel from './components/TodoPanel';
import ToastStack from './components/ToastStack';
import SettingsModal from './components/SettingsModal';
import PromptDialog from './components/PromptDialog';
import CommandPalette from './components/CommandPalette';
import { useSessionStore } from './store/sessions';
import { playNotificationSound } from './utils/sound';

export default function App() {
  const mainRef = useRef(null);
  const termAreaRef = useRef(null);
  const {
    init, isLoading, projects, activeSessionId,
    yoloMode, toggleYoloMode,
    notificationsEnabled, toggleNotifications,
    sessionStatus, updateSessionStatus,
    toasts, addToast, removeToast,
    setActiveSession,
    addSessionToActiveProject, closeActiveSession, setSessionByIndex,
    splitPane, openSplit, closeSplit, swapSplitSessions,
    fileTreeOpen, closeFileTree,
    previewPanelOpen, closeFilePreview,
    gitPanelOpen, closeGitPanel,
    todoPanelOpen, closeTodoPanel, toggleTodoPanel,
    commandPaletteOpen, toggleCommandPalette, closeCommandPalette,
  } = useSessionStore();

  // Single global 5s tick replacing N per-component 1s intervals.
  // Both Sidebar (SessionRow) and TerminalView consume `now` from the store.
  const tickNow = useSessionStore((s) => s.tickNow);
  useEffect(() => {
    const t = setInterval(tickNow, 5000);
    return () => clearInterval(t);
  }, [tickNow]);

  useEffect(() => { init(); }, [init]);

  // When switching to a session in awaiting_review, mark it as viewed
  // so the next monitorTick transitions it back to idle_no_instruction.
  useEffect(() => {
    if (!activeSessionId) return;
    if (sessionStatus[activeSessionId]?.phase === 'awaiting_review') {
      window.electronAPI?.markSessionViewed(activeSessionId);
    }
  }, [activeSessionId, sessionStatus]);

  // ── Global keyboard shortcuts ─────────────────────────────────────────
  // Cmd+T → new session, Cmd+W → close session, Cmd+1..9 → jump to Nth
  // Cmd+\ → toggle split, Cmd+Shift+\ → swap split sessions
  // We use { capture: true } so xterm.js doesn't swallow the keys first.
  useEffect(() => {
    const handler = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      // Cmd+T → new session
      if ((e.key === 't' || e.key === 'T') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        addSessionToActiveProject();
        return;
      }
      // Cmd+W → close current session
      if ((e.key === 'w' || e.key === 'W') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        closeActiveSession();
        return;
      }
      // Cmd+1..9 → jump to Nth session (across all projects)
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        setSessionByIndex(parseInt(e.key, 10) - 1);
        return;
      }
      // Cmd+Shift+\ → swap split sessions
      if (e.key === '\\' && e.shiftKey) {
        e.preventDefault();
        swapSplitSessions();
        return;
      }
      // Cmd+Shift+T → toggle TODO panel
      if ((e.key === 't' || e.key === 'T') && e.shiftKey) {
        e.preventDefault();
        toggleTodoPanel();
        return;
      }
      // Cmd+P → command palette
      if ((e.key === 'p' || e.key === 'P') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }
      // Cmd+\ → toggle split (open with next session or close)
      if (e.key === '\\' && !e.shiftKey) {
        e.preventDefault();
        if (splitPane) {
          closeSplit();
        } else {
          // Find the next session that is not the active one
          const allSessions = projects.flatMap((p) => p.sessions.map((s) => s.id));
          const nextSession = allSessions.find((id) => id !== activeSessionId);
          if (nextSession) openSplit(nextSession);
        }
        return;
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [addSessionToActiveProject, closeActiveSession, setSessionByIndex, splitPane, closeSplit, openSplit, swapSplitSessions, projects, activeSessionId, toggleTodoPanel, toggleCommandPalette]);

  // Subscribe to per-session status updates (busy/idle phase changes)
  // Uses diff algorithm: only subscribe new sessions, only unsubscribe removed ones.
  const sessionSubs = useRef(new Map()); // sessionId -> unsubscribe fn
  useEffect(() => {
    const currentIds = new Set(
      projects.flatMap((p) => p.sessions.map((s) => s.id))
    );
    const prev = sessionSubs.current;

    // Unsubscribe removed sessions
    for (const [id, unsub] of prev) {
      if (!currentIds.has(id)) {
        unsub?.();
        prev.delete(id);
      }
    }

    // Subscribe new sessions
    for (const id of currentIds) {
      if (!prev.has(id)) {
        const unsub = window.electronAPI.onSessionStatus(id, (status) => {
          updateSessionStatus(id, status);
        });
        prev.set(id, unsub);
      }
    }
  }, [projects, updateSessionStatus]);

  // Cleanup all session subscriptions on unmount
  useEffect(() => {
    return () => {
      for (const [, unsub] of sessionSubs.current) {
        unsub?.();
      }
      sessionSubs.current.clear();
    };
  }, []);

  // Global subscription: AI response-complete events → toast + sound
  // This is the key "awareness" mechanism — fires every time an AI finishes
  // generating a response (busy → idle transition), NOT just on process exit.
  //
  // mergeKey 'completion-batch' ensures that when N sessions finish around the
  // same time (each has its own 3.5s debounce timer), they are merged into a
  // single toast instead of stacking N separate toasts.  The first completion
  // creates a normal toast; subsequent completions within the toast's lifetime
  // update its text to a summary like "SessionName +2 个会话".
  useEffect(() => {
    const unsub = window.electronAPI.onResponseComplete((payload) => {
      addToast({
        sessionId: payload.sessionId,
        tool: payload.tool,
        toolLabel: payload.toolLabel,
        sessionName: payload.sessionName,
        duration: payload.duration,
        mergeKey: 'completion-batch',
      });

      // Play the in-app chime whenever notifications are enabled
      if (notificationsEnabled) {
        playNotificationSound();
      }
    });
    return () => unsub?.();
  }, [addToast, notificationsEnabled]);

  // ── Build session lookup (sessionId -> { project, session }) ────────────
  const sessionMap = useMemo(() => {
    const map = new Map();
    for (const p of projects) {
      for (const s of p.sessions) {
        map.set(s.id, { project: p, session: s });
      }
    }
    return map;
  }, [projects]);

  // Render a single TerminalView for a given session ID.
  // When `inSplit` is true the terminal relaxes its minWidth so panes can
  // shrink down to 350px (normal single-view minWidth is 400px).
  const renderTerminal = useCallback((sid, { inSplit = false } = {}) => {
    const entry = sessionMap.get(sid);
    if (!entry) return null;
    const { project: p, session: s } = entry;
    return (
      <TerminalView
        sessionId={s.id}
        cwd={p.path}
        yoloMode={yoloMode}
        onYoloToggle={toggleYoloMode}
        sessionCreatedAt={s.createdAt}
        sessionStatus={sessionStatus[s.id]}
        notificationsEnabled={notificationsEnabled}
        onNotificationsToggle={toggleNotifications}
        sessionLastTool={s.lastTool}
        isActive={s.id === activeSessionId}
        splitMode={inSplit}
      />
    );
  }, [sessionMap, yoloMode, toggleYoloMode, sessionStatus, notificationsEnabled, toggleNotifications, activeSessionId]);

  // Determine which sessions are in the split (if any) so we can exclude them
  // from the background termStack.
  const splitSessionIds = useMemo(() => {
    if (!splitPane) return new Set();
    return new Set([activeSessionId, splitPane.sessionId]);
  }, [splitPane, activeSessionId]);

  // ── Panel width competition protection + split auto-close ────────────────
  // Uses ResizeObserver on termArea so Sidebar drag-resize also triggers it.
  //
  // Two-level threshold:
  //   - When termArea width < 500px, close panels in priority order (one per tick):
  //       1. PreviewPanel
  //       2. FileTreePanel
  //       3. TodoPanel
  //       4. GitPanel
  //       5. SplitPane (last resort)
  //   - When termArea width < 350px, also close split as a last resort.
  //   - When termArea width < 700px and split is active, close the split.
  useEffect(() => {
    if (!termAreaRef.current) return;

    let rafId = null;
    let latestWidth = 0;

    const observer = new ResizeObserver((entries) => {
      latestWidth = entries[0].contentRect.width;
      if (rafId !== null) return; // already scheduled
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const width = latestWidth;

        // Below 500px: start closing panels to give terminal breathing room
        if (width < 500) {
          if (previewPanelOpen) { closeFilePreview(); return; }
          if (fileTreeOpen)     { closeFileTree();    return; }
          if (todoPanelOpen)    { closeTodoPanel();   return; }
          if (gitPanelOpen)     { closeGitPanel();    return; }
        }

        // Below 350px: close split too (if panels are all already closed)
        if (width < 350) {
          if (splitPane) { closeSplit(); return; }
        }

        // Split pane needs at least 700px to be usable
        if (width < 700 && splitPane) {
          closeSplit();
        }
      });
    });
    observer.observe(termAreaRef.current);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [
    splitPane, closeSplit,
    previewPanelOpen, closeFilePreview,
    fileTreeOpen, closeFileTree,
    gitPanelOpen, closeGitPanel,
    todoPanelOpen, closeTodoPanel,
  ]);

  // ── Drop handler for sidebar session drag → open split ──────────────────
  const handleMainDrop = useCallback((e) => {
    const draggedId = e.dataTransfer.getData('application/x-prism-session');
    if (draggedId && draggedId !== activeSessionId) {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.classList?.remove('split-drop-zone-active');
      openSplit(draggedId);
    }
  }, [activeSessionId, openSplit]);

  const handleMainDragOver = useCallback((e) => {
    if (e.dataTransfer.types.includes('application/x-prism-session')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      e.currentTarget.classList.add('split-drop-zone-active');
    }
  }, []);

  const handleMainDragLeave = useCallback((e) => {
    e.currentTarget.classList.remove('split-drop-zone-active');
  }, []);

  if (isLoading) {
    return (
      <div style={styles.loading}>
        <span style={styles.loadingDot}>▣</span>
        <span style={{ color: '#555', fontSize: 12, fontFamily: 'monospace', marginTop: 12 }}>
          Initializing...
        </span>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <Sidebar />
      <main
        ref={mainRef}
        style={styles.main}
      >
        {/* Terminal area — takes remaining space, panels sit to its right */}
        <div
          ref={termAreaRef}
          style={styles.termArea}
          onDrop={handleMainDrop}
          onDragOver={handleMainDragOver}
          onDragLeave={handleMainDragLeave}
        >
          {activeSessionId ? (
            <>
              {/* SplitContainer: renders the two split sessions independently */}
              {splitPane && splitSessionIds.size === 2 && (
                <SplitContainer
                  primaryId={activeSessionId}
                  secondaryId={splitPane.sessionId}
                  direction={splitPane.direction}
                  ratio={splitPane.ratio}
                  renderTerminal={(sid) => renderTerminal(sid, { inSplit: true })}
                />
              )}
              {/* Background termStack: non-split sessions only.
                  When split is active, the two split sessions are NOT rendered here
                  at all — they render exclusively inside SplitContainer. This prevents
                  double-mounting two TerminalView instances for the same session, which
                  would cause duplicate IPC subscriptions and competing resize calls.
                  Non-split sessions remain mounted (visibility toggled) for xterm.js
                  dimension stability. */}
              <div style={{
                ...styles.termStack,
                ...(splitPane ? { position: 'absolute', pointerEvents: 'none' } : {}),
              }}>
                {projects.flatMap((p) =>
                  p.sessions.map((s) => {
                    const isSplitParticipant = splitPane && splitSessionIds.has(s.id);
                    const isVisible = !splitPane
                      ? s.id === activeSessionId
                      : !isSplitParticipant && s.id === activeSessionId;

                    return (
                      <div
                        key={s.id}
                        style={{
                          ...styles.termLayer,
                          visibility: isVisible ? 'visible' : 'hidden',
                          zIndex: isVisible ? 1 : 0,
                        }}
                      >
                        {isSplitParticipant ? null : (
                          <TerminalView
                            sessionId={s.id}
                            cwd={p.path}
                            yoloMode={yoloMode}
                            onYoloToggle={toggleYoloMode}
                            sessionCreatedAt={s.createdAt}
                            sessionStatus={sessionStatus[s.id]}
                            notificationsEnabled={notificationsEnabled}
                            onNotificationsToggle={toggleNotifications}
                            sessionLastTool={s.lastTool}
                            isActive={s.id === activeSessionId}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>▣</div>
              <p style={styles.emptyTitle}>智枢 ZhiShu</p>
              <p style={styles.emptyHint}>在左侧添加项目，创建会话，即可开始</p>
            </div>
          )}

        </div>

        {/* Top-level panels — sit to the right of termArea, each independently toggled */}
        <FileTreePanel />
        <FilePreviewPanel />
        <GitPanel />
        <TodoPanel />
      </main>

      {/* Floating in-app notifications (response-complete toasts) */}
      <ToastStack
        toasts={toasts}
        onDismiss={removeToast}
        onNavigate={(sessionId) => setActiveSession(sessionId)}
      />

      {/* Settings modal — only mounted when open */}
      <SettingsModal />

      {/* Custom prompt dialog (replaces window.prompt which Electron blocks) */}
      <PromptDialog />

      {/* Command palette — Portal-rendered, Cmd+P to open */}
      <CommandPalette />
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    height: '100vh',
    background: '#0a0a0a',
    fontFamily: 'system-ui, -apple-system',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
    background: '#0d0d0d',
    position: 'relative',
  },
  termArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    minWidth: 0,
  },
  termStack: {
    position: 'relative',
    flex: 1,
    overflow: 'hidden',
  },
  termLayer: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#0a0a0a',
  },
  loadingDot: {
    fontSize: 28,
    color: '#f59e0b',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 12,
  },
  emptyIcon: {
    fontSize: 40,
    color: '#1e1e1e',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#2a2a2a',
    letterSpacing: '-0.02em',
  },
  emptyHint: {
    fontSize: 13,
    color: '#1e1e1e',
  },
};

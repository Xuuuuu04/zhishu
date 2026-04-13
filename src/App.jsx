import React, { useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import TerminalView from './components/TerminalView';
import ToastStack from './components/ToastStack';
import SettingsModal from './components/SettingsModal';
import PromptDialog from './components/PromptDialog';
import { useSessionStore } from './store/sessions';
import { playNotificationSound } from './utils/sound';

export default function App() {
  const {
    init, isLoading, projects, activeSessionId,
    yoloMode, toggleYoloMode,
    notificationsEnabled, toggleNotifications,
    sessionStatus, updateSessionStatus,
    toasts, addToast, removeToast,
    setActiveSession,
    addSessionToActiveProject, closeActiveSession, setSessionByIndex,
  } = useSessionStore();

  // Single global 5s tick replacing N per-component 1s intervals.
  // Both Sidebar (SessionRow) and TerminalView consume `now` from the store.
  const tickNow = useSessionStore((s) => s.tickNow);
  useEffect(() => {
    const t = setInterval(tickNow, 5000);
    return () => clearInterval(t);
  }, [tickNow]);

  useEffect(() => { init(); }, [init]);

  // ── Global keyboard shortcuts ─────────────────────────────────────────
  // Cmd+T → new session, Cmd+W → close session, Cmd+1..9 → jump to Nth
  // We use { capture: true } so xterm.js doesn't swallow the keys first.
  useEffect(() => {
    const handler = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      // Cmd+T → new session
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        addSessionToActiveProject();
        return;
      }
      // Cmd+W → close current session
      if (e.key === 'w' || e.key === 'W') {
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
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [addSessionToActiveProject, closeActiveSession, setSessionByIndex]);

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
  useEffect(() => {
    const unsub = window.electronAPI.onResponseComplete((payload) => {
      addToast({
        sessionId: payload.sessionId,
        tool: payload.tool,
        toolLabel: payload.toolLabel,
        sessionName: payload.sessionName,
        duration: payload.duration,
      });

      // Play the in-app chime whenever notifications are enabled
      if (notificationsEnabled) {
        playNotificationSound();
      }
    });
    return () => unsub?.();
  }, [addToast, notificationsEnabled]);

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
      <main style={styles.main}>
        {activeSessionId ? (
          // All terminal views are mounted simultaneously and stacked.
          // The active one is on top (z-index); the rest are behind (visibility: hidden).
          // This keeps ALL pty sessions alive AND ensures xterm.js can compute dimensions
          // (display:none would break FitAddon since the container has no layout dimensions).
          <div style={styles.termStack}>
            {projects.flatMap((p) =>
              p.sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    ...styles.termLayer,
                    visibility: s.id === activeSessionId ? 'visible' : 'hidden',
                    zIndex: s.id === activeSessionId ? 1 : 0,
                  }}
                >
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
                </div>
              ))
            )}
          </div>
        ) : (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>▣</div>
            <p style={styles.emptyTitle}>AI Terminal Manager</p>
            <p style={styles.emptyHint}>在左侧添加项目，创建会话，即可开始</p>
          </div>
        )}
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
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#0d0d0d',
    position: 'relative',
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

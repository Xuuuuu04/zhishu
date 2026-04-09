import React, { useEffect } from 'react';

// Must stay in sync with TerminalView's TOOL_INFO_BY_ID
const TOOL_COLORS = {
  claude: '#d97706',
  codex: '#16a34a',
  gemini: '#3b82f6',
  qwen: '#06b6d4',
};

const AUTO_DISMISS_MS = 6000;

/**
 * Top-right stacked toast notifications.
 * Each toast represents an AI response-complete event; clicking jumps to that session.
 *
 * Props:
 *  - toasts: array of { id, sessionId, tool, toolLabel, sessionName, duration }
 *  - onDismiss(id): remove a toast
 *  - onNavigate(sessionId): switch active session to this one
 */
export default function ToastStack({ toasts, onDismiss, onNavigate }) {
  return (
    <div style={styles.container}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

// ─── Individual toast ─────────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss, onNavigate }) {
  // Auto-dismiss timer
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const color = TOOL_COLORS[toast.tool] || '#22c55e';

  const handleClick = () => {
    onNavigate(toast.sessionId);
    onDismiss(toast.id);
  };

  const durationText = formatDuration(toast.duration);

  return (
    <div style={{ ...styles.toast, borderLeftColor: color }} onClick={handleClick}>
      {/* Accent glow */}
      <div style={{ ...styles.glow, background: `radial-gradient(circle at 0% 50%, ${color}22, transparent 70%)` }} />

      <div style={styles.content}>
        {/* Header: tool icon + status */}
        <div style={styles.header}>
          <span style={{ ...styles.toolDot, background: color, boxShadow: `0 0 8px ${color}` }} />
          <span style={{ ...styles.toolName, color }}>{toast.toolLabel}</span>
          <span style={styles.statusText}>响应完成</span>
          <button
            style={styles.closeBtn}
            onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }}
            title="关闭"
          >
            ×
          </button>
        </div>

        {/* Body: session name + duration */}
        <div style={styles.body}>
          <span style={styles.sessionName}>{toast.sessionName}</span>
        </div>

        {/* Footer: duration + CTA */}
        <div style={styles.footer}>
          <span style={styles.duration}>耗时 {durationText}</span>
          <span style={{ ...styles.cta, color }}>前往查看 →</span>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(ms) {
  if (!ms) return '0s';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  container: {
    position: 'fixed',
    top: 48,          // Below the macOS traffic-light area
    right: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    zIndex: 9999,
    pointerEvents: 'none',  // Let empty space click through
  },
  toast: {
    position: 'relative',
    width: 320,
    background: 'linear-gradient(135deg, #141414 0%, #0d0d0d 100%)',
    border: '1px solid #222',
    borderLeftWidth: 3,
    borderRadius: 8,
    cursor: 'pointer',
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.4)',
    pointerEvents: 'auto',
    animation: 'toast-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  glow: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  content: {
    position: 'relative',
    padding: '11px 14px 11px 15px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    marginBottom: 4,
  },
  toolDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  toolName: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '-0.005em',
    fontFamily: '"SF Pro Display", system-ui',
  },
  statusText: {
    fontSize: 11,
    color: '#666',
    fontWeight: 500,
    flex: 1,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#3a3a3a',
    fontSize: 16,
    cursor: 'pointer',
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    outline: 'none',
    padding: 0,
    lineHeight: 1,
    transition: 'color 0.15s',
  },
  body: {
    marginBottom: 6,
  },
  sessionName: {
    fontSize: 12,
    color: '#c0c0c0',
    fontWeight: 500,
    fontFamily: 'system-ui',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTop: '1px solid #1a1a1a',
    marginTop: 2,
  },
  duration: {
    fontSize: 10,
    color: '#4a4a4a',
    fontFamily: '"JetBrains Mono", monospace',
    fontVariantNumeric: 'tabular-nums',
  },
  cta: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.02em',
    fontFamily: 'system-ui',
  },
};

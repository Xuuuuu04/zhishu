import React, { useEffect } from 'react';
import { TOOL_COLORS } from '../constants/toolVisuals';

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
//
// Two variants:
//   • completion: AI response finished — shows tool badge, session name,
//                 duration, "前往查看" CTA; clicking navigates to that session.
//   • info:       generic lightweight notification (HEIC converted, file saved,
//                 etc.) — just shows title + body, click dismisses.

function ToastItem({ toast, onDismiss, onNavigate }) {
  const isInfo = toast.kind === 'info';

  // Auto-dismiss timer — info toasts are shorter-lived (3s vs 6s)
  useEffect(() => {
    const timeout = isInfo ? 3000 : AUTO_DISMISS_MS;
    const t = setTimeout(() => onDismiss(toast.id), timeout);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss, isInfo]);

  const color = isInfo
    ? (toast.color || '#f59e0b')
    : (TOOL_COLORS[toast.tool] || '#22c55e');

  const handleClick = () => {
    if (isInfo) {
      onDismiss(toast.id);
    } else {
      onNavigate(toast.sessionId);
      onDismiss(toast.id);
    }
  };

  // ── Info variant (simple title + body) ─────────────────────────────
  if (isInfo) {
    return (
      <div style={{ ...styles.toast, borderLeftColor: color }} onClick={handleClick}>
        <div style={{ ...styles.glow, background: `radial-gradient(circle at 0% 50%, ${color}22, transparent 70%)` }} />
        <div style={styles.content}>
          <div style={styles.header}>
            <span style={{ ...styles.toolDot, background: color, boxShadow: `0 0 8px ${color}` }} />
            <span style={{ ...styles.toolName, color }}>{toast.title || '提示'}</span>
            <div style={{ flex: 1 }} />
            <button
              style={styles.closeBtn}
              onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }}
              title="关闭"
            >×</button>
          </div>
          {toast.body && (
            <div style={styles.body}>
              <span style={styles.sessionName}>{toast.body}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Completion variant (AI response done) ──────────────────────────
  const durationText = formatDuration(toast.duration);

  return (
    <div style={{ ...styles.toast, borderLeftColor: color }} onClick={handleClick}>
      <div style={{ ...styles.glow, background: `radial-gradient(circle at 0% 50%, ${color}22, transparent 70%)` }} />
      <div style={styles.content}>
        <div style={styles.header}>
          <span style={{ ...styles.toolDot, background: color, boxShadow: `0 0 8px ${color}` }} />
          <span style={{ ...styles.toolName, color }}>{toast.toolLabel}</span>
          <span style={styles.statusText}>响应完成</span>
          <button
            style={styles.closeBtn}
            onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }}
            title="关闭"
          >×</button>
        </div>
        <div style={styles.body}>
          <span style={styles.sessionName}>{toast.sessionName}</span>
        </div>
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

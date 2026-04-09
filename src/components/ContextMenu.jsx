import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

/**
 * Generic right-click context menu rendered as an overlay at the cursor position.
 *
 * Props:
 *  - x, y    — viewport coordinates of the cursor
 *  - items   — array of { label, icon?, onClick, danger?, separator? }
 *  - onClose — called when the menu should dismiss (click outside, Escape, item click)
 *
 * Auto-flips horizontally / vertically if the menu would overflow the viewport.
 */
export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Auto-flip if the menu would overflow the viewport edges
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    if (rect.right > winW)  el.style.left = `${winW - rect.width - 8}px`;
    if (rect.bottom > winH) el.style.top  = `${winH - rect.height - 8}px`;
  }, []);

  // CRITICAL: render via Portal into document.body so the menu's
  // `position: fixed` is relative to the viewport, NOT to any transformed
  // ancestor (FileTreePanel uses transform for its slide-in animation,
  // which would otherwise scope our fixed positioning to its local box).
  return ReactDOM.createPortal(
    <>
      {/* Click-outside backdrop — ignore right-click button so the same right-click
          that just opened the menu doesn't immediately close it on mouseup. */}
      <div
        onMouseDown={(e) => { if (e.button === 0) onClose(); }}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        style={styles.backdrop}
      />
      {/* Menu */}
      <div
        ref={menuRef}
        style={{ ...styles.menu, left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item, i) => {
          if (item.separator) {
            return <div key={`sep-${i}`} style={styles.separator} />;
          }
          return (
            <button
              key={item.label}
              className="ctx-item"
              style={{
                ...styles.item,
                color: item.danger ? '#f87171' : '#d0d0d0',
              }}
              onClick={() => {
                item.onClick();
                onClose();
              }}
            >
              {item.icon && <span style={styles.icon}>{item.icon}</span>}
              <span style={styles.label}>{item.label}</span>
              {item.shortcut && <span style={styles.shortcut}>{item.shortcut}</span>}
            </button>
          );
        })}
      </div>
    </>,
    document.body
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 9000,
  },
  menu: {
    position: 'fixed',
    minWidth: 180,
    background: '#0d0d0d',
    border: '1px solid #1e1e1e',
    borderRadius: 7,
    padding: 5,
    zIndex: 9001,
    boxShadow: '0 12px 32px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.4)',
    animation: 'toast-in 0.12s ease',
    fontFamily: 'var(--font-ui)',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    padding: '6px 10px',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 500,
    transition: 'background 0.1s',
  },
  icon: {
    width: 14,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    color: '#666',
    flexShrink: 0,
  },
  label: { flex: 1 },
  shortcut: {
    fontSize: 10,
    color: '#3a3a3a',
    fontFamily: 'var(--font-mono)',
  },
  separator: {
    height: 1,
    background: '#1a1a1a',
    margin: '4px 6px',
  },
};

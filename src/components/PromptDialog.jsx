import React, { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../store/sessions';

/**
 * Custom replacement for window.prompt() — Electron disables the native API.
 *
 * Reads the current dialog spec from the global store. If null, renders nothing.
 * Otherwise shows a modal with title + input + cancel/confirm.
 */
export default function PromptDialog() {
  const dialog = useSessionStore((s) => s.promptDialog);
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  // Initialize value when a new dialog opens, focus the input
  useEffect(() => {
    if (!dialog) return;
    setValue(dialog.defaultValue || '');
    // Focus + select on next tick after render
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
  }, [dialog]);

  // Esc → cancel
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e) => {
      if (e.key === 'Escape') dialog.onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  if (!dialog) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim()) dialog.onConfirm(value.trim());
  };

  return (
    <div style={styles.backdrop} onClick={dialog.onCancel}>
      <form
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div style={styles.title}>{dialog.title}</div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={dialog.placeholder}
          style={styles.input}
        />
        <div style={styles.actions}>
          <button type="button" style={styles.btnCancel} onClick={dialog.onCancel}>
            取消
          </button>
          <button type="submit" style={styles.btnConfirm}>
            {dialog.confirmLabel || '确定'}
          </button>
        </div>
      </form>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    animation: 'fade-in 0.15s ease',
  },
  modal: {
    width: 380,
    background: '#0d0d0d',
    border: '1px solid #1e1e1e',
    borderRadius: 9,
    padding: 18,
    boxShadow: '0 16px 48px rgba(0,0,0,0.7), 0 4px 12px rgba(0,0,0,0.5)',
    fontFamily: 'var(--font-ui)',
    animation: 'toast-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e2e8f0',
    marginBottom: 12,
    letterSpacing: '-0.005em',
  },
  input: {
    width: '100%',
    background: '#0a0a0a',
    border: '1px solid #2a2a2a',
    borderRadius: 5,
    color: '#e2e8f0',
    fontSize: 13,
    padding: '9px 12px',
    outline: 'none',
    fontFamily: 'var(--font-mono)',
    marginBottom: 14,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  btnCancel: {
    background: '#151515',
    border: '1px solid #2a2a2a',
    borderRadius: 5,
    color: '#888',
    fontSize: 12,
    padding: '6px 16px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    fontWeight: 500,
  },
  btnConfirm: {
    background: '#1a150a',
    border: '1px solid #3a2e0a',
    borderRadius: 5,
    color: '#f59e0b',
    fontSize: 12,
    padding: '6px 18px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    fontWeight: 600,
  },
};

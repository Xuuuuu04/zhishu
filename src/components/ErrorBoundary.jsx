import React from 'react';

/**
 * Top-level error boundary — catches render errors and shows them
 * instead of leaving a black screen with no feedback.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Also log to main process via console (picked up by console-message event)
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={styles.wrapper}>
          <div style={styles.icon}>✕</div>
          <p style={styles.title}>Render Error</p>
          <pre style={styles.message}>{this.state.error.message}</pre>
          <pre style={styles.stack}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#0a0a0a',
    padding: 40,
    gap: 12,
  },
  icon: { fontSize: 32, color: '#ef4444' },
  title: { color: '#ef4444', fontSize: 14, fontFamily: 'system-ui', fontWeight: 600 },
  message: {
    color: '#fca5a5',
    fontSize: 12,
    fontFamily: 'monospace',
    maxWidth: 700,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  stack: {
    color: '#3a3a3a',
    fontSize: 11,
    fontFamily: 'monospace',
    maxWidth: 700,
    maxHeight: 300,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
  },
};

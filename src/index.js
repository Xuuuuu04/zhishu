import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// ─── Bundled fonts (no network dependency, consistent across systems) ───
// Inter — current best-in-class open-source UI typeface; used by Linear,
// GitHub, Figma. JetBrains Mono is the developer standard for code.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';

// Global reset + app styles injected at runtime
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  /* ─── CSS variables: typography ─────────────────────────────────────── */
  :root {
    --font-ui:    'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', system-ui, sans-serif;
    --font-mono:  'JetBrains Mono', 'SF Mono', 'Menlo', Consolas, monospace;
    --font-brand: 'Inter', -apple-system, 'SF Pro Display', 'PingFang SC', system-ui, sans-serif;
  }

  /* ─── Theme color tokens (dark by default) ──────────────────────────── */
  :root,
  :root[data-theme='dark'] {
    --bg-root:      #0a0a0a;
    --bg-sidebar:   #0b0b0b;
    --bg-main:      #0d0d0d;
    --bg-toolbar:   #0f0f0f;
    --bg-card:      #111111;
    --border-base:  #1a1a1a;
    --text-primary:   #e2e8f0;
    --text-secondary: #a0a0a0;
    --text-tertiary:  #555555;
    --text-mute:      #2a2a2a;
  }

  :root[data-theme='light'] {
    --bg-root:      #f3f4f6;
    --bg-sidebar:   #ffffff;
    --bg-main:      #fafafa;
    --bg-toolbar:   #f8f8f8;
    --bg-card:      #ffffff;
    --border-base:  #e5e5e5;
    --text-primary:   #1a1a1a;
    --text-secondary: #555555;
    --text-tertiary:  #888888;
    --text-mute:      #c0c0c0;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg-root);
    overflow: hidden;
    font-family: var(--font-ui);
    font-feature-settings: 'cv11', 'ss01', 'ss03';
    font-optical-sizing: auto;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    color: var(--text-primary);
    transition: background-color 0.2s, color 0.2s;
  }

  /* Thin, subtle scrollbars matching the dark palette */
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #333; }

  /* xterm.js — inherit dark aesthetic */
  .xterm { height: 100%; padding: 2px 0; }
  .xterm-viewport { overflow-y: auto !important; background: transparent !important; }
  .xterm-screen { background: transparent !important; }

  /* Window drag region for macOS frameless titlebar
     (click-through for interactive elements inside the drag region) */
  .drag-region { -webkit-app-region: drag; }
  .drag-region button,
  .drag-region input,
  .drag-region a { -webkit-app-region: no-drag; }

  /* Subtle button interactions */
  button { outline: none; font-family: var(--font-ui); }
  button:active { transform: translateY(0.5px); }
  input { font-family: var(--font-ui); }

  /* File tree row hover */
  .tree-row:hover { background: #161616; color: #e2e8f0 !important; }

  /* Template menu item hover */
  .template-item:hover { background: #1a1a1a; }

  /* Sidebar resizer — show a subtle accent on hover/drag */
  .sidebar-resizer:hover { background: rgba(245, 158, 11, 0.4) !important; }
  .sidebar-resizer:active { background: rgba(245, 158, 11, 0.65) !important; }

  /* Context menu item hover */
  .ctx-item:hover { background: #1a1a1a; }

  /* Sidebar action button hover (project + session row buttons) */
  .sidebar-action-btn:hover { color: #fff !important; background: #222 !important; }

  /* Drag-over highlight on the terminal area when dragging a file in */
  .terminal-drop-zone-active {
    box-shadow: inset 0 0 0 2px rgba(245, 158, 11, 0.6) !important;
    background: rgba(245, 158, 11, 0.04) !important;
  }

  /* Pulsing animation for the "running" status indicator dot */
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.55; transform: scale(0.85); }
  }

  /* Subtle entrance animation for status badge transitions */
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-2px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Toast notification entrance: slide in from the right + fade */
  @keyframes toast-in {
    from { opacity: 0; transform: translateX(24px) scale(0.96); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
  }

  /* Slower breathing animation for the "idle/response-complete" state */
  @keyframes breathe {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.45; transform: scale(0.8); }
  }

  /* Spinner rotation for loading indicators */
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* Repo card hover (multi-repo git scan view) */
  .repo-card:hover { background: #131313; border-color: #1e1e1e; }
`;
document.head.appendChild(globalStyle);

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

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
    /* Background layers (darkest → lightest used) */
    --bg-root:          #0e0e10;
    --bg-sidebar:       #101012;
    --bg-main:          #121214;
    --bg-toolbar:       #141416;
    --bg-card:          #18181b;
    --bg-input:         #0e0e10;
    --bg-button:        #1a1a1e;
    --bg-hover:         #1c1c20;
    --bg-header-hover:  #1e1e22;
    --bg-panel-header:  #121214;
    --bg-deep:          #09090b;

    /* Borders */
    --border-base:      #27272a;
    --border-light:     #1e1e22;
    --border-subtle:    #18181b;
    --border-mid:       #2a2a2e;
    --border-input:     #3a3a3e;
    --border-button:    #2a2a2e;

    /* Text layers — optimized for WCAG AA contrast on dark backgrounds */
    --text-primary:     #f0f0f2;
    --text-secondary:   #a1a1aa;
    --text-tertiary:    #71717a;
    --text-mute:        #3f3f46;
    --text-heading:     #e4e4e7;
    --text-label:       #71717a;
    --text-dim:         #52525b;
    --text-placeholder: #52525b;
    --text-faint:       #3f3f46;
  }

  :root[data-theme='light'] {
    /* Background layers */
    --bg-root:          #f3f4f6;
    --bg-sidebar:       #ffffff;
    --bg-main:          #fafafa;
    --bg-toolbar:       #f5f5f5;
    --bg-card:          #ffffff;
    --bg-input:         #f9fafb;
    --bg-button:        #f0f0f0;
    --bg-hover:         #f0f0f0;
    --bg-header-hover:  #ebebeb;
    --bg-panel-header:  #f7f7f7;
    --bg-deep:          #e8e8e8;

    /* Borders */
    --border-base:      #e5e5e5;
    --border-light:     #eaeaea;
    --border-subtle:    #efefef;
    --border-mid:       #d4d4d4;
    --border-input:     #d4d4d4;
    --border-button:    #d4d4d4;

    /* Text layers */
    --text-primary:     #1a1a1a;
    --text-secondary:   #555555;
    --text-tertiary:    #888888;
    --text-mute:        #c0c0c0;
    --text-heading:     #1a1a1a;
    --text-label:       #888888;
    --text-dim:         #aaaaaa;
    --text-placeholder: #bbbbbb;
    --text-faint:       #d4d4d4;
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
  ::-webkit-scrollbar-thumb { background: var(--border-base, #27272a); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-tertiary, #71717a); }

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
  .tree-row:hover { background: var(--bg-hover, #1c1c20); color: var(--text-primary, #f0f0f2) !important; }

  /* Template menu item hover */
  .template-item:hover { background: #1a1a1a; }

  /* Sidebar resizer — show a subtle accent on hover/drag */
  .sidebar-resizer:hover { background: rgba(245, 158, 11, 0.4) !important; }
  .sidebar-resizer:active { background: rgba(245, 158, 11, 0.65) !important; }

  /* Panel resizer — show a subtle accent on hover/drag */
  .panel-resizer:hover { background: rgba(245, 158, 11, 0.4) !important; }
  .panel-resizer:active { background: rgba(245, 158, 11, 0.65) !important; }

  /* Context menu item hover */
  .ctx-item:hover { background: var(--bg-hover, #1c1c20); }

  /* Prompt template item hover */
  .template-item:hover { background: #151515; }
  .template-item:hover .template-action-btn { color: #888 !important; }

  /* Sidebar action button hover (project + session row buttons) */
  .sidebar-action-btn:hover { color: #fff !important; background: var(--bg-hover, #1c1c20) !important; }

  /* Grip handle hover — amber highlight */
  .sidebar-grip:hover { color: #f59e0b !important; cursor: grab; }

  /* Drag-over highlight on the terminal area when dragging a file in */
  .terminal-drop-zone-active {
    box-shadow: inset 0 0 0 2px rgba(245, 158, 11, 0.6) !important;
    background: rgba(245, 158, 11, 0.04) !important;
  }

  /* Drag-over highlight when dragging a session from sidebar to create split */
  .split-drop-zone-active {
    box-shadow: inset 0 0 0 2px rgba(245, 158, 11, 0.5) !important;
    background: rgba(245, 158, 11, 0.03) !important;
  }

  /* Split pane divider — amber accent on hover/drag */
  .split-divider:hover { background: rgba(245, 158, 11, 0.4) !important; }
  .split-divider:active { background: rgba(245, 158, 11, 0.65) !important; }

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
    50%      { opacity: 0.65; transform: scale(0.85); }
  }

  /* Spinner rotation for loading indicators */
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* Repo card hover (multi-repo git scan view) */
  .repo-card:hover { background: var(--bg-hover, #1c1c20); border-color: var(--border-mid, #2a2a2e); }

  /* Todo in_progress subtle border pulse */
  @keyframes todo-pulse {
    0%, 100% { border-left-color: #f59e0b; }
    50%      { border-left-color: #f59e0b50; }
  }
`;
document.head.appendChild(globalStyle);

// ─── Global drag-drop guard ──────────────────────────────────────────────
// Prevent the browser's default "navigate to file://" behavior when users
// drop files anywhere on the window. Specific drop zones (TerminalView,
// FileTreePanel) still handle their own onDrop via React.
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
}, false);
window.addEventListener('drop', (e) => {
  // Only prevent default if no specific handler claimed the event.
  // We use the `_handled` flag set by TerminalView's drop handler.
  if (!e._handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}, false);

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

import React, { useState, useEffect, useCallback } from 'react';
import ContextMenu from './ContextMenu';
import { useSessionStore } from '../store/sessions';

// ─── File / folder icons ─────────────────────────────────────────────────────

const FolderIcon = ({ open }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {open ? (
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z M2 13l3 6h17l-3-6z" />
    ) : (
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    )}
  </svg>
);

const FileIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const ChevronIcon = ({ collapsed }) => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.18s' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// Git status code → letter + color (mirrors GitPanel)
const GIT_STATUS_VISUAL = {
  modified:  { letter: 'M', color: '#eab308' },
  added:     { letter: 'A', color: '#22c55e' },
  deleted:   { letter: 'D', color: '#ef4444' },
  renamed:   { letter: 'R', color: '#a855f7' },
  conflicted:{ letter: '!', color: '#f97316' },
  untracked: { letter: 'U', color: '#06b6d4' },
};

// ─── Recursive tree node ─────────────────────────────────────────────────────

function TreeNode({ item, depth, onFileSelect, gitStatusMap, rootPath, onContextMenu, refreshParent }) {
  const [collapsed, setCollapsed] = useState(true);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);

  const isDir = item.type === 'dir';

  // Look up git status for this file (path is relative to git root)
  const relPath = rootPath && item.path.startsWith(rootPath)
    ? item.path.slice(rootPath.length + 1)
    : null;
  const gitStatus = relPath ? gitStatusMap?.[relPath] : null;
  const gitVisual = gitStatus ? GIT_STATUS_VISUAL[gitStatus] : null;

  const loadChildren = useCallback(async () => {
    setLoading(true);
    const res = await window.electronAPI.listDir(item.path);
    setLoading(false);
    setChildren(res?.items || []);
  }, [item.path]);

  const toggle = useCallback(async () => {
    if (!isDir) {
      onFileSelect?.(item);
      return;
    }
    if (collapsed && children === null) {
      await loadChildren();
    }
    setCollapsed((c) => !c);
  }, [isDir, collapsed, children, item, onFileSelect, loadChildren]);

  // ── Drag-and-drop: drag this file path to the terminal ──────────────
  const handleDragStart = (e) => {
    // Both formats so the terminal drop handler can pick whichever is easier
    e.dataTransfer.setData('text/plain', item.path);
    e.dataTransfer.setData('application/x-zhishu-file', item.path);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // ── Right-click handler (called from React's onMouseDown) ──────────
  //
  // KNOWN BUG: HTML5 `draggable=true` consumes contextmenu events on its
  // host element. The reliable workaround: listen for mousedown + button===2
  // which fires BEFORE the drag system claims the event.
  const triggerContextMenu = (clientX, clientY) => {
    onContextMenu?.({
      x: clientX,
      y: clientY,
      item,
      onChanged: () => {
        if (isDir && children !== null) loadChildren();
        refreshParent?.();
      },
    });
  };

  const isHidden = item.hidden || item.name.startsWith('.');

  return (
    <div>
      <div
        onClick={(e) => {
          // Ignore right-button click — handled by onMouseDown below
          if (e.button === 2) return;
          toggle();
        }}
        onMouseDown={(e) => {
          // Right-click → trigger context menu
          // (mousedown fires before draggable's drag system claims events)
          if (e.button === 2) {
            e.preventDefault();
            e.stopPropagation();
            triggerContextMenu(e.clientX, e.clientY);
          }
        }}
        onContextMenu={(e) => {
          // Backup path: if mousedown above didn't fire (e.g. trackpad two-finger
          // tap on macOS sends contextmenu directly), trigger here too. Idempotent.
          e.preventDefault();
          e.stopPropagation();
          triggerContextMenu(e.clientX, e.clientY);
        }}
        draggable
        onDragStart={handleDragStart}
        style={{
          ...nodeStyles.row,
          paddingLeft: 8 + depth * 14,
          opacity: isHidden ? 0.55 : 1,
        }}
        className="tree-row"
      >
        {isDir ? (
          <span style={nodeStyles.chevron}><ChevronIcon collapsed={collapsed} /></span>
        ) : (
          <span style={nodeStyles.chevronEmpty} />
        )}
        <span style={{
          ...nodeStyles.icon,
          color: isDir ? (isHidden ? '#7a5a10' : '#f59e0b') : '#5a5a5a',
        }}>
          {isDir ? <FolderIcon open={!collapsed} /> : <FileIcon />}
        </span>
        <span style={{
          ...nodeStyles.name,
          color: gitVisual ? gitVisual.color : nodeStyles.name.color,
        }}>{item.name}</span>
        {gitVisual && (
          <span style={{ ...nodeStyles.gitBadge, color: gitVisual.color }}>
            {gitVisual.letter}
          </span>
        )}
      </div>

      {/* Recursive children */}
      {!collapsed && children && (
        <div>
          {loading && <div style={{ ...nodeStyles.loadingHint, paddingLeft: 8 + (depth + 1) * 14 }}>...</div>}
          {children.length === 0 && (
            <div style={{ ...nodeStyles.emptyHint, paddingLeft: 8 + (depth + 1) * 14 }}>(空)</div>
          )}
          {children.map((child) => (
            <TreeNode
              key={child.path}
              item={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              gitStatusMap={gitStatusMap}
              rootPath={rootPath}
              onContextMenu={onContextMenu}
              refreshParent={loadChildren}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const nodeStyles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px 4px 8px',
    cursor: 'pointer',
    borderRadius: 4,
    margin: '0 4px',
    transition: 'background 0.1s',
    fontSize: 12,
    fontFamily: 'var(--font-ui)',
    color: '#a8a8a8',
    userSelect: 'none',
  },
  chevron: {
    width: 9,
    height: 9,
    color: '#3a3a3a',
    flexShrink: 0,
  },
  chevronEmpty: {
    width: 9,
    flexShrink: 0,
  },
  icon: {
    display: 'flex',
    flexShrink: 0,
  },
  name: {
    fontSize: 12,
    color: '#a8a8a8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  },
  gitBadge: {
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    flexShrink: 0,
    marginLeft: 4,
  },
  loadingHint: {
    fontSize: 11,
    color: '#3a3a3a',
    padding: '4px 10px',
    fontFamily: 'var(--font-mono)',
  },
  emptyHint: {
    fontSize: 11,
    color: '#2a2a2a',
    padding: '4px 10px',
    fontStyle: 'italic',
  },
};

// ─── File preview pane ──────────────────────────────────────────────────────

function FilePreview({ file, onClose }) {
  const [preview, setPreview] = useState({ loading: true });

  useEffect(() => {
    if (!file) return;
    setPreview({ loading: true });
    window.electronAPI.readFilePreview(file.path).then((res) => {
      setPreview({ loading: false, ...res });
    });
  }, [file]);

  if (!file) return null;

  return (
    <div style={previewStyles.wrapper}>
      <div style={previewStyles.header}>
        <span style={previewStyles.fileName}>{file.name}</span>
        <button style={previewStyles.closeBtn} onClick={onClose}>×</button>
      </div>
      <div style={previewStyles.body}>
        {preview.loading && <div style={previewStyles.placeholder}>加载中...</div>}
        {preview.error && <div style={previewStyles.error}>{preview.error}</div>}
        {preview.content && <pre style={previewStyles.content}>{preview.content}</pre>}
      </div>
    </div>
  );
}

const previewStyles = {
  wrapper: {
    borderTop: '1px solid #1a1a1a',
    background: '#0a0a0a',
    flexShrink: 0,
    maxHeight: '40%',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid #161616',
  },
  fileName: {
    fontSize: 11,
    color: '#888',
    fontFamily: 'var(--font-mono)',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#444',
    fontSize: 16,
    cursor: 'pointer',
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: 10,
  },
  placeholder: {
    fontSize: 11,
    color: '#3a3a3a',
    fontFamily: 'var(--font-mono)',
  },
  error: {
    fontSize: 11,
    color: '#f87171',
    fontFamily: 'var(--font-mono)',
  },
  content: {
    fontSize: 10.5,
    color: '#a0a0a0',
    fontFamily: 'var(--font-mono)',
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    margin: 0,
  },
};

// ─── Main panel — slides in from the right side ──────────────────────────────

export default function FileTreePanel({ open, cwd, onClose }) {
  const [rootItems, setRootItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [gitStatusMap, setGitStatusMap] = useState({});
  // Right-click menu state
  const [ctxMenu, setCtxMenu] = useState(null);
  // Filter input
  const [filter, setFilter] = useState('');
  // Custom prompt (replaces window.prompt)
  const showPrompt = useSessionStore((s) => s.showPrompt);

  // Fetch dir + git status in parallel
  const loadAll = useCallback(async () => {
    if (!cwd) return;
    setLoading(true);
    const [dirRes, gitRes] = await Promise.all([
      window.electronAPI.listDir(cwd),
      window.electronAPI.gitStatus(cwd),
    ]);
    setRootItems(dirRes?.items || []);

    // Build the path → status map (only if this dir is a git repo)
    const map = {};
    if (gitRes?.isRepo && gitRes.files) {
      for (const f of gitRes.files) {
        map[f.path] = f.status;
      }
    }
    setGitStatusMap(map);
    setLoading(false);
  }, [cwd]);

  useEffect(() => {
    if (!open || !cwd) return;
    setSelectedFile(null);
    loadAll();
  }, [open, cwd, loadAll]);

  const refresh = loadAll;

  // ── File operation handlers (called from the context menu) ──────────
  const buildContextMenuItems = ({ item, onChanged }) => {
    const isDir = item.type === 'dir';
    const items = [];

    if (isDir) {
      items.push({
        label: '新建文件',
        icon: '＋',
        onClick: async () => {
          const name = await showPrompt({ title: '新建文件', defaultValue: 'untitled.txt' });
          if (!name) return;
          const r = await window.electronAPI.newFile(item.path, name);
          if (r?.error) return alert(r.error);
          onChanged();
        },
      });
      items.push({
        label: '新建文件夹',
        icon: '◰',
        onClick: async () => {
          const name = await showPrompt({ title: '新建文件夹', defaultValue: 'new-folder' });
          if (!name) return;
          const r = await window.electronAPI.newFolder(item.path, name);
          if (r?.error) return alert(r.error);
          onChanged();
        },
      });
      items.push({ separator: true });
    }

    items.push({
      label: '打开',
      icon: '↗',
      onClick: () => window.electronAPI.openFile(item.path),
    });
    items.push({
      label: '在 Finder 中显示',
      icon: '⌖',
      onClick: () => window.electronAPI.revealInFinder(item.path),
    });
    items.push({
      label: '复制路径',
      icon: '⎘',
      onClick: () => navigator.clipboard.writeText(item.path),
    });
    items.push({ separator: true });

    items.push({
      label: '重命名',
      icon: '✎',
      onClick: async () => {
        const newName = await showPrompt({ title: '重命名', defaultValue: item.name });
        if (!newName || newName === item.name) return;
        const r = await window.electronAPI.renameFile(item.path, newName);
        if (r?.error) return alert(r.error);
        onChanged();
      },
    });
    items.push({
      label: '复制副本',
      icon: '⊕',
      onClick: async () => {
        const dest = `${item.path}.copy`;
        const r = await window.electronAPI.copyFile(item.path, dest);
        if (r?.error) return alert(r.error);
        onChanged();
      },
    });
    items.push({
      label: '压缩为 zip',
      icon: '🗜',
      onClick: async () => {
        const r = await window.electronAPI.zipFile(item.path);
        if (r?.error) return alert(r.error);
        onChanged();
      },
    });
    items.push({ separator: true });
    items.push({
      label: '移到废纸篓',
      icon: '🗑',
      danger: true,
      onClick: async () => {
        if (!window.confirm(`确定将 "${item.name}" 移到废纸篓？`)) return;
        const r = await window.electronAPI.trashFile(item.path);
        if (r?.error) return alert(r.error);
        onChanged();
      },
    });

    return items;
  };

  const onContextMenu = (payload) => {
    const items = buildContextMenuItems(payload);
    setCtxMenu({ x: payload.x, y: payload.y, items });
  };

  // Filter the visible top-level items by name (case-insensitive)
  const filteredItems = filter
    ? rootItems.filter((it) => it.name.toLowerCase().includes(filter.toLowerCase()))
    : rootItems;

  const homeDir = window.electronAPI?.homeDir || '';
  const displayCwd = cwd?.startsWith(homeDir) ? cwd.replace(homeDir, '~') : cwd;

  return (
    <div style={{
      ...styles.panel,
      transform: open ? 'translateX(0)' : 'translateX(100%)',
      pointerEvents: open ? 'auto' : 'none',
    }}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerTitle}>文件浏览器</span>
        </div>
        <div style={styles.headerActions}>
          <button
            style={styles.iconBtn}
            onClick={async () => {
              const name = await showPrompt({ title: '新建文件', defaultValue: 'untitled.txt' });
              if (!name) return;
              const r = await window.electronAPI.newFile(cwd, name);
              if (r?.error) alert(r.error); else refresh();
            }}
            title="新建文件"
          >＋</button>
          <button
            style={styles.iconBtn}
            onClick={async () => {
              const name = await showPrompt({ title: '新建文件夹', defaultValue: 'new-folder' });
              if (!name) return;
              const r = await window.electronAPI.newFolder(cwd, name);
              if (r?.error) alert(r.error); else refresh();
            }}
            title="新建文件夹"
          >◰</button>
          <button style={styles.iconBtn} onClick={refresh} title="刷新">↻</button>
          <button style={styles.iconBtn} onClick={onClose} title="关闭">×</button>
        </div>
      </div>

      {/* Path bar */}
      <div style={styles.pathBar} title={cwd}>
        <span style={styles.pathIcon}>▸</span>
        <span style={styles.pathText}>{displayCwd || '~'}</span>
      </div>

      {/* Filter input */}
      <div style={styles.filterBar}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="过滤..."
          style={styles.filterInput}
        />
        {filter && (
          <button onClick={() => setFilter('')} style={styles.clearBtn}>×</button>
        )}
      </div>

      {/* Tree */}
      <div style={styles.tree}>
        {loading && <div style={styles.placeholder}>加载中...</div>}
        {!loading && filteredItems.length === 0 && (
          <div style={styles.placeholder}>{filter ? '无匹配' : '(空目录)'}</div>
        )}
        {!loading && filteredItems.map((item) => (
          <TreeNode
            key={item.path}
            item={item}
            depth={0}
            onFileSelect={setSelectedFile}
            gitStatusMap={gitStatusMap}
            rootPath={cwd}
            onContextMenu={onContextMenu}
            refreshParent={refresh}
          />
        ))}
      </div>

      {/* File preview */}
      {selectedFile && (
        <FilePreview file={selectedFile} onClose={() => setSelectedFile(null)} />
      )}

      {/* Context menu overlay */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

const styles = {
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 300,
    background: '#0b0b0b',
    borderLeft: '1px solid #1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
    zIndex: 50,
    boxShadow: '-8px 0 20px rgba(0, 0, 0, 0.4)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderBottom: '1px solid #161616',
    background: '#0d0d0d',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 13,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#d0d0d0',
    fontFamily: 'var(--font-ui)',
    letterSpacing: '-0.005em',
  },
  headerActions: {
    display: 'flex',
    gap: 4,
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#555',
    fontSize: 14,
    cursor: 'pointer',
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    padding: 0,
    lineHeight: 1,
  },
  pathBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 14px',
    background: '#080808',
    borderBottom: '1px solid #141414',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: '#4a4a4a',
    flexShrink: 0,
  },
  pathIcon: { color: '#2a2a2a' },
  pathText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 12px',
    background: '#0a0a0a',
    borderBottom: '1px solid #141414',
    flexShrink: 0,
  },
  filterInput: {
    flex: 1,
    background: '#111',
    border: '1px solid #1e1e1e',
    borderRadius: 4,
    color: '#d0d0d0',
    fontSize: 11,
    padding: '4px 8px',
    outline: 'none',
    fontFamily: 'var(--font-ui)',
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: '#555',
    fontSize: 14,
    cursor: 'pointer',
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
  },
  tree: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '6px 0',
  },
  placeholder: {
    fontSize: 11,
    color: '#3a3a3a',
    padding: '20px 14px',
    fontFamily: 'var(--font-mono)',
    textAlign: 'center',
  },
};

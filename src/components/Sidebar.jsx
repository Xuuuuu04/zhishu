import React, { useState, useRef, useEffect } from 'react';
import { useSessionStore, PROJECT_TEMPLATES } from '../store/sessions';
import { AppLogo, PencilIcon } from './ToolIcons';

// ─── Icons (inline SVG — crisp at any scale, no external fonts) ───────────────

const IconFolder = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconTerminal = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

const IconPlus = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconTrash = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

const IconEdit = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const IconChevron = ({ collapsed, size = 9 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.18s' }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// ─── Inline editable label (double-click to edit) ────────────────────────────

function EditableLabel({ value, onCommit, style }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft !== value) onCommit(draft.trim());
    else setDraft(value);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setEditing(false); setDraft(value); }
        }}
        style={styles.inlineInput}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span style={style} onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
      {value}
    </span>
  );
}

// Tool brand colors — MUST stay in sync with TerminalView.TOOL_INFO_BY_ID
const TOOL_COLORS = {
  claude: '#d97706',
  codex: '#16a34a',
  gemini: '#3b82f6',
  qwen: '#06b6d4',
  opencode: '#f97316',
  glm: '#a855f7',
  minimax: '#ec4899',
};

// Semantic phase colors
const COLOR_STANDBY = '#64748b';   // 未指令：灰蓝色，等待你发指令
const COLOR_REVIEW  = '#22c55e';   // 待审查：绿色，响应完成等你看

// Tool display labels (used in the session sub-line)
const TOOL_LABELS = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  qwen: 'Qwen',
  opencode: 'OpenCode',
  glm: 'GLM',
  minimax: 'MiniMax',
};

// Format milliseconds → compact "1h 23m" / "5m 12s" / "45s"
function fmtDuration(ms) {
  if (!ms || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

/**
 * Four-state phase → visual indicator.
 *
 * not_started         → no indicator (offline)
 * idle_no_instruction → slate/grey, slow breathing (standby, waiting for user)
 * running             → brand-color, fast pulse (AI generating)
 * awaiting_review     → green, slow breathing (response done, review needed)
 */
function getPhaseIndicator(status) {
  if (!status?.tool || status.phase === 'not_started') return null;

  if (status.phase === 'running') {
    return {
      color: TOOL_COLORS[status.tool] || '#888',
      animation: 'pulse 1.2s ease-in-out infinite',
      title: `${status.label || status.tool} 运行中`,
    };
  }
  if (status.phase === 'awaiting_review') {
    return {
      color: COLOR_REVIEW,
      animation: 'breathe 2.5s ease-in-out infinite',
      title: `${status.label || status.tool} 运行后待审查`,
    };
  }
  if (status.phase === 'idle_no_instruction') {
    return {
      color: COLOR_STANDBY,
      animation: 'breathe 3s ease-in-out infinite',
      title: `${status.label || status.tool} 未指令`,
    };
  }
  return null;
}

// ─── Session row ──────────────────────────────────────────────────────────────

function SessionRow({ session, projectId, isActive, onSelect, onRename, onRemove, status }) {
  const [hovered, setHovered] = useState(false);
  // Tick every second so the live duration ("Claude · 02:15") updates
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!status?.tool) return;  // No need to tick when nothing is running
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status?.tool]);

  // ── Inline rename state (lifted out of EditableLabel for direct control) ──
  // Multiple triggers can flip into edit mode: double-click, pencil button,
  // or future shortcuts. The shared state lives here so they all coexist cleanly.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.name);
  const inputRef = useRef(null);

  // Keep draft in sync with the source of truth
  useEffect(() => { setDraft(session.name); }, [session.name]);

  // Auto-focus + select-all when editing starts
  useEffect(() => {
    if (editing) {
      // Defer to next tick so the input has actually mounted
      setTimeout(() => inputRef.current?.select(), 30);
    }
  }, [editing]);

  const startEdit = (e) => {
    e?.stopPropagation();
    setEditing(true);
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== session.name) onRename(trimmed);
    else setDraft(session.name);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(session.name);
  };

  const indicator = getPhaseIndicator(status);

  // Build the sub-line content (running tool + elapsed time, OR last-ran summary)
  let subLine = null;
  if (status?.tool) {
    const toolLabel = TOOL_LABELS[status.tool] || status.tool;
    const elapsed = status.startedAt ? fmtDuration(now - status.startedAt) : '';
    const phaseTag = status.phase === 'awaiting_review' ? '待审' :
                     status.phase === 'running' ? '运行中' :
                     status.phase === 'idle_no_instruction' ? '未指令' : '';
    subLine = (
      <div style={styles.sessionSubLine}>
        <span style={{ color: TOOL_COLORS[status.tool] || '#888' }}>{toolLabel}</span>
        {phaseTag && <span style={styles.subLineDim}>· {phaseTag}</span>}
        {elapsed && <span style={styles.subLineDim}>· {elapsed}</span>}
      </div>
    );
  } else if (status?.lastRanTool) {
    // No active tool but we know what ran last — show as muted history
    const label = TOOL_LABELS[status.lastRanTool] || status.lastRanTool;
    const dur = status.lastDuration ? fmtDuration(status.lastDuration) : '';
    subLine = (
      <div style={styles.sessionSubLine}>
        <span style={styles.subLineMuted}>上次 · {label}{dur && ` · ${dur}`}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        ...styles.sessionRow,
        ...(isActive ? styles.sessionRowActive : hovered ? styles.sessionRowHover : {}),
        flexDirection: 'column',
        alignItems: 'stretch',
      }}
      onClick={() => { if (!editing) onSelect(); }}
      onDoubleClick={(e) => { e.stopPropagation(); startEdit(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.sessionMainRow}>
        {/* Active indicator bar */}
        <span style={{ ...styles.activeBar, opacity: isActive ? 1 : 0 }} />

        <span style={{
          ...styles.sessionIcon,
          color: isActive ? '#f59e0b' : '#3a3a3a',
        }}>
          <IconTerminal />
        </span>

        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
              if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
            }}
            onClick={(e) => e.stopPropagation()}
            style={styles.renameInput}
            autoFocus
          />
        ) : (
          <span
            style={{
              ...styles.sessionName,
              color: isActive ? '#e2e8f0' : '#888',
              fontWeight: isActive ? 500 : 400,
            }}
            title="双击重命名"
          >
            {session.name}
          </span>
        )}

        {/* Phase indicator — only when NOT hovered, so hover swaps it for actions */}
        {indicator && !editing && !hovered && (
          <span
            title={indicator.title}
            style={{
              ...styles.runningPulse,
              background: indicator.color,
              boxShadow: `0 0 6px ${indicator.color}, 0 0 2px ${indicator.color}`,
              animation: indicator.animation,
            }}
          />
        )}

        {/* Hover actions: rename + delete — ALWAYS visible on hover, even
            when an AI tool is currently running (indicator hidden above) */}
        {hovered && !editing && (
          <div style={styles.sessionActions}>
            <button
              className="sidebar-action-btn"
              style={{ ...styles.iconBtn, color: '#aaa' }}
              onClick={startEdit}
              title="重命名"
            >
              <PencilIcon />
            </button>
            <button
              className="sidebar-action-btn"
              style={{ ...styles.iconBtn, color: '#aaa' }}
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              title="删除会话"
            >
              <IconTrash />
            </button>
          </div>
        )}
      </div>

      {subLine}
    </div>
  );
}

// ─── Project section ──────────────────────────────────────────────────────────

function ProjectSection({ project, activeSessionId, sessionStatus }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const {
    addSession, removeSession, renameSession, removeProject, renameProject,
    setActiveSession, updateProjectPath,
  } = useSessionStore();

  const handlePickDir = async (e) => {
    e.stopPropagation();
    const dir = await window.electronAPI.selectDir();
    if (dir) updateProjectPath(project.id, dir);
  };

  const handleAddSession = (e) => {
    e.stopPropagation();
    addSession(project.id);
  };

  const handleRemoveProject = (e) => {
    e.stopPropagation();
    if (window.confirm(`删除项目 "${project.name}" 及其所有会话？`)) {
      removeProject(project.id);
    }
  };

  const homeDir = window.electronAPI?.homeDir || '';
  const displayPath = project.path?.startsWith(homeDir)
    ? project.path.replace(homeDir, '~')
    : project.path;

  return (
    <div style={styles.projectSection}>
      {/* Project header */}
      <div
        style={{
          ...styles.projectHeader,
          background: hovered ? '#141414' : 'transparent',
        }}
        onClick={() => setCollapsed((c) => !c)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span style={styles.chevron}>
          <IconChevron collapsed={collapsed} />
        </span>
        <span style={styles.folderIcon}><IconFolder /></span>
        <EditableLabel
          value={project.name}
          onCommit={(name) => renameProject(project.id, name)}
          style={styles.projectName}
        />
        {hovered && (
          <div style={styles.projectActions} onClick={(e) => e.stopPropagation()}>
            <button
              className="sidebar-action-btn"
              style={{ ...styles.iconBtn, color: '#aaa' }}
              onClick={handlePickDir}
              title="更改目录"
            >
              <IconEdit />
            </button>
            <button
              className="sidebar-action-btn"
              style={{ ...styles.iconBtn, color: '#aaa' }}
              onClick={handleAddSession}
              title="新建会话"
            >
              <IconPlus />
            </button>
            <button
              className="sidebar-action-btn"
              style={{ ...styles.iconBtn, color: '#aaa' }}
              onClick={handleRemoveProject}
              title="删除项目"
            >
              <IconTrash />
            </button>
          </div>
        )}
      </div>

      {/* Path label */}
      {!collapsed && displayPath && (
        <div style={styles.projectPath} title={project.path}>
          {displayPath}
        </div>
      )}

      {/* Sessions */}
      {!collapsed && project.sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          projectId={project.id}
          isActive={session.id === activeSessionId}
          status={sessionStatus?.[session.id]}
          onSelect={() => setActiveSession(session.id)}
          onRename={(name) => renameSession(project.id, session.id, name)}
          onRemove={() => removeSession(project.id, session.id)}
        />
      ))}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const {
    projects, activeSessionId, sessionStatus,
    createProjectFromTemplate,
    sidebarWidth, setSidebarWidth, commitSidebarWidth,
  } = useSessionStore();

  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

  // ── Sidebar resizer drag handling ────────────────────────────────────
  // Mouse-down on the right-edge handle starts a global mousemove listener
  // that updates the width until mouseup. We persist only on release to
  // avoid spamming the disk.
  const onResizerMouseDown = (e) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      // The sidebar starts at x=0, so the new width is just the cursor X
      setSidebarWidth(ev.clientX);
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      commitSidebarWidth();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Count sessions in each interesting phase for the stats strip
  const allStatuses = Object.values(sessionStatus || {});
  const runningCount = allStatuses.filter((s) => s?.phase === 'running').length;
  const reviewCount  = allStatuses.filter((s) => s?.phase === 'awaiting_review').length;

  const handlePickTemplate = async (templateId) => {
    setTemplateMenuOpen(false);
    const dir = await window.electronAPI.selectDir();
    if (dir) {
      const name = dir.split('/').pop() || '新项目';
      await createProjectFromTemplate(templateId, dir, name);
    }
  };

  const totalSessions = projects.reduce((n, p) => n + p.sessions.length, 0);

  return (
    <aside style={{ ...styles.sidebar, width: sidebarWidth }}>
      {/* Right-edge resizer handle for drag-to-resize */}
      <div
        onMouseDown={onResizerMouseDown}
        style={styles.resizer}
        className="sidebar-resizer"
        title="拖动调整宽度"
      />
      {/* ═══ Window drag region + brand ══════════════════════════════════ */}
      <div style={styles.header} className="drag-region">
        <div style={styles.headerLogo}>
          <div style={styles.logoMark}>
            <AppLogo size={32} />
          </div>
          <div style={styles.logoTextGroup}>
            <div style={styles.logoTextRow}>
              <span style={styles.logoText}>智枢</span>
              <span style={styles.logoBadge}>AI HUB</span>
            </div>
            <span style={styles.logoSubText}>ZHISHU · 多 Agent 智能终端</span>
          </div>
        </div>
      </div>

      {/* ═══ Stats strip ═════════════════════════════════════════════════ */}
      <div style={styles.statsStrip}>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{projects.length}</span>
          <span style={styles.statLabel}>项目</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statItem}>
          <span style={styles.statValue}>{totalSessions}</span>
          <span style={styles.statLabel}>会话</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statItem}>
          <span style={{
            ...styles.statValue,
            color: runningCount > 0 ? '#f59e0b' : '#3a3a3a',
          }}>
            {runningCount}
          </span>
          <span style={styles.statLabel}>运行</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statItem}>
          <span style={{
            ...styles.statValue,
            color: reviewCount > 0 ? '#22c55e' : '#3a3a3a',
          }}>
            {reviewCount}
          </span>
          <span style={styles.statLabel}>待审</span>
        </div>
      </div>

      {/* ═══ Section header ══════════════════════════════════════════════ */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>项目 & 会话</span>
        <div style={{ position: 'relative' }}>
          <button
            style={styles.addProjectBtn}
            onClick={() => setTemplateMenuOpen((v) => !v)}
            title="新建项目"
          >
            <IconPlus size={11} />
          </button>
          {templateMenuOpen && (
            <>
              {/* Click-outside backdrop */}
              <div
                onClick={() => setTemplateMenuOpen(false)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 99,
                }}
              />
              {/* Dropdown menu */}
              <div style={styles.templateMenu}>
                <div style={styles.menuHeader}>选择模板</div>
                {PROJECT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    style={styles.templateItem}
                    onClick={() => handlePickTemplate(tpl.id)}
                    className="template-item"
                  >
                    <span style={styles.templateIcon}>{tpl.icon}</span>
                    <div style={styles.templateInfo}>
                      <div style={styles.templateName}>{tpl.name}</div>
                      <div style={styles.templateDesc}>{tpl.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ Projects list ═══════════════════════════════════════════════ */}
      <div style={styles.projectsList}>
        {projects.length === 0 ? (
          <div style={styles.emptyHint}>
            <div style={styles.emptyIcon}>◆</div>
            <p style={styles.emptyText}>暂无项目</p>
            <p style={styles.emptySubText}>点击右上角 + 添加你的第一个项目</p>
          </div>
        ) : (
          projects.map((project) => (
            <ProjectSection
              key={project.id}
              project={project}
              activeSessionId={activeSessionId}
              sessionStatus={sessionStatus}
            />
          ))
        )}
      </div>

      {/* ═══ Footer ══════════════════════════════════════════════════════ */}
      <div style={styles.footer}>
        <span style={styles.footerText}>双击名称重命名</span>
      </div>
    </aside>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  sidebar: {
    minWidth: 180,
    maxWidth: 420,
    background: '#0b0b0b',
    borderRight: '1px solid #161616',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    userSelect: 'none',
    flexShrink: 0,
    position: 'relative',
  },
  resizer: {
    position: 'absolute',
    top: 0,
    right: -3,
    bottom: 0,
    width: 6,
    cursor: 'col-resize',
    zIndex: 100,
    background: 'transparent',
    transition: 'background 0.15s',
  },

  // Header with macOS traffic-light space
  // Drag region is set via `.drag-region` className (see global CSS in index.js)
  header: {
    padding: '14px 16px 14px',
    paddingTop: 42,
    borderBottom: '1px solid #141414',
  },
  headerLogo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  logoMark: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    filter: 'drop-shadow(0 2px 8px rgba(245, 158, 11, 0.25))',
  },
  logoTextGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    minWidth: 0,
  },
  logoTextRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  logoText: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fafafa',
    fontFamily: '"PingFang SC", "Inter", "SF Pro Display", system-ui',
    letterSpacing: '0.04em',
    lineHeight: 1,
    background: 'linear-gradient(135deg, #fde68a 0%, #fbbf24 50%, #f59e0b 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  logoBadge: {
    fontSize: 8,
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
    color: '#f59e0b',
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.28)',
    borderRadius: 3,
    padding: '2px 5px',
    letterSpacing: '0.1em',
    lineHeight: 1,
  },
  logoSubText: {
    fontSize: 9,
    fontWeight: 500,
    color: '#3a3a3a',
    fontFamily: '"Inter", system-ui',
    lineHeight: 1.2,
    letterSpacing: '0.04em',
  },

  // Stats strip
  statsStrip: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: '10px 12px',
    background: '#0a0a0a',
    borderBottom: '1px solid #141414',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 13,
    fontWeight: 600,
    color: '#d1d5db',
    fontFamily: '"JetBrains Mono", monospace',
    lineHeight: 1.2,
  },
  statLabel: {
    fontSize: 9,
    color: '#3a3a3a',
    fontFamily: 'system-ui',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    height: 20,
    background: '#161616',
  },

  // Section header
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px 8px',
  },
  sectionLabel: {
    fontSize: 10,
    color: '#333',
    fontFamily: 'system-ui',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  addProjectBtn: {
    background: '#151515',
    border: '1px solid #232323',
    borderRadius: 4,
    color: '#888',
    cursor: 'pointer',
    padding: '3px 5px',
    display: 'flex',
    alignItems: 'center',
    outline: 'none',
    transition: 'all 0.15s',
  },
  templateMenu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    width: 260,
    background: '#0d0d0d',
    border: '1px solid #1e1e1e',
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.4)',
    padding: 6,
    zIndex: 100,
    animation: 'toast-in 0.18s ease',
  },
  menuHeader: {
    fontSize: 9,
    color: '#3a3a3a',
    padding: '6px 10px 4px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  templateItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderRadius: 5,
    padding: '8px 10px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.1s',
  },
  templateIcon: {
    fontSize: 14,
    color: '#f59e0b',
    marginTop: 1,
    flexShrink: 0,
  },
  templateInfo: { flex: 1, minWidth: 0 },
  templateName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#d0d0d0',
    fontFamily: 'var(--font-ui)',
    marginBottom: 2,
  },
  templateDesc: {
    fontSize: 10,
    color: '#555',
    fontFamily: 'var(--font-ui)',
    lineHeight: 1.4,
  },

  // Projects list
  projectsList: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '0 0 8px',
  },
  projectSection: {
    marginBottom: 3,
  },
  projectHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px 6px 10px',
    cursor: 'pointer',
    borderRadius: 5,
    margin: '0 6px',
    transition: 'background 0.1s',
  },
  chevron: {
    color: '#383838',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    width: 9,
  },
  folderIcon: {
    color: '#f59e0b',
    flexShrink: 0,
    display: 'flex',
  },
  projectName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#c8ccd1',
    fontFamily: 'system-ui',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    letterSpacing: '-0.005em',
  },
  projectPath: {
    fontSize: 10,
    color: '#2a2a2a',
    fontFamily: '"JetBrains Mono", monospace',
    padding: '0 10px 4px 32px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  projectActions: {
    display: 'flex',
    gap: 1,
    alignItems: 'center',
  },

  // Session rows
  sessionRow: {
    position: 'relative',
    display: 'flex',
    cursor: 'pointer',
    borderRadius: 4,
    margin: '1px 6px',
    transition: 'background 0.1s',
    padding: '5px 10px 5px 30px',
  },
  sessionMainRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    width: '100%',
  },
  sessionActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    flexShrink: 0,
  },
  renameInput: {
    flex: 1,
    background: '#1a1a1a',
    border: '1px solid #f59e0b',
    borderRadius: 3,
    color: '#e2e8f0',
    fontSize: 12,
    fontFamily: 'var(--font-ui)',
    padding: '2px 6px',
    outline: 'none',
    minWidth: 0,
  },
  sessionSubLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    fontVariantNumeric: 'tabular-nums',
    paddingLeft: 18,
    paddingTop: 2,
    paddingBottom: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subLineDim: {
    color: '#444',
    fontWeight: 500,
  },
  subLineMuted: {
    color: '#3a3a3a',
    fontWeight: 500,
  },
  sessionRowHover: {
    background: '#131313',
  },
  sessionRowActive: {
    background: 'linear-gradient(to right, rgba(245, 158, 11, 0.08), transparent)',
  },
  activeBar: {
    position: 'absolute',
    left: 6,
    top: 6,
    bottom: 6,
    width: 2,
    borderRadius: 2,
    background: '#f59e0b',
    transition: 'opacity 0.15s',
  },
  sessionIcon: {
    display: 'flex',
    flexShrink: 0,
    transition: 'color 0.15s',
  },
  sessionName: {
    fontSize: 12,
    fontFamily: 'system-ui',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '3px 4px',
    display: 'flex',
    alignItems: 'center',
    borderRadius: 3,
    outline: 'none',
    transition: 'color 0.15s',
  },

  // Running-status pulsing dot shown on the right side of a session row
  // when an AI tool is active in that session.
  runningPulse: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    animation: 'pulse 1.8s ease-in-out infinite',
    flexShrink: 0,
    marginRight: 2,
  },

  // Inline edit input
  inlineInput: {
    background: '#1a1a1a',
    border: '1px solid #3a3a3a',
    borderRadius: 3,
    color: '#e2e8f0',
    fontSize: 12,
    fontFamily: 'system-ui',
    padding: '2px 5px',
    outline: 'none',
    flex: 1,
    minWidth: 0,
  },

  // Empty state
  emptyHint: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 16px',
    gap: 8,
  },
  emptyIcon: {
    fontSize: 28,
    color: '#1e1e1e',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 11,
    color: '#444',
    fontFamily: 'system-ui',
  },
  emptySubText: {
    fontSize: 10,
    color: '#2a2a2a',
    fontFamily: 'system-ui',
    textAlign: 'center',
    lineHeight: 1.5,
  },

  // Footer
  footer: {
    padding: '8px 14px 12px',
    borderTop: '1px solid #121212',
  },
  footerText: {
    fontSize: 9,
    color: '#262626',
    fontFamily: 'system-ui',
    letterSpacing: '0.02em',
  },
};

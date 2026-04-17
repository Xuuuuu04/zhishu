import React, { useState, useRef, useCallback } from 'react';
import { useSessionStore } from '../../store/sessions';
import { IconFolder, IconChevron, IconEdit, IconPlus, IconTrash, IconGrip } from './icons';
import EditableLabel from './EditableLabel';
import SessionRow from './SessionRow';
import styles from './styles';

// ─── Project section ──────────────────────────────────────────────────────────

function ProjectSection({ project, index, activeSessionId, sessionStatus, onContextMenu, onReorderProject, totalProjects }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [projectDropTarget, setProjectDropTarget] = useState(null); // 'top' | 'bottom' | null
  const sectionRef = useRef(null);
  const {
    addSession, removeSession, renameSession, removeProject, renameProject,
    updateProjectPath, reorderSessions,
    setActiveSession,
    now, todos, setTodoFocusProject,
    customProviders,
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

  // ── Project-level drag for reorder ───────────────────────────────
  const handleProjectDragStart = useCallback((e) => {
    e.dataTransfer.setData('application/x-prism-project', project.id);
    e.dataTransfer.setData('application/x-prism-project-index', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  }, [project.id, index]);

  const handleProjectDragEnd = useCallback(() => {
    setDragging(false);
    setProjectDropTarget(null);
  }, []);

  const handleProjectDragOver = useCallback((e) => {
    if (!e.dataTransfer.types.includes('application/x-prism-project')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.stopPropagation();
    if (!sectionRef.current) return;
    const rect = sectionRef.current.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setProjectDropTarget(e.clientY < midY ? 'top' : 'bottom');
  }, []);

  const handleProjectDragLeave = useCallback((e) => {
    // Only clear if actually leaving the section
    if (sectionRef.current && !sectionRef.current.contains(e.relatedTarget)) {
      setProjectDropTarget(null);
    }
  }, []);

  const handleProjectDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setProjectDropTarget(null);

    const srcIndexStr = e.dataTransfer.getData('application/x-prism-project-index');
    if (!srcIndexStr) return;
    const fromIndex = parseInt(srcIndexStr, 10);

    let toIndex = projectDropTarget === 'top' ? index : index + 1;
    if (fromIndex < toIndex) toIndex -= 1;
    if (fromIndex === toIndex) return;

    onReorderProject?.(fromIndex, toIndex);
  }, [index, projectDropTarget, onReorderProject]);

  const handleSessionReorder = useCallback((fromIndex, toIndex) => {
    reorderSessions(project.id, fromIndex, toIndex);
  }, [project.id, reorderSessions]);

  const homeDir = window.electronAPI?.homeDir || '';
  const displayPath = project.path?.startsWith(homeDir)
    ? project.path.replace(homeDir, '~')
    : project.path;

  return (
    <div
      ref={sectionRef}
      style={{
        ...styles.projectSection,
        ...(dragging ? { opacity: 0.4 } : {}),
        position: 'relative',
      }}
      onDragOver={handleProjectDragOver}
      onDragLeave={handleProjectDragLeave}
      onDrop={handleProjectDrop}
    >
      {/* Project reorder drop indicator */}
      {projectDropTarget === 'top' && (
        <div style={{
          position: 'absolute', top: -1, left: 4, right: 4, height: 2,
          background: '#f59e0b', borderRadius: 1, zIndex: 20,
          boxShadow: '0 0 6px rgba(245,158,11,0.5)',
        }} />
      )}

      {/* Project header */}
      <div
        draggable
        onDragStart={handleProjectDragStart}
        onDragEnd={handleProjectDragEnd}
        style={{
          ...styles.projectHeader,
          background: hovered ? 'var(--bg-header-hover, #1e1e22)' : 'transparent',
        }}
        onClick={() => {
          setCollapsed((c) => !c);
          setTodoFocusProject(project.id);
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={(e) => onContextMenu?.(e, project)}
      >
        <span style={styles.chevron}>
          <IconChevron collapsed={collapsed} />
        </span>

        {/* Grip handle on hover */}
        {hovered && (
          <span style={{ ...styles.gripHandle, color: 'var(--text-dim, #52525b)' }} className="sidebar-grip">
            <IconGrip />
          </span>
        )}

        <span style={styles.folderIcon}><IconFolder /></span>
        <EditableLabel
          value={project.name}
          onCommit={(name) => renameProject(project.id, name)}
          style={styles.projectName}
        />
        {/* TODO badge */}
        {(() => {
          const count = todos.filter(t => t.projectId === project.id && t.status !== 'done').length;
          if (count === 0) return null;
          const today = new Date().toISOString().slice(0, 10);
          const hasOverdue = todos.some(t =>
            t.projectId === project.id && t.status !== 'done' && t.dueDate &&
            t.dueDate < today
          );
          return (
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: 10,
              background: hasOverdue ? '#3a1a1a' : '#1a2a3a',
              color: hasOverdue ? '#ef4444' : '#60a5fa',
              border: `1px solid ${hasOverdue ? '#5a2828' : '#2a4a6a'}`,
              flexShrink: 0,
              fontFamily: 'system-ui, -apple-system',
            }}>
              {count}
            </span>
          );
        })()}
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
      {!collapsed && project.sessions.map((session, si) => (
        <SessionRow
          key={session.id}
          session={session}
          projectId={project.id}
          index={si}
          totalSessions={project.sessions.length}
          isActive={session.id === activeSessionId}
          status={sessionStatus?.[session.id]}
          onSelect={() => setActiveSession(session.id)}
          onRename={(name) => renameSession(project.id, session.id, name)}
          onRemove={() => removeSession(project.id, session.id)}
          onReorder={handleSessionReorder}
          now={now}
          customProviders={customProviders}
        />
      ))}

      {/* Bottom drop indicator */}
      {projectDropTarget === 'bottom' && (
        <div style={{
          position: 'absolute', bottom: -1, left: 4, right: 4, height: 2,
          background: '#f59e0b', borderRadius: 1, zIndex: 20,
          boxShadow: '0 0 6px rgba(245,158,11,0.5)',
        }} />
      )}
    </div>
  );
}

export default React.memo(ProjectSection);

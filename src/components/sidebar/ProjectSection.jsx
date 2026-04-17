import React, { useState } from 'react';
import { useSessionStore } from '../../store/sessions';
import { IconFolder, IconChevron, IconEdit, IconPlus, IconTrash } from './icons';
import EditableLabel from './EditableLabel';
import SessionRow from './SessionRow';
import styles from './styles';

// ─── Project section ──────────────────────────────────────────────────────────

function ProjectSection({ project, activeSessionId, sessionStatus, onContextMenu }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const {
    addSession, removeSession, renameSession, removeProject, renameProject,
    setActiveSession, updateProjectPath,
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
          now={now}
          customProviders={customProviders}
        />
      ))}
    </div>
  );
}

export default React.memo(ProjectSection);

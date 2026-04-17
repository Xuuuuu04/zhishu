import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useSessionStore } from '../store/sessions';
import { AppLogo } from './ToolIcons';
import ContextMenu from './ContextMenu';
import { getGroupOrder } from '../store/sessionState';
import { isExternalDrop } from '../utils/drag';

// Sub-components (extracted to ./sidebar/)
import ProjectSection from './sidebar/ProjectSection';
import {
  IconFolder,
  IconFolderOpen,
  IconChevron,
  IconPlus,
  IconEdit,
  IconTrash,
  IconMoveToFolder,
} from './sidebar/icons';
import styles from './sidebar/styles';

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const {
    projects, activeSessionId, sessionStatus,
    sidebarWidth, setSidebarWidth, commitSidebarWidth,
    groups, createGroup, removeGroup, renameGroup,
    moveProjectToGroup, toggleGroupCollapsed,
    addProject, addToast, reorderProjects,
  } = useSessionStore();
  const [contextMenu, setContextMenu] = useState(null);
  const [groupRenameDraft, setGroupRenameDraft] = useState(null);
  const [isSidebarDragOver, setIsSidebarDragOver] = useState(false);
  const sidebarDragCounterRef = useRef(0);

  // Build ordered group list with ungrouped always last
  const orderedGroups = useMemo(() => getGroupOrder(groups), [groups]);
  const hasUserGroups = groups.some((g) => !g.system);

  // ── Sidebar resizer drag handling ──────────────────────────────────
  const onResizerMouseDown = (e) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => setSidebarWidth(ev.clientX);
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

  // Stats
  const allStatuses = Object.values(sessionStatus || {});
  const runningCount = allStatuses.filter((s) => s?.phase === 'running').length;
  const reviewCount  = allStatuses.filter((s) => s?.phase === 'awaiting_review').length;
  const idleCount    = allStatuses.filter((s) => s?.phase === 'idle_no_instruction').length;
  const totalSessions = projects.reduce((n, p) => n + p.sessions.length, 0);

  const handleAddProject = async () => {
    const dir = await window.electronAPI.selectDir();
    if (dir) {
      const name = dir.split('/').pop() || '新项目';
      addProject(name, dir);
    }
  };

  // ── Context menu helpers ──────────────────────────────────────────
  const showContextMenu = useCallback((e, items) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Right-click on a group header
  const handleGroupContextMenu = useCallback((e, group) => {
    const items = [];
    if (!group.system) {
      items.push({
        label: '重命名分组',
        icon: <IconEdit />,
        onClick: () => setGroupRenameDraft({ groupId: group.id, value: group.name }),
      });
      items.push({
        label: '删除分组',
        icon: <IconTrash />,
        danger: true,
        onClick: () => removeGroup(group.id),
      });
    }
    if (items.length > 0) showContextMenu(e, items);
  }, [showContextMenu, removeGroup]);

  // Right-click on a project header
  const handleProjectContextMenu = useCallback((e, project) => {
    const userGroups = groups.filter((g) => !g.system);
    const items = [];

    if (userGroups.length > 0) {
      items.push({ label: '移动到分组', icon: <IconMoveToFolder />, separator: false, onClick: () => {} });
      userGroups.forEach((g) => {
        items.push({
          label: `  ${g.name}`,
          onClick: () => moveProjectToGroup(project.id, g.id),
        });
      });
      if (project.groupId) {
        items.push({ label: '  未分组', onClick: () => moveProjectToGroup(project.id, null) });
      }
      items.push({ separator: true });
    }

    items.push({
      label: '新建分组并移入',
      icon: <IconPlus />,
      onClick: async () => {
        const name = await useSessionStore.getState().showPrompt({
          title: '新建分组',
          placeholder: '输入分组名称',
          confirmLabel: '创建',
        });
        if (name) {
          const newGroupId = createGroup(name);
          moveProjectToGroup(project.id, newGroupId);
        }
      },
    });

    showContextMenu(e, items);
  }, [showContextMenu, groups, moveProjectToGroup, createGroup]);

  // ── External drag-drop: Finder folder -> add as new project ────────
  const handleSidebarDragEnter = useCallback((e) => {
    if (!isExternalDrop(e)) return;
    sidebarDragCounterRef.current += 1;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsSidebarDragOver(true);
  }, []);

  const handleSidebarDragOver = useCallback((e) => {
    if (!isExternalDrop(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleSidebarDragLeave = useCallback(() => {
    sidebarDragCounterRef.current -= 1;
    if (sidebarDragCounterRef.current <= 0) {
      sidebarDragCounterRef.current = 0;
      setIsSidebarDragOver(false);
    }
  }, []);

  const handleSidebarDrop = useCallback((e) => {
    e._handled = true;
    e.preventDefault();
    e.stopPropagation();

    setIsSidebarDragOver(false);
    sidebarDragCounterRef.current = 0;

    if (!isExternalDrop(e)) return;

    let addedAny = false;
    for (const item of Array.from(e.dataTransfer.items)) {
      const entry = item.webkitGetAsEntry?.();
      const file = item.getAsFile?.();
      if (!file?.path) continue;
      if (entry?.isDirectory) {
        const name = file.path.split('/').filter(Boolean).pop() || file.path;
        addProject(name, file.path);
        addToast({ message: `已添加项目: ${name}`, type: 'success' });
        addedAny = true;
      }
    }
    if (!addedAny) {
      addToast({ message: '请拖入文件夹以添加新项目', type: 'info' });
    }
  }, [addProject, addToast]);

  // Commit group rename
  const commitGroupRename = useCallback(() => {
    if (groupRenameDraft) {
      const trimmed = groupRenameDraft.value.trim();
      if (trimmed) renameGroup(groupRenameDraft.groupId, trimmed);
      setGroupRenameDraft(null);
    }
  }, [groupRenameDraft, renameGroup]);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <aside style={{ ...styles.sidebar, width: sidebarWidth }}>
      {/* Right-edge resizer handle */}
      <div
        onMouseDown={onResizerMouseDown}
        style={styles.resizer}
        className="sidebar-resizer"
        title="拖动调整宽度"
      />

      {/* Window drag region + brand */}
      <div style={styles.header} className="drag-region">
        <div style={styles.headerLogo}>
          <div style={styles.logoMark}>
            <AppLogo size={32} />
          </div>
          <div style={styles.logoTextGroup}>
            <div style={styles.logoTextRow}>
              <span style={styles.logoText}>智枢</span>
              <span style={styles.logoBadge}>ZhiShu</span>
            </div>
            <span style={styles.logoSubText}>Multi-Agent AI Terminal</span>
          </div>
        </div>
      </div>

      {/* Stats strip */}
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
          <span style={{ ...styles.statValue, color: runningCount > 0 ? '#f59e0b' : 'var(--text-faint, #3f3f46)' }}>
            {runningCount}
          </span>
          <span style={styles.statLabel}>运行</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statItem}>
          <span style={{ ...styles.statValue, color: reviewCount > 0 ? '#22c55e' : 'var(--text-faint, #3f3f46)' }}>
            {reviewCount}
          </span>
          <span style={styles.statLabel}>待审</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statItem}>
          <span style={{ ...styles.statValue, color: idleCount > 0 ? '#3b82f6' : 'var(--text-faint, #3f3f46)' }}>
            {idleCount}
          </span>
          <span style={styles.statLabel}>待命</span>
        </div>
      </div>

      {/* Section header */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>项目 & 会话</span>
        <button style={styles.addProjectBtn} onClick={handleAddProject} title="新建项目（选择目录）">
          <IconPlus size={11} />
        </button>
      </div>

      {/* Projects list (also serves as folder drop zone) */}
      <div
        style={{ ...styles.projectsList, ...(isSidebarDragOver ? styles.projectsListDragOver : {}) }}
        onDragEnter={handleSidebarDragEnter}
        onDragOver={handleSidebarDragOver}
        onDragLeave={handleSidebarDragLeave}
        onDrop={handleSidebarDrop}
      >
        {projects.length === 0 ? (
          <div style={styles.emptyHint}>
            <div style={styles.emptyIcon}>&#9670;</div>
            <p style={styles.emptyText}>暂无项目</p>
            <p style={styles.emptySubText}>点击右上角 + 添加你的第一个项目</p>
          </div>
        ) : hasUserGroups ? (
          orderedGroups.map((group) => {
            const groupProjects = group.id === 'ungrouped'
              ? projects.filter((p) => !p.groupId)
              : projects.filter((p) => p.groupId === group.id);
            if (group.id === 'ungrouped' && groupProjects.length === 0) return null;
            const collapsed = group.collapsed || false;
            return (
              <div key={group.id} style={styles.groupSection}>
                <div
                  style={styles.groupHeader}
                  onClick={() => toggleGroupCollapsed(group.id)}
                  onContextMenu={(e) => handleGroupContextMenu(e, group)}
                >
                  <span style={styles.chevron}>
                    <IconChevron collapsed={collapsed} />
                  </span>
                  <span style={{ ...styles.folderIcon, color: group.color || '#666' }}>
                    {group.system ? <IconFolderOpen /> : <IconFolder />}
                  </span>
                  {groupRenameDraft && groupRenameDraft.groupId === group.id ? (
                    <input
                      value={groupRenameDraft.value}
                      onChange={(e) => setGroupRenameDraft({ ...groupRenameDraft, value: e.target.value })}
                      onBlur={commitGroupRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitGroupRename();
                        if (e.key === 'Escape') setGroupRenameDraft(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={styles.groupRenameInput}
                      autoFocus
                    />
                  ) : (
                    <span style={styles.groupName}>{group.name}</span>
                  )}
                  <span style={styles.groupCount}>{groupProjects.length}</span>
                </div>
                {!collapsed && groupProjects.map((project) => (
                  <ProjectSection
                    key={project.id}
                    project={project}
                    index={projects.indexOf(project)}
                    totalProjects={projects.length}
                    activeSessionId={activeSessionId}
                    sessionStatus={sessionStatus}
                    onContextMenu={handleProjectContextMenu}
                    onReorderProject={reorderProjects}
                  />
                ))}
              </div>
            );
          })
        ) : (
          projects.map((project, pi) => (
            <ProjectSection
              key={project.id}
              project={project}
              index={pi}
              totalProjects={projects.length}
              activeSessionId={activeSessionId}
              sessionStatus={sessionStatus}
              onContextMenu={handleProjectContextMenu}
              onReorderProject={reorderProjects}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span style={styles.footerText}>双击名称重命名 | 右键分组</span>
      </div>

      {/* Context menu portal */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
        />
      )}
    </aside>
  );
}

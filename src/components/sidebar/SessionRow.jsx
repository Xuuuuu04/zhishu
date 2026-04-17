import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PencilIcon } from '../ToolIcons';
import { IconTerminal, IconTrash, IconGrip } from './icons';
import { getPhaseIndicator, fmtDuration } from './helpers';
import { getVisualForTool } from '../../constants/toolVisuals';
import styles from './styles';

// ─── Session row ──────────────────────────────────────────────────────────────

const SessionRow = React.memo(function SessionRow({
  session, projectId, index, totalSessions,
  isActive, onSelect, onRename, onRemove,
  onReorder, status, now, customProviders,
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState(null); // 'top' | 'bottom' | null
  const rowRef = useRef(null);

  // ── Drag support: reorder within project + split-pane drag ────────
  const handleDragStart = useCallback((e) => {
    e.dataTransfer.setData('application/x-prism-session', session.id);
    e.dataTransfer.setData('application/x-prism-session-project', projectId);
    e.dataTransfer.setData('application/x-prism-session-index', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  }, [session.id, projectId, index]);

  const handleDragEnd = useCallback(() => {
    setDragging(false);
    setDropTarget(null);
  }, []);

  // ── Drop target for reorder ───────────────────────────────────────
  const handleDragOver = useCallback((e) => {
    // Only accept session drags from the same project
    if (!e.dataTransfer.types.includes('application/x-prism-session')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.stopPropagation();

    if (!rowRef.current) return;
    const rect = rowRef.current.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropTarget(e.clientY < midY ? 'top' : 'bottom');
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    const srcProjectId = e.dataTransfer.getData('application/x-prism-session-project');
    const srcIndexStr = e.dataTransfer.getData('application/x-prism-session-index');
    if (!srcIndexStr) return;
    const fromIndex = parseInt(srcIndexStr, 10);

    // Only reorder within same project
    if (srcProjectId !== projectId) return;

    let toIndex = dropTarget === 'top' ? index : index + 1;
    if (fromIndex < toIndex) toIndex -= 1;
    if (fromIndex === toIndex) return;

    onReorder?.(fromIndex, toIndex);
  }, [projectId, index, dropTarget, onReorder]);

  // ── Inline rename ─────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.name);
  const inputRef = useRef(null);

  useEffect(() => { setDraft(session.name); }, [session.name]);
  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.select(), 30);
  }, [editing]);

  const startEdit = (e) => { e?.stopPropagation(); setEditing(true); };
  const commitEdit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== session.name) onRename(trimmed);
    else setDraft(session.name);
  };
  const cancelEdit = () => { setEditing(false); setDraft(session.name); };

  const indicator = getPhaseIndicator(status, customProviders);

  let subLine = null;
  if (status?.tool) {
    const visual = getVisualForTool(status.tool, customProviders);
    const toolLabel = visual.label;
    const elapsed = status.startedAt ? fmtDuration(now - status.startedAt) : '';
    const phaseTag = status.phase === 'awaiting_review' ? '待审' :
                     status.phase === 'running' ? '运行中' :
                     status.phase === 'idle_no_instruction' ? '未指令' : '';
    subLine = (
      <div style={styles.sessionSubLine}>
        <span style={{ color: visual.color }}>{toolLabel}</span>
        {phaseTag && <span style={styles.subLineDim}>{'· '}{phaseTag}</span>}
        {elapsed && <span style={styles.subLineDim}>{'· '}{elapsed}</span>}
      </div>
    );
  } else if (status?.lastRanTool) {
    const lastVisual = getVisualForTool(status.lastRanTool, customProviders);
    const label = lastVisual.label;
    const dur = status.lastDuration ? fmtDuration(status.lastDuration) : '';
    subLine = (
      <div style={styles.sessionSubLine}>
        <span style={styles.subLineMuted}>上次 · {label}{dur && ` · ${dur}`}</span>
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        ...styles.sessionRow,
        ...(isActive ? styles.sessionRowActive : hovered ? styles.sessionRowHover : {}),
        ...(dragging ? { opacity: 0.4 } : {}),
        flexDirection: 'column',
        alignItems: 'stretch',
        position: 'relative',
      }}
      onClick={() => { if (!editing) onSelect(); }}
      onDoubleClick={(e) => { e.stopPropagation(); startEdit(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Drop indicator line */}
      {dropTarget === 'top' && (
        <div style={{
          position: 'absolute', top: -1, left: 8, right: 8, height: 2,
          background: '#f59e0b', borderRadius: 1, zIndex: 10,
          boxShadow: '0 0 4px rgba(245,158,11,0.5)',
        }} />
      )}
      {dropTarget === 'bottom' && (
        <div style={{
          position: 'absolute', bottom: -1, left: 8, right: 8, height: 2,
          background: '#f59e0b', borderRadius: 1, zIndex: 10,
          boxShadow: '0 0 4px rgba(245,158,11,0.5)',
        }} />
      )}

      <div style={styles.sessionMainRow}>
        <span style={{ ...styles.activeBar, opacity: isActive ? 1 : 0 }} />

        {/* Grip handle — visible on hover */}
        {hovered && !editing && (
          <span style={{
            ...styles.gripHandle,
          }} className="sidebar-grip">
            <IconGrip />
          </span>
        )}

        <span style={{
          ...styles.sessionIcon,
          color: isActive ? '#f59e0b' : 'var(--text-tertiary, #71717a)',
          ...(hovered && !editing ? { marginLeft: 0 } : {}),
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
            {status?.phase === 'awaiting_review' && (
              <span style={{ fontSize: 10, color: '#22c55e', marginLeft: 6, fontWeight: 500 }}>待审</span>
            )}
            {status?.phase === 'running' && (
              <span style={{ fontSize: 10, color: indicator?.color || '#f59e0b', marginLeft: 6, fontWeight: 500 }}>运行中</span>
            )}
          </span>
        )}

        {indicator && !editing && (
          <span
            title={indicator.title}
            style={{
              ...styles.runningPulse,
              background: indicator.color,
              boxShadow: `0 0 10px ${indicator.color}, 0 0 3px ${indicator.color}`,
              animation: indicator.animation,
            }}
          />
        )}

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
});

export default SessionRow;

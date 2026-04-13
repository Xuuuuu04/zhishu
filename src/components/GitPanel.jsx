import React, { useState, useEffect, useCallback } from 'react';
import { useSessionStore } from '../store/sessions';

// ─── Status code → display config ────────────────────────────────────────────

const STATUS_META = {
  modified:  { letter: 'M', color: '#eab308', label: '修改' },
  added:     { letter: 'A', color: '#22c55e', label: '新增' },
  deleted:   { letter: 'D', color: '#ef4444', label: '删除' },
  renamed:   { letter: 'R', color: '#a855f7', label: '重命名' },
  conflicted:{ letter: '!', color: '#f97316', label: '冲突' },
  untracked: { letter: 'U', color: '#06b6d4', label: '未跟踪' },
  ignored:   { letter: 'I', color: '#555',    label: '忽略' },
};

function getParentDir(dirPath) {
  if (!dirPath) return dirPath;
  const normalized = dirPath.replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return normalized || '/';
  return normalized.slice(0, lastSlash);
}

// ─── GitPanel — slides in from the right side, narrower than file tree ──────

export default function GitPanel({ open, cwd, sessionId, onClose }) {
  const showPrompt = useSessionStore((s) => s.showPrompt);
  // mode: 'current' = focus on the active session's repo (single repo view)
  //       'scan'    = recursively scan cwd for ALL git repos and manage them
  const [mode, setMode] = useState('current');

  // Single-repo state
  const [status, setStatus] = useState(null);
  const [branches, setBranches] = useState([]);
  const [commits, setCommits] = useState([]);
  const [activeTab, setActiveTab] = useState('changes');
  const [loading, setLoading] = useState(false);

  // Multi-repo state
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);

  const refresh = useCallback(async () => {
    if (!cwd) return;
    setLoading(true);
    const [s, b, l] = await Promise.all([
      window.electronAPI.gitStatus(cwd),
      window.electronAPI.gitBranches(cwd),
      window.electronAPI.gitLog(cwd, 20),
    ]);
    setStatus(s);
    setBranches(b?.branches || []);
    setCommits(l?.commits || []);
    setLoading(false);
  }, [cwd]);

  const scanRepos = useCallback(async () => {
    if (!cwd) return;
    setScanning(true);
    const currentStatus = await window.electronAPI.gitStatus(cwd);
    const scanRoot = currentStatus?.isRepo ? getParentDir(cwd) : cwd;
    const result = await window.electronAPI.gitScanRepos(scanRoot);
    setScanResult(result);
    setScanning(false);
  }, [cwd]);

  useEffect(() => {
    if (!open || !cwd) return;
    if (mode === 'current') refresh();
    else scanRepos();
  }, [open, cwd, mode, refresh, scanRepos]);

  // Helper: send a git command into the active session's pty
  const runInSession = (command) => {
    if (!sessionId) {
      alert('请先选择一个会话');
      return;
    }
    window.electronAPI.gitRunInSession(sessionId, command);
    // Refresh after a short delay to let git finish
    setTimeout(() => mode === 'current' ? refresh() : scanRepos(), 1500);
  };

  // Run a command targeted at a SPECIFIC repo path (not the active session's cwd)
  // Used by the multi-repo view: clicks on a repo's "pull" should pull THAT repo.
  const runInRepoSession = (repoPath, command) => {
    if (!sessionId) {
      alert('请先选择一个会话');
      return;
    }
    // Use a subshell so the cd doesn't pollute the user's pty
    const fullCmd = `(cd '${repoPath.replace(/'/g, "'\\''")}' && ${command})`;
    window.electronAPI.gitRunInSession(sessionId, fullCmd);
    setTimeout(scanRepos, 1500);
  };

  const isRepo = status?.isRepo;
  const handleCommit = async () => {
    const msg = await showPrompt({
      title: '提交信息',
      defaultValue: '',
      placeholder: '例如：fix: handle detached HEAD in git panel',
      confirmLabel: '提交',
    });
    if (!msg) return;
    const escaped = msg.replace(/'/g, "'\\''");
    runInSession(`git commit -m '${escaped}'`);
  };

  return (
    <div style={{
      ...styles.panel,
      transform: open ? 'translateX(0)' : 'translateX(100%)',
      pointerEvents: open ? 'auto' : 'none',
    }}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <GitIcon />
          <span style={styles.headerTitle}>Git</span>
          {mode === 'current' && status?.branch && (
            <span style={styles.branchBadge}>
              {status.branch}
              {status.ahead > 0 && <span style={styles.aheadBadge}>↑{status.ahead}</span>}
              {status.behind > 0 && <span style={styles.behindBadge}>↓{status.behind}</span>}
            </span>
          )}
          {mode === 'scan' && scanResult && (
            <span style={styles.branchBadge}>
              {scanResult.repos.length} 仓库
            </span>
          )}
        </div>
        <div style={styles.headerActions}>
          <button
            style={styles.iconBtn}
            onClick={() => mode === 'current' ? refresh() : scanRepos()}
            title="刷新"
          >↻</button>
          <button style={styles.iconBtn} onClick={onClose} title="关闭">×</button>
        </div>
      </div>

      {/* Mode toggle (current vs scan) */}
      <div style={styles.modeToggle}>
        <button
          style={{
            ...styles.modeBtn,
            color: mode === 'current' ? '#e2e8f0' : '#555',
            background: mode === 'current' ? '#1a150a' : 'transparent',
            borderColor: mode === 'current' ? '#3a2e0a' : '#1a1a1a',
          }}
          onClick={() => setMode('current')}
        >
          当前仓库
        </button>
        <button
          style={{
            ...styles.modeBtn,
            color: mode === 'scan' ? '#e2e8f0' : '#555',
            background: mode === 'scan' ? '#1a150a' : 'transparent',
            borderColor: mode === 'scan' ? '#3a2e0a' : '#1a1a1a',
          }}
          onClick={() => setMode('scan')}
        >
          扫描全部
        </button>
      </div>

      {/* ═══ MODE: current ════════════════════════════════════════════ */}
      {mode === 'current' && (
        <>
          {status && !isRepo && (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>⚠</div>
              <p style={styles.emptyTitle}>当前目录不是 Git 仓库</p>
              <p style={styles.emptyHint}>{cwd}</p>
              <button style={styles.bigBtn} onClick={() => runInSession('git init')}>
                初始化仓库
              </button>
              <p style={styles.emptyHint}>或切换到"扫描全部"模式查找子目录中的仓库</p>
            </div>
          )}

          {loading && !status && <div style={styles.placeholder}>加载中...</div>}

          {isRepo && (
            <>
              <div style={styles.tabs}>
                <TabBtn active={activeTab === 'changes'} onClick={() => setActiveTab('changes')}>
                  变更 {status.files.length > 0 && <span style={styles.tabCount}>{status.files.length}</span>}
                </TabBtn>
                <TabBtn active={activeTab === 'branches'} onClick={() => setActiveTab('branches')}>
                  分支
                </TabBtn>
                <TabBtn active={activeTab === 'log'} onClick={() => setActiveTab('log')}>
                  历史
                </TabBtn>
              </div>

              <div style={styles.tabBody}>
                {activeTab === 'changes' && (
                  <ChangesTab files={status.files} runInSession={runInSession} onCommit={handleCommit} />
                )}
                {activeTab === 'branches' && (
                  <BranchesTab branches={branches} runInSession={runInSession} />
                )}
                {activeTab === 'log' && (
                  <LogTab commits={commits} />
                )}
              </div>

              <div style={styles.footer}>
                <button style={styles.actionBtn} onClick={() => runInSession('git pull')} title="拉取远程更新">
                  ⬇ Pull
                </button>
                <button style={styles.actionBtn} onClick={() => runInSession('git push')} title="推送到远程">
                  ⬆ Push
                </button>
                <button style={styles.actionBtn} onClick={() => runInSession('git fetch')} title="获取远程信息">
                  ↻ Fetch
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══ MODE: scan (multi-repo) ═══════════════════════════════════ */}
      {mode === 'scan' && (
        <ScanModeView
          scanResult={scanResult}
          scanning={scanning}
          onRefresh={scanRepos}
          runInRepoSession={runInRepoSession}
        />
      )}
    </div>
  );
}

// ─── Multi-repo scan mode ───────────────────────────────────────────────────

function ScanModeView({ scanResult, scanning, onRefresh, runInRepoSession }) {
  if (scanning && !scanResult) {
    return (
      <div style={styles.scanLoading}>
        <div style={styles.scanSpinner}>↻</div>
        <p style={styles.scanText}>正在扫描子目录中的 Git 仓库...</p>
        <p style={styles.scanHint}>深度上限 4 层，自动跳过 node_modules 等</p>
      </div>
    );
  }

  if (!scanResult || scanResult.repos.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>⌕</div>
        <p style={styles.emptyTitle}>未找到任何 Git 仓库</p>
        <p style={styles.emptyHint}>{scanResult?.rootDir}</p>
      </div>
    );
  }

  // Aggregate stats for the header strip
  const total = scanResult.repos.length;
  const dirty = scanResult.repos.filter((r) => (r.changeCount || 0) > 0).length;
  const ahead = scanResult.repos.filter((r) => (r.ahead || 0) > 0).length;
  const behind = scanResult.repos.filter((r) => (r.behind || 0) > 0).length;

  return (
    <>
      {/* Stats strip */}
      <div style={styles.scanStats}>
        <Stat label="总计" value={total} color="#888" />
        <Stat label="有变更" value={dirty} color={dirty ? '#eab308' : '#3a3a3a'} />
        <Stat label="待推送" value={ahead} color={ahead ? '#22c55e' : '#3a3a3a'} />
        <Stat label="待拉取" value={behind} color={behind ? '#3b82f6' : '#3a3a3a'} />
        <div style={{ flex: 1 }} />
        <span style={styles.scanElapsed}>{scanResult.elapsedMs}ms</span>
      </div>

      {/* Repo list */}
      <div style={styles.repoList}>
        {scanResult.repos.map((repo) => (
          <RepoCard key={repo.path} repo={repo} runInRepoSession={runInRepoSession} />
        ))}
      </div>

      {/* Bulk actions footer */}
      <div style={styles.footer}>
        <button
          style={styles.actionBtn}
          onClick={() => {
            // Pull all dirty-free repos in parallel? — too aggressive.
            // Instead pull every repo sequentially via a single shell command.
            const cmds = scanResult.repos
              .map((r) => `(cd '${r.path.replace(/'/g, "'\\''")}' && git pull)`)
              .join(' ; ');
            runInRepoSession(scanResult.rootDir, cmds);
          }}
          title="对所有仓库执行 git pull"
        >
          ⬇ Pull All
        </button>
        <button
          style={styles.actionBtn}
          onClick={() => {
            const cmds = scanResult.repos
              .map((r) => `(cd '${r.path.replace(/'/g, "'\\''")}' && git fetch)`)
              .join(' ; ');
            runInRepoSession(scanResult.rootDir, cmds);
          }}
          title="对所有仓库执行 git fetch"
        >
          ↻ Fetch All
        </button>
        <button style={styles.actionBtn} onClick={onRefresh} title="重新扫描">
          ⌕ 重扫描
        </button>
      </div>
    </>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={styles.stat}>
      <span style={{ ...styles.statValue, color }}>{value}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function RepoCard({ repo, runInRepoSession }) {
  const [expanded, setExpanded] = useState(false);

  if (repo.error) {
    return (
      <div style={styles.repoCard}>
        <div style={styles.repoHeader}>
          <span style={styles.repoName}>{repo.name}</span>
          <span style={styles.errorMark}>⚠</span>
        </div>
        <div style={styles.repoPath}>{repo.relativePath || repo.path}</div>
      </div>
    );
  }

  const dirty = (repo.changeCount || 0) > 0;
  const hasAhead = (repo.ahead || 0) > 0;
  const hasBehind = (repo.behind || 0) > 0;

  // Health: green = clean & in sync, yellow = dirty, red = both ahead and behind
  let healthColor = '#22c55e';
  if (dirty) healthColor = '#eab308';
  if (hasAhead && hasBehind) healthColor = '#ef4444';

  return (
    <div style={styles.repoCard}>
      {/* Header row — clickable to expand */}
      <div style={styles.repoHeader} onClick={() => setExpanded((v) => !v)}>
        <span style={{ ...styles.healthDot, background: healthColor, boxShadow: `0 0 6px ${healthColor}55` }} />
        <span style={styles.repoName} title={repo.path}>{repo.name}</span>
        <span style={styles.repoBranch}>{repo.branch}</span>
        <div style={{ flex: 1 }} />
        {dirty && <span style={styles.miniBadge} title={`${repo.changeCount} 个文件变更`}>● {repo.changeCount}</span>}
        {hasAhead && <span style={{ ...styles.miniBadge, color: '#22c55e' }}>↑{repo.ahead}</span>}
        {hasBehind && <span style={{ ...styles.miniBadge, color: '#3b82f6' }}>↓{repo.behind}</span>}
      </div>

      {/* Relative path */}
      {repo.relativePath && repo.relativePath !== repo.name && (
        <div style={styles.repoPath}>{repo.relativePath}</div>
      )}

      {/* Expanded: file list + actions */}
      {expanded && (
        <div style={styles.repoExpand}>
          {repo.files && repo.files.length > 0 && (
            <div style={styles.repoFiles}>
              {repo.files.slice(0, 8).map((f) => {
                const meta = STATUS_META[f.status] || STATUS_META.modified;
                return (
                  <div key={f.path} style={styles.repoFileRow}>
                    <span style={{
                      ...styles.statusBadge,
                      color: meta.color,
                      borderColor: `${meta.color}55`,
                      background: `${meta.color}12`,
                    }}>{meta.letter}</span>
                    <span style={styles.repoFileName}>{f.path}</span>
                  </div>
                );
              })}
              {repo.files.length > 8 && (
                <div style={styles.moreFiles}>... 还有 {repo.files.length - 8} 个文件</div>
              )}
            </div>
          )}

          <div style={styles.repoActions}>
            <button
              style={styles.repoActionBtn}
              onClick={(e) => { e.stopPropagation(); runInRepoSession(repo.path, 'git status'); }}
            >
              查看
            </button>
            <button
              style={styles.repoActionBtn}
              onClick={(e) => { e.stopPropagation(); runInRepoSession(repo.path, 'git pull'); }}
            >
              ⬇ Pull
            </button>
            <button
              style={styles.repoActionBtn}
              onClick={(e) => { e.stopPropagation(); runInRepoSession(repo.path, 'git push'); }}
            >
              ⬆ Push
            </button>
            <button
              style={styles.repoActionBtn}
              onClick={(e) => { e.stopPropagation(); runInRepoSession(repo.path, 'git fetch'); }}
            >
              ↻ Fetch
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.tabBtn,
        color: active ? '#e2e8f0' : '#555',
        borderBottomColor: active ? '#f59e0b' : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

function ChangesTab({ files, runInSession, onCommit }) {
  if (files.length === 0) {
    return (
      <div style={styles.emptyTab}>
        <div style={styles.cleanIcon}>✓</div>
        <p style={styles.cleanText}>工作区干净</p>
      </div>
    );
  }

  return (
    <>
      <div style={styles.changesList}>
        {files.map((f) => {
          const meta = STATUS_META[f.status] || STATUS_META.modified;
          return (
            <div key={f.path} style={styles.changeRow} title={`${meta.label}: ${f.path}`}>
              <span style={{ ...styles.statusBadge, color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}12` }}>
                {meta.letter}
              </span>
              <span style={styles.filePath}>{f.path}</span>
              {f.staged && <span style={styles.stagedDot} title="已暂存" />}
            </div>
          );
        })}
      </div>
      <div style={styles.changeActions}>
        <button style={styles.actionBtnFull} onClick={() => runInSession('git add -A && git status')}>
          全部暂存
        </button>
        <button
          style={styles.actionBtnFull}
          onClick={onCommit}
        >
          提交
        </button>
      </div>
    </>
  );
}

function BranchesTab({ branches, runInSession }) {
  const local = branches.filter((b) => !b.remote);
  const remote = branches.filter((b) => b.remote);

  return (
    <div style={styles.branchList}>
      <div style={styles.sectionLabel}>本地</div>
      {local.map((b) => (
        <div
          key={b.name}
          style={{ ...styles.branchRow, color: b.current ? '#f59e0b' : '#888' }}
          onClick={() => !b.current && runInSession(`git checkout ${b.name}`)}
        >
          <span>{b.current ? '●' : '○'}</span>
          <span>{b.name}</span>
        </div>
      ))}
      {remote.length > 0 && (
        <>
          <div style={styles.sectionLabel}>远程</div>
          {remote.map((b) => (
            <div key={b.name} style={{ ...styles.branchRow, color: '#555' }}>
              <span>○</span>
              <span>{b.name.replace(/^remotes\//, '')}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function LogTab({ commits }) {
  if (commits.length === 0) {
    return <div style={styles.placeholder}>无 commit 历史</div>;
  }
  return (
    <div style={styles.logList}>
      {commits.map((c) => (
        <div key={c.hash} style={styles.commitRow}>
          <div style={styles.commitHeader}>
            <code style={styles.commitHash}>{c.hash}</code>
            <span style={styles.commitDate}>{c.relativeDate}</span>
          </div>
          <div style={styles.commitSubject}>{c.subject}</div>
          <div style={styles.commitAuthor}>{c.author}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Inline icon ─────────────────────────────────────────────────────────────

const GitIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#f59e0b' }}>
    <circle cx="18" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <path d="M6 21V9a9 9 0 0 0 9 9" />
  </svg>
);

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 320,
    background: '#0b0b0b',
    borderLeft: '1px solid #1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
    zIndex: 60,
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
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#d0d0d0',
    fontFamily: 'var(--font-ui)',
  },
  branchBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: '#f59e0b',
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.25)',
    borderRadius: 3,
    padding: '2px 6px',
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  aheadBadge: { color: '#22c55e', fontSize: 9 },
  behindBadge: { color: '#ef4444', fontSize: 9 },
  headerActions: { display: 'flex', gap: 4 },
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

  // Empty / loading
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 20px',
    gap: 8,
  },
  emptyIcon: { fontSize: 28, color: '#3a2e0a' },
  emptyTitle: { fontSize: 12, color: '#888', fontFamily: 'var(--font-ui)' },
  emptyHint: {
    fontSize: 10,
    color: '#3a3a3a',
    fontFamily: 'var(--font-mono)',
    textAlign: 'center',
    marginBottom: 8,
  },
  bigBtn: {
    background: '#1a150a',
    border: '1px solid #3a2e0a',
    borderRadius: 4,
    color: '#f59e0b',
    fontSize: 11,
    padding: '6px 14px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
  },
  placeholder: {
    fontSize: 11,
    color: '#3a3a3a',
    padding: '20px 14px',
    fontFamily: 'var(--font-mono)',
    textAlign: 'center',
  },

  // Tabs
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #161616',
    background: '#0a0a0a',
    flexShrink: 0,
  },
  tabBtn: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
    fontFamily: 'var(--font-ui)',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  tabCount: {
    fontSize: 9,
    background: '#1c1c1c',
    color: '#888',
    padding: '0px 5px',
    borderRadius: 8,
    fontFamily: 'var(--font-mono)',
  },
  tabBody: {
    flex: 1,
    overflow: 'auto',
    padding: '6px 0',
  },

  // Changes
  changesList: { display: 'flex', flexDirection: 'column' },
  changeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 14px',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    border: '1px solid',
    borderRadius: 3,
    fontSize: 9,
    fontWeight: 700,
    flexShrink: 0,
  },
  filePath: {
    fontSize: 11,
    color: '#a0a0a0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  stagedDot: {
    width: 5,
    height: 5,
    background: '#22c55e',
    borderRadius: '50%',
    flexShrink: 0,
  },

  changeActions: {
    display: 'flex',
    gap: 6,
    padding: '10px 14px',
    borderTop: '1px solid #161616',
    background: '#0a0a0a',
  },
  actionBtnFull: {
    flex: 1,
    background: '#151515',
    border: '1px solid #242424',
    borderRadius: 4,
    color: '#999',
    fontSize: 11,
    padding: '6px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
  },

  emptyTab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '30px 16px',
    gap: 6,
  },
  cleanIcon: { fontSize: 24, color: '#22c55e' },
  cleanText: { fontSize: 11, color: '#555' },

  // Branches
  branchList: { display: 'flex', flexDirection: 'column' },
  sectionLabel: {
    fontSize: 9,
    color: '#333',
    padding: '8px 14px 4px',
    fontFamily: 'var(--font-ui)',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  branchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 14px 5px 16px',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },

  // Log
  logList: { display: 'flex', flexDirection: 'column' },
  commitRow: {
    padding: '8px 14px',
    borderBottom: '1px solid #131313',
  },
  commitHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  commitHash: {
    fontSize: 10,
    color: '#f59e0b',
    fontFamily: 'var(--font-mono)',
    background: 'rgba(245, 158, 11, 0.08)',
    padding: '1px 5px',
    borderRadius: 3,
  },
  commitDate: {
    fontSize: 10,
    color: '#3a3a3a',
    fontFamily: 'var(--font-mono)',
  },
  commitSubject: {
    fontSize: 11,
    color: '#c0c0c0',
    marginBottom: 2,
    fontFamily: 'var(--font-ui)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  commitAuthor: {
    fontSize: 10,
    color: '#444',
    fontFamily: 'var(--font-ui)',
  },

  // Footer
  footer: {
    display: 'flex',
    gap: 6,
    padding: '10px 14px',
    borderTop: '1px solid #161616',
    background: '#0a0a0a',
    flexShrink: 0,
  },
  actionBtn: {
    flex: 1,
    background: '#151515',
    border: '1px solid #242424',
    borderRadius: 4,
    color: '#888',
    fontSize: 10,
    padding: '5px 8px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
  },
  errorMark: {
    color: '#ef4444',
    fontSize: 12,
  },

  // ── Mode toggle (current vs scan) ─────────────────────────────────────
  modeToggle: {
    display: 'flex',
    gap: 6,
    padding: '8px 14px',
    borderBottom: '1px solid #161616',
    background: '#0a0a0a',
    flexShrink: 0,
  },
  modeBtn: {
    flex: 1,
    background: 'transparent',
    border: '1px solid #1a1a1a',
    borderRadius: 5,
    color: '#555',
    fontSize: 11,
    fontWeight: 500,
    padding: '5px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    transition: 'all 0.15s',
  },

  // ── Scan mode ─────────────────────────────────────────────────────────
  scanLoading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '50px 20px',
    gap: 10,
  },
  scanSpinner: {
    fontSize: 28,
    color: '#f59e0b',
    animation: 'spin 1.2s linear infinite',
  },
  scanText: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'var(--font-ui)',
  },
  scanHint: {
    fontSize: 10,
    color: '#3a3a3a',
    fontFamily: 'var(--font-ui)',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  scanStats: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 14px',
    background: '#0a0a0a',
    borderBottom: '1px solid #161616',
    flexShrink: 0,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.2,
  },
  statLabel: {
    fontSize: 9,
    color: '#3a3a3a',
    fontFamily: 'var(--font-ui)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  scanElapsed: {
    fontSize: 10,
    color: '#3a3a3a',
    fontFamily: 'var(--font-mono)',
  },

  // ── Repo card list ────────────────────────────────────────────────────
  repoList: {
    flex: 1,
    overflowY: 'auto',
    padding: '6px 8px',
  },
  repoCard: {
    background: '#101010',
    border: '1px solid #161616',
    borderRadius: 6,
    marginBottom: 5,
    overflow: 'hidden',
    transition: 'border-color 0.15s, background 0.15s',
  },
  repoHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  repoName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#d0d0d0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 130,
  },
  repoBranch: {
    fontSize: 10,
    color: '#666',
    fontFamily: 'var(--font-mono)',
    background: '#0a0a0a',
    padding: '1px 6px',
    borderRadius: 3,
    border: '1px solid #1a1a1a',
  },
  miniBadge: {
    fontSize: 10,
    color: '#eab308',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    flexShrink: 0,
  },
  repoPath: {
    fontSize: 9,
    color: '#333',
    fontFamily: 'var(--font-mono)',
    padding: '0 12px 6px 28px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  repoExpand: {
    borderTop: '1px solid #161616',
    background: '#0a0a0a',
    padding: '8px 12px',
  },
  repoFiles: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    marginBottom: 8,
  },
  repoFileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  repoFileName: {
    fontSize: 10,
    color: '#888',
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  moreFiles: {
    fontSize: 10,
    color: '#3a3a3a',
    fontFamily: 'var(--font-ui)',
    fontStyle: 'italic',
    paddingLeft: 22,
  },
  repoActions: {
    display: 'flex',
    gap: 5,
    paddingTop: 6,
    borderTop: '1px solid #131313',
  },
  repoActionBtn: {
    flex: 1,
    background: '#151515',
    border: '1px solid #232323',
    borderRadius: 4,
    color: '#888',
    fontSize: 10,
    padding: '4px 6px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
  },
};

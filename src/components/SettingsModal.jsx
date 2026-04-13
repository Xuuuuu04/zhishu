import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../store/sessions';

// Display colors for each tool — kept in sync with TerminalView
const TOOL_COLORS = {
  claude: '#d97706',
  codex: '#16a34a',
  gemini: '#3b82f6',
  qwen: '#06b6d4',
  opencode: '#f97316',
  glm: '#a855f7',
  minimax: '#ec4899',
  kimi: '#0ea5e9',
};

/**
 * Modal overlay for configuring providers + viewing tool installation status.
 * Accessible via the ⚙ button in the top toolbar.
 */
export default function SettingsModal() {
  const {
    settingsOpen, closeSettings,
    toolCatalog, toolStatus, refreshToolStatus,
    providerConfigs, updateProviderConfig,
    activeSessionId,
    theme, setTheme,
    getActiveSession,
    autoRestoreSessions, toggleAutoRestoreSessions,
  } = useSessionStore();

  const [activeTab, setActiveTab] = useState('tools');
  const activeProject = getActiveSession()?.project;

  // Refresh tool status when the modal opens
  useEffect(() => {
    if (settingsOpen) refreshToolStatus();
  }, [settingsOpen, refreshToolStatus]);

  // Dismiss on Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e) => { if (e.key === 'Escape') closeSettings(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [settingsOpen, closeSettings]);

  if (!settingsOpen) return null;

  const tools = Object.values(toolCatalog.tools || {});
  const providers = Object.values(toolCatalog.providers || {});

  return (
    <div style={styles.backdrop} onClick={closeSettings}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* ═══ Header ═════════════════════════════════════════════════════ */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerIcon}>⚙</span>
            <span style={styles.headerTitle}>设置</span>
          </div>
          <button style={styles.closeBtn} onClick={closeSettings} title="关闭 (Esc)">×</button>
        </div>

        {/* ═══ Tabs ═══════════════════════════════════════════════════════ */}
        <div style={styles.tabs}>
          <TabButton active={activeTab === 'tools'} onClick={() => setActiveTab('tools')}>
            AI 工具
          </TabButton>
          <TabButton active={activeTab === 'providers'} onClick={() => setActiveTab('providers')}>
            Provider
          </TabButton>
          <TabButton active={activeTab === 'agents'} onClick={() => setActiveTab('agents')}>
            Agent 配置
          </TabButton>
          <TabButton active={activeTab === 'appearance'} onClick={() => setActiveTab('appearance')}>
            外观
          </TabButton>
          <TabButton active={activeTab === 'about'} onClick={() => setActiveTab('about')}>
            关于
          </TabButton>
          <div style={{ flex: 1 }} />
          {activeTab === 'tools' && (
            <button style={styles.refreshBtn} onClick={refreshToolStatus} title="重新检测">
              ↻ 检测
            </button>
          )}
        </div>

        {/* ═══ Body ═══════════════════════════════════════════════════════ */}
        <div style={styles.body}>
          {activeTab === 'tools' && (
            <div style={styles.toolsList}>
              {tools.map((tool) => (
                <ToolRow
                  key={tool.id}
                  tool={tool}
                  status={toolStatus[tool.id]}
                  sessionId={activeSessionId}
                  color={TOOL_COLORS[tool.id] || '#888'}
                />
              ))}
            </div>
          )}

          {activeTab === 'providers' && (
            <div style={styles.providersList}>
              <p style={styles.hint}>
                Provider 基于官方 Claude 二进制，通过环境变量切换 API 端点。
                配置后可直接一键启动，无需任何 shell 函数。
              </p>
              {providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  config={providerConfigs[provider.id] || {}}
                  onUpdate={(patch) => updateProviderConfig(provider.id, patch)}
                  color={TOOL_COLORS[provider.id] || '#888'}
                />
              ))}
            </div>
          )}

          {activeTab === 'agents' && (
            <AgentConfigTab project={activeProject} tools={tools} />
          )}

          {activeTab === 'appearance' && (
            <AppearanceTab
              theme={theme}
              setTheme={setTheme}
              autoRestoreSessions={autoRestoreSessions}
              toggleAutoRestoreSessions={toggleAutoRestoreSessions}
            />
          )}

          {activeTab === 'about' && (
            <div style={styles.aboutBox}>
              <h3 style={styles.aboutTitle}>智枢 ZhiShu</h3>
              <p style={styles.aboutText}>
                统一管理多个 AI 编程 CLI 工具的专业终端面板。
              </p>
              <p style={styles.aboutText}>
                支持 Claude / Codex / Gemini / Qwen / OpenCode / GLM / MiniMax / Kimi
                等多种工具的快捷启动、进程监控、响应完成通知、Git 管理和文件浏览。
              </p>
              <div style={styles.aboutMeta}>
                <div>version 1.0.0</div>
                <div>Electron · React · xterm.js · node-pty</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab button ──────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.tab,
        color: active ? '#e2e8f0' : '#555',
        borderBottomColor: active ? '#f59e0b' : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

// ─── Tool row (status + install/upgrade buttons) ─────────────────────────────

function ToolRow({ tool, status, sessionId, color }) {
  const installed = status?.installed;
  const version = status?.version;

  const handleInstall = () => {
    if (!sessionId) {
      alert('请先在左侧打开一个会话');
      return;
    }
    window.electronAPI.installToolInSession(sessionId, tool.id, 'install');
  };

  const handleUpgrade = () => {
    if (!sessionId) {
      alert('请先在左侧打开一个会话');
      return;
    }
    window.electronAPI.installToolInSession(sessionId, tool.id, 'upgrade');
  };

  return (
    <div style={styles.toolRow}>
      <div style={{ ...styles.toolBadge, background: `${color}15`, borderColor: `${color}40`, color }}>
        {tool.command[0].toUpperCase()}
      </div>
      <div style={styles.toolInfo}>
        <div style={styles.toolName}>{tool.name}</div>
        <div style={styles.toolMeta}>
          <code style={styles.toolCmd}>{tool.command}</code>
          <span style={{ ...styles.toolBadgeSmall, color: installed ? '#22c55e' : '#555' }}>
            {installed === undefined ? '检测中…' : installed ? `✓ ${version || 'installed'}` : '未安装'}
          </span>
        </div>
      </div>
      <div style={styles.toolActions}>
        {installed ? (
          <button style={styles.btnSecondary} onClick={handleUpgrade}>升级</button>
        ) : (
          <button style={{ ...styles.btnPrimary, borderColor: color, color }} onClick={handleInstall}>
            安装
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Provider config card ────────────────────────────────────────────────────

function ProviderCard({ provider, config, onUpdate, color }) {
  const [showKey, setShowKey] = useState(false);
  const cfg = {
    apiKey: config.apiKey || '',
    baseUrl: config.baseUrl || provider.defaults.baseUrl,
    opusModel: config.opusModel || provider.defaults.opusModel,
    sonnetModel: config.sonnetModel || provider.defaults.sonnetModel,
    haikuModel: config.haikuModel || provider.defaults.haikuModel,
  };

  const isConfigured = !!cfg.apiKey;

  return (
    <div style={{ ...styles.providerCard, borderLeftColor: color }}>
      <div style={styles.providerHeader}>
        <div style={{ ...styles.toolBadge, background: `${color}15`, borderColor: `${color}40`, color }}>
          {provider.name[0]}
        </div>
        <div style={styles.providerTitle}>
          <div style={styles.providerName}>{provider.name}</div>
          <div style={styles.providerSub}>
            基于 {provider.baseTool} · {isConfigured ? (
              <span style={{ color: '#22c55e' }}>● 已配置</span>
            ) : (
              <span style={{ color: '#eab308' }}>⚠ 未配置 API Key</span>
            )}
          </div>
        </div>
      </div>

      <div style={styles.providerForm}>
        <Field label="API Key">
          <div style={styles.keyRow}>
            <input
              type={showKey ? 'text' : 'password'}
              value={cfg.apiKey}
              onChange={(e) => onUpdate({ apiKey: e.target.value })}
              placeholder="sk-..."
              style={styles.input}
            />
            <button
              type="button"
              style={styles.smallBtn}
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
        </Field>

        <Field label="Base URL">
          <input
            type="text"
            value={cfg.baseUrl}
            onChange={(e) => onUpdate({ baseUrl: e.target.value })}
            style={styles.input}
          />
        </Field>

        <div style={styles.modelRow}>
          <Field label="Opus Model">
            <input
              type="text"
              value={cfg.opusModel}
              onChange={(e) => onUpdate({ opusModel: e.target.value })}
              style={styles.input}
            />
          </Field>
          <Field label="Sonnet Model">
            <input
              type="text"
              value={cfg.sonnetModel}
              onChange={(e) => onUpdate({ sonnetModel: e.target.value })}
              style={styles.input}
            />
          </Field>
          <Field label="Haiku Model">
            <input
              type="text"
              value={cfg.haikuModel}
              onChange={(e) => onUpdate({ haikuModel: e.target.value })}
              style={styles.input}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={styles.field}>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

// ─── Agent Config Tab ───────────────────────────────────────────────────────
//
// Each tool has its own per-project memory file (CLAUDE.md / AGENTS.md / etc.)
// This tab lets users see which files exist in the active project and quickly
// create / open / edit them.

function AgentConfigTab({ project, tools }) {
  if (!project) {
    return (
      <div style={styles.hint}>
        请先在左侧选择一个项目和会话。
      </div>
    );
  }

  return (
    <div>
      <p style={styles.hint}>
        每个 AI 工具都有自己的项目级配置文件（Memory File），AI 会自动读取它来理解你的项目。
        Codex 和 OpenCode 共用 <code style={styles.codeMark}>AGENTS.md</code>。
      </p>
      <div style={styles.agentList}>
        {tools.map((tool) => (
          <AgentFileRow key={tool.id} tool={tool} projectPath={project.path} />
        ))}
      </div>
    </div>
  );
}

function AgentFileRow({ tool, projectPath }) {
  const [exists, setExists] = useState(null);
  const filePath = `${projectPath}/${tool.memoryFile || 'AGENTS.md'}`;

  useEffect(() => {
    window.electronAPI.fileExists(filePath).then(setExists);
  }, [filePath]);

  const handleCreate = async () => {
    const template = generateMemoryTemplate(tool, projectPath);
    const res = await window.electronAPI.writeFile(filePath, template);
    if (res?.ok) {
      setExists(true);
      window.electronAPI.openFile(filePath);
    } else {
      alert(`创建失败: ${res?.error}`);
    }
  };

  const handleOpen = () => window.electronAPI.openFile(filePath);
  const handleReveal = () => window.electronAPI.revealInFinder(filePath);

  return (
    <div style={styles.agentRow}>
      <div style={styles.agentRowLeft}>
        <div style={styles.agentName}>{tool.name}</div>
        <code style={styles.agentPath}>{tool.memoryFile || 'AGENTS.md'}</code>
      </div>
      <div style={styles.agentRowRight}>
        {exists === null && <span style={styles.agentDim}>检测中…</span>}
        {exists === false && (
          <button style={styles.btnSmall} onClick={handleCreate}>+ 创建</button>
        )}
        {exists === true && (
          <>
            <span style={styles.agentExists}>✓ 已存在</span>
            <button style={styles.btnSmall} onClick={handleOpen}>打开</button>
            <button style={styles.btnSmallSec} onClick={handleReveal}>定位</button>
          </>
        )}
      </div>
    </div>
  );
}

function generateMemoryTemplate(tool, projectPath) {
  const projectName = projectPath.split('/').pop() || 'Project';
  return `# ${projectName}

> ${tool.name} 项目级 Memory 文件

## 项目背景

<!-- 简要描述这个项目是做什么的 -->

## 技术栈

<!-- 列出主要技术、框架、依赖 -->

## 代码风格约定

<!-- 命名规范、文件组织、注释风格等 -->

## 重要的文件 / 模块

<!-- 列出关键文件位置和用途 -->

## 常用命令

\`\`\`bash
# 启动开发
# 运行测试
# 构建
\`\`\`

## 已知约束 / 注意事项

<!-- 例如：不要提交某些文件，某些 API 有限流，等等 -->
`;
}

// ─── Appearance Tab ─────────────────────────────────────────────────────────

function AppearanceTab({ theme, setTheme, autoRestoreSessions, toggleAutoRestoreSessions }) {
  return (
    <div>
      <p style={styles.hint}>选择界面主题。深色主题更适合长时间使用。</p>
      <div style={styles.themeRow}>
        <ThemeCard
          id="dark"
          label="深色"
          active={theme === 'dark'}
          onClick={() => setTheme('dark')}
          colors={['#0a0a0a', '#0d0d0d', '#f59e0b']}
        />
        <ThemeCard
          id="light"
          label="浅色"
          active={theme === 'light'}
          onClick={() => {}}
          colors={['#f8fafc', '#ffffff', '#d97706']}
          wip
          disabled
        />
      </div>
      <p style={styles.hintDim}>
        浅色主题尚未完成，当前已禁用选择；完整支持需要后续把所有组件颜色迁移到 CSS 变量。
      </p>

      {/* Section divider */}
      <div style={{ height: 1, background: '#1a1a1a', margin: '24px 0 18px' }} />

      {/* Auto-restore sessions toggle */}
      <div style={styles.toggleRow}>
        <div style={styles.toggleInfo}>
          <div style={styles.toggleLabel}>启动时自动恢复 AI 会话</div>
          <div style={styles.toggleDesc}>
            应用重启时，对每个曾运行过 AI 工具的会话自动执行该工具的"续接最近一次会话"命令
            （如 <code style={styles.codeMark}>claude --continue</code> /
            <code style={styles.codeMark}>codex resume --last</code>），
            恢复完整的 AI 上下文。
          </div>
        </div>
        <button
          onClick={toggleAutoRestoreSessions}
          style={{
            ...styles.switch,
            background: autoRestoreSessions ? '#1a150a' : '#151515',
            borderColor: autoRestoreSessions ? '#3a2e0a' : '#2a2a2a',
          }}
        >
          <div style={{
            ...styles.switchKnob,
            transform: autoRestoreSessions ? 'translateX(18px)' : 'translateX(0)',
            background: autoRestoreSessions ? '#f59e0b' : '#444',
          }} />
        </button>
      </div>
    </div>
  );
}

function ThemeCard({ id, label, active, onClick, colors, wip, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.themeCard,
        borderColor: active ? '#f59e0b' : '#1e1e1e',
        boxShadow: active ? '0 0 0 1px rgba(245, 158, 11, 0.3), 0 4px 16px rgba(245, 158, 11, 0.15)' : 'none',
        position: 'relative',
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <div style={styles.themePreview}>
        <div style={{ ...styles.themePreviewSidebar, background: colors[1] }} />
        <div style={{ ...styles.themePreviewMain, background: colors[0] }}>
          <div style={{ ...styles.themePreviewBar, background: colors[2] }} />
        </div>
      </div>
      <div style={{ ...styles.themeLabel, color: active ? '#e2e8f0' : '#888' }}>
        {label}
      </div>
      {wip && (
        <span style={styles.wipBadge}>开发中</span>
      )}
    </button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9998,
    animation: 'fade-in 0.18s ease',
  },
  modal: {
    width: 680,
    maxHeight: '82vh',
    background: '#0d0d0d',
    border: '1px solid #1e1e1e',
    borderRadius: 10,
    boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 4px 12px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'toast-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid #1a1a1a',
    background: '#0f0f0f',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headerIcon: { fontSize: 16, color: '#f59e0b' },
  headerTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#e2e8f0',
    fontFamily: '"SF Pro Display", system-ui',
    letterSpacing: '-0.01em',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#555',
    fontSize: 22,
    cursor: 'pointer',
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    lineHeight: 1,
    padding: 0,
  },
  tabs: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 16px',
    borderBottom: '1px solid #161616',
    background: '#0b0b0b',
  },
  tab: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '11px 12px 10px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'system-ui',
    transition: 'all 0.15s',
  },
  refreshBtn: {
    background: '#151515',
    border: '1px solid #242424',
    borderRadius: 5,
    color: '#888',
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'system-ui',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px 22px',
  },

  // Tools list
  toolsList: { display: 'flex', flexDirection: 'column', gap: 10 },
  toolRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    background: '#111',
    border: '1px solid #1a1a1a',
    borderRadius: 7,
  },
  toolBadge: {
    width: 34,
    height: 34,
    borderRadius: 6,
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    fontWeight: 700,
    fontFamily: '"SF Pro Display", system-ui',
    flexShrink: 0,
  },
  toolInfo: { flex: 1, minWidth: 0 },
  toolName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e2e8f0',
    marginBottom: 3,
    fontFamily: 'system-ui',
  },
  toolMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 11,
  },
  toolCmd: {
    color: '#666',
    background: '#0a0a0a',
    padding: '2px 6px',
    borderRadius: 3,
    fontFamily: '"JetBrains Mono", monospace',
  },
  toolBadgeSmall: {
    fontSize: 10,
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 500,
  },
  toolActions: { flexShrink: 0 },
  btnPrimary: {
    background: 'transparent',
    border: '1px solid',
    borderRadius: 5,
    padding: '5px 14px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'system-ui',
    transition: 'all 0.15s',
  },
  btnSecondary: {
    background: '#151515',
    border: '1px solid #262626',
    borderRadius: 5,
    padding: '5px 14px',
    fontSize: 11,
    color: '#888',
    cursor: 'pointer',
    fontFamily: 'system-ui',
  },

  // Providers
  providersList: { display: 'flex', flexDirection: 'column', gap: 14 },
  hint: {
    fontSize: 11,
    color: '#555',
    marginBottom: 4,
    lineHeight: 1.6,
    fontFamily: 'system-ui',
  },
  providerCard: {
    background: '#111',
    border: '1px solid #1a1a1a',
    borderLeftWidth: 3,
    borderRadius: 7,
    padding: '14px 16px',
  },
  providerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  providerTitle: { flex: 1 },
  providerName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e2e8f0',
    marginBottom: 2,
    fontFamily: 'system-ui',
  },
  providerSub: {
    fontSize: 10,
    color: '#555',
    fontFamily: 'system-ui',
  },
  providerForm: { display: 'flex', flexDirection: 'column', gap: 9 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: {
    fontSize: 10,
    color: '#4a4a4a',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    fontFamily: 'system-ui',
  },
  input: {
    background: '#0a0a0a',
    border: '1px solid #1e1e1e',
    borderRadius: 4,
    color: '#e2e8f0',
    padding: '6px 10px',
    fontSize: 12,
    fontFamily: '"JetBrains Mono", monospace',
    outline: 'none',
    width: '100%',
  },
  keyRow: { display: 'flex', gap: 6 },
  smallBtn: {
    background: '#151515',
    border: '1px solid #242424',
    borderRadius: 4,
    color: '#777',
    padding: '4px 9px',
    fontSize: 10,
    cursor: 'pointer',
    fontFamily: 'system-ui',
    flexShrink: 0,
  },
  modelRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 8,
  },

  codeMark: {
    color: '#f59e0b',
    background: 'rgba(245, 158, 11, 0.08)',
    padding: '1px 5px',
    borderRadius: 3,
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
  },

  // Agent config tab
  agentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 6,
  },
  agentRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '11px 14px',
    background: '#111',
    border: '1px solid #1a1a1a',
    borderRadius: 6,
  },
  agentRowLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    minWidth: 0,
  },
  agentRowRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    flexShrink: 0,
  },
  agentName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#d0d0d0',
    fontFamily: 'var(--font-ui)',
  },
  agentPath: {
    fontSize: 10,
    color: '#666',
    fontFamily: 'var(--font-mono)',
    background: '#0a0a0a',
    padding: '1px 6px',
    borderRadius: 3,
    border: '1px solid #1a1a1a',
    width: 'fit-content',
  },
  agentDim: {
    fontSize: 10,
    color: '#3a3a3a',
    fontFamily: 'var(--font-mono)',
  },
  agentExists: {
    fontSize: 10,
    color: '#22c55e',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
  },
  btnSmall: {
    background: '#1a150a',
    border: '1px solid #3a2e0a',
    borderRadius: 4,
    color: '#f59e0b',
    fontSize: 10,
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    fontWeight: 600,
  },
  btnSmallSec: {
    background: '#151515',
    border: '1px solid #242424',
    borderRadius: 4,
    color: '#777',
    fontSize: 10,
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
  },

  // Appearance tab
  themeRow: {
    display: 'flex',
    gap: 14,
    marginTop: 10,
  },
  themeCard: {
    flex: 1,
    background: '#0d0d0d',
    border: '1px solid #1e1e1e',
    borderRadius: 8,
    padding: 14,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  themePreview: {
    display: 'flex',
    width: '100%',
    height: 70,
    borderRadius: 5,
    overflow: 'hidden',
    border: '1px solid #1a1a1a',
  },
  themePreviewSidebar: {
    width: '32%',
    borderRight: '1px solid rgba(255,255,255,0.05)',
  },
  themePreviewMain: {
    flex: 1,
    padding: 6,
  },
  themePreviewBar: {
    width: '40%',
    height: 4,
    borderRadius: 2,
  },
  themeLabel: {
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'var(--font-ui)',
  },
  wipBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    fontSize: 9,
    fontWeight: 700,
    color: '#eab308',
    background: 'rgba(234, 179, 8, 0.12)',
    border: '1px solid rgba(234, 179, 8, 0.3)',
    borderRadius: 3,
    padding: '2px 6px',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.05em',
  },
  hintDim: {
    fontSize: 10,
    color: '#3a3a3a',
    marginTop: 14,
    lineHeight: 1.6,
    fontFamily: 'var(--font-ui)',
  },

  // Toggle row (label + description + switch)
  toggleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    padding: '4px 0',
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e2e8f0',
    fontFamily: 'var(--font-ui)',
    marginBottom: 4,
  },
  toggleDesc: {
    fontSize: 11,
    color: '#666',
    lineHeight: 1.55,
    fontFamily: 'var(--font-ui)',
  },
  switch: {
    width: 38,
    height: 22,
    border: '1px solid #2a2a2a',
    borderRadius: 11,
    cursor: 'pointer',
    padding: '2px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
    marginTop: 2,
  },
  switchKnob: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    transition: 'transform 0.18s, background 0.18s',
  },

  // About
  aboutBox: {
    padding: '10px 4px',
  },
  aboutTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#e2e8f0',
    marginBottom: 10,
    fontFamily: '"SF Pro Display", system-ui',
  },
  aboutText: {
    fontSize: 12,
    color: '#888',
    lineHeight: 1.7,
    marginBottom: 6,
    fontFamily: 'system-ui',
  },
  aboutMeta: {
    marginTop: 16,
    fontSize: 10,
    color: '#3a3a3a',
    fontFamily: '"JetBrains Mono", monospace',
    lineHeight: 1.8,
  },
};

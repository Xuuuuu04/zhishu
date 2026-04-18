import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../store/sessions';
import { TOOL_COLORS, PRESET_COLORS } from '../constants/toolVisuals';
import styles from './settings/styles';
import TabButton from './settings/TabButton';
import ToolRow from './settings/ToolRow';
import ProviderCard from './settings/ProviderCard';
import CustomProviderCard from './settings/CustomProviderCard';
import AgentConfigTab from './settings/AgentConfigTab';
import AppearanceTab from './settings/AppearanceTab';
import { ZhiShuLogo } from './ToolIcons';
import pkg from '../../package.json';
const version = pkg.version;
const author = pkg.author || 'Xuuuuu04';

const CHANGELOG = [
  { version: '1.3.0', date: '2026-04', summary: '工具选择器 / 项目-TODO 联动 / 系统监控' },
  { version: '1.2.0', date: '2026-03', summary: '终端缓冲持久化 / 资源监控条 / 拖拽排序' },
  { version: '1.1.0', date: '2026-02', summary: '多 Provider 支持 / Agent 配置 / Git 面板' },
];

/**
 * Modal overlay for configuring providers + viewing tool installation status.
 * Accessible via the gear button in the top toolbar.
 *
 * Sub-components live in ./settings/:
 *   TabButton, ToolRow, ProviderCard, Field, AgentConfigTab, AppearanceTab
 * Shared styles in ./settings/styles.js
 */
export default function SettingsModal() {
  const {
    settingsOpen, closeSettings,
    toolCatalog, toolStatus, refreshToolStatus,
    providerConfigs, updateProviderConfig,
    customProviders, addCustomProvider, updateCustomProvider, removeCustomProvider,
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
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerIcon}>⚙</span>
            <span style={styles.headerTitle}>设置</span>
          </div>
          <button style={styles.closeBtn} onClick={closeSettings} title="关闭 (Esc)">×</button>
        </div>

        {/* Tabs */}
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

        {/* Body */}
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

              {/* Custom endpoint section */}
              {Object.values(customProviders).length > 0 && (
                <div style={{ marginTop: 8, marginBottom: 4, fontSize: 10, color: '#444', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Custom Anthropic Endpoints
                </div>
              )}
              {Object.values(customProviders).map((cp) => (
                <CustomProviderCard
                  key={cp.id}
                  provider={cp}
                  onUpdate={(patch) => updateCustomProvider(cp.id, patch)}
                  onRemove={() => removeCustomProvider(cp.id)}
                />
              ))}

              {/* Add custom endpoint button */}
              <button
                onClick={() => {
                  addCustomProvider({
                    name: 'New Endpoint',
                    baseUrl: '',
                    apiKey: '',
                    color: PRESET_COLORS[Object.keys(customProviders).length % PRESET_COLORS.length],
                    opusModel: '',
                    sonnetModel: '',
                    haikuModel: '',
                  });
                }}
                style={{
                  background: '#151510',
                  border: '1px dashed #3a3a1a',
                  borderRadius: 7,
                  color: '#8a8a44',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'system-ui',
                  fontWeight: 500,
                  width: '100%',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 8,
                  transition: 'all 0.15s',
                }}
                title="Add a custom Anthropic-format API endpoint"
              >
                <span style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  border: '1px dashed #555',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  flexShrink: 0,
                }}>+</span>
                Add Custom Anthropic Endpoint
              </button>
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
              {/* ── Section 1: Product identity ── */}
              <div style={styles.aboutIdentity}>
                <ZhiShuLogo size={56} />
                <div style={styles.aboutProductName}>智枢 ZhiShu</div>
                <div style={styles.aboutProductEn}>AI Terminal Manager</div>
                <div style={styles.aboutVersionBadge}>v{version}</div>
                <div style={styles.aboutSlogan}>One interface. Every AI, in focus.</div>
              </div>

              {/* ── Section 2: Product narrative ── */}
              <div>
                <div style={styles.aboutSectionTitle}>为什么是智枢</div>
                <div style={styles.aboutNarrativePlaceholder}>
                  <p style={{ margin: '0 0 6px' }}>AI 编程工具正在碎片化——每款 CLI 独占一个窗口、一套配置、一套上下文。</p>
                  <p style={{ margin: '0 0 6px' }}>智枢把 Claude Code、Codex、Gemini 等 8 款工具收进同一台终端指挥台，</p>
                  <p style={{ margin: 0 }}>统一启停、监控状态、持久化上下文，适合同时驾驭多个 AI Agent 的独立开发者。</p>
                </div>
              </div>

              {/* ── Section 3: Core capabilities 2×2 ── */}
              <div>
                <div style={styles.aboutSectionTitle}>核心能力</div>
                <div style={styles.aboutCapGrid}>
                  {[
                    { icon: '🎯', title: '统一指挥台', desc: '8 款 AI CLI 在单一窗口内启动、切换、关闭' },
                    { icon: '⚡', title: '热切换 Provider', desc: '注入环境变量，无需关闭终端即可换用另一款 AI' },
                    { icon: '📡', title: '静默感知通知', desc: 'AI 输出停止 3 秒自动提醒，漏消息和误扰同时消除' },
                    { icon: '💾', title: '终端状态恢复', desc: '重启后自动加载上次终端缓冲，上下文不丢失' },
                  ].map(({ icon, title, desc }) => (
                    <div key={title} style={styles.aboutCapCard}>
                      <div style={styles.aboutCapCardHeader}>
                        <span style={styles.aboutCapIcon}>{icon}</span>
                        <span style={styles.aboutCapTitle}>{title}</span>
                      </div>
                      <div style={styles.aboutCapDesc}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Section 4: Tech stack + open source ── */}
              <div>
                <div style={styles.aboutSectionTitle}>技术栈 · 开源</div>
                <div style={styles.aboutTagsRow}>
                  {['Electron 31', 'React 18', 'xterm.js', 'node-pty', 'Zustand', 'MIT'].map((tag) => (
                    <span key={tag} style={styles.aboutTag}>{tag}</span>
                  ))}
                </div>
                <div style={styles.aboutGithubRow}>
                  <a
                    href="https://github.com/Xuuuuu04/ai-terminal-manager"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.aboutGithubBtn}
                    onClick={(e) => {
                      e.preventDefault();
                      window.electronAPI?.openExternal?.('https://github.com/Xuuuuu04/ai-terminal-manager');
                    }}
                  >
                    ⭐ GitHub
                  </a>
                  <span style={styles.aboutLicense}>MIT License</span>
                </div>
              </div>

              {/* ── Section 5: Author ── */}
              <div>
                <div style={styles.aboutSectionTitle}>作者</div>
                <div style={styles.aboutAuthorName}>{author}</div>
                <div style={styles.aboutAuthorSub}>
                  {/* TODO: 社交链接占位 — 待创意策划师补充 */}
                  社交链接 · 联系方式 · 待补充
                </div>
              </div>

              {/* ── Section 6: Version history ── */}
              <div>
                <div style={styles.aboutSectionTitle}>版本历史</div>
                <div style={styles.aboutChangelogList}>
                  {CHANGELOG.map((item) => (
                    <div key={item.version} style={styles.aboutChangelogItem}>
                      <span style={styles.aboutChangelogVersion}>{item.version}</span>
                      <span style={styles.aboutChangelogDate}>{item.date}</span>
                      <span style={styles.aboutChangelogSummary}>{item.summary}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

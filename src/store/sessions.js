import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
const {
  hasSessionId,
  resolveProjects,
  resolveTheme,
  resolveActiveSessionId,
  removeSessionFromProjects,
  removeProjectFromProjects,
  getFallbackActiveSessionId,
} = require('./sessionState');

// ─── Default config ──────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  projects: [
    {
      id: uuidv4(),
      name: '示例项目',
      path: '~',
      sessions: [
        { id: uuidv4(), name: '主会话', createdAt: Date.now() },
      ],
    },
  ],
};

// ─── Built-in project templates ──────────────────────────────────────────────
//
// Each template defines:
//   • A list of sessions to create (with friendly names)
//   • A list of memory files to write into the project directory
//
// Memory files cover the per-tool conventions:
//   CLAUDE.md  → Claude Code
//   AGENTS.md  → Codex + OpenCode (shared)
//   GEMINI.md  → Gemini CLI
//   QWEN.md    → Qwen Code

const COMMON_MEMORY = (projectName, focus) => `# ${projectName}

> ${focus}

## 项目背景

<!-- 简要描述这个项目是做什么的 -->

## 技术栈

<!-- 列出主要技术、框架、依赖 -->

## 代码风格约定

- 使用清晰的命名
- 优先 KISS / YAGNI / DRY 原则
- 添加必要的注释，解释 "why" 而不是 "what"

## 重要文件 / 模块

<!-- 列出关键文件和它们的职责 -->

## 常用命令

\`\`\`bash
# 启动开发
# 运行测试
# 构建
\`\`\`

## 已知约束

<!-- 不要触碰的文件、API 限制、安全要求等 -->
`;

export const PROJECT_TEMPLATES = [
  {
    id: 'blank',
    name: '空项目',
    icon: '◇',
    description: '只创建一个会话，不写入任何文件',
    sessions: [{ name: '主会话' }],
    memoryFiles: [],
  },
  {
    id: 'single-claude',
    name: 'Claude 单会话',
    icon: '◆',
    description: '一个 Claude 会话 + 预填的 CLAUDE.md 项目说明',
    sessions: [{ name: 'Claude' }],
    memoryFiles: [
      { path: 'CLAUDE.md', content: (n) => COMMON_MEMORY(n, 'Claude Code 项目级配置') },
    ],
  },
  {
    id: 'fullstack',
    name: '全栈开发',
    icon: '⬢',
    description: 'Frontend + Backend 两个会话，分别推荐 Claude 和 Codex',
    sessions: [
      { name: 'Frontend' },
      { name: 'Backend' },
    ],
    memoryFiles: [
      {
        path: 'CLAUDE.md',
        content: (n) => `# ${n}\n\n> 全栈 Web 项目 — 前后端分离\n\n## 项目结构\n\n- \`frontend/\` — React/Vue 前端\n- \`backend/\` — API 服务\n- \`shared/\` — 共享类型/工具\n\n## 开发流程\n\n1. 后端先定义 API contract\n2. 前端基于 mock 开发\n3. 联调阶段补真实接口\n\n## 代码风格\n\n- TypeScript 严格模式\n- ESLint + Prettier\n- 提交前必须通过 lint 和测试\n`,
      },
      {
        path: 'AGENTS.md',
        content: (n) => `# ${n}\n\n> Codex / OpenCode 共享配置\n\n## 项目概览\n\n全栈 Web 项目，前后端分离架构。\n\n## 目录结构\n\n\`\`\`\nfrontend/   # 前端代码\nbackend/    # 后端代码\nshared/     # 共享类型\n\`\`\`\n\n## 编码约定\n\n- 函数/变量使用 camelCase\n- 类/组件使用 PascalCase\n- 常量使用 UPPER_SNAKE_CASE\n`,
      },
    ],
  },
  {
    id: 'multi-ai',
    name: '多 AI 对比',
    icon: '⬡',
    description: '同时打开 Claude / Gemini / Codex 三个会话用于对比',
    sessions: [
      { name: 'Claude' },
      { name: 'Gemini' },
      { name: 'Codex' },
    ],
    memoryFiles: [
      { path: 'CLAUDE.md', content: (n) => COMMON_MEMORY(n, 'Claude Code 配置') },
      { path: 'GEMINI.md', content: (n) => COMMON_MEMORY(n, 'Gemini CLI 配置') },
      { path: 'AGENTS.md', content: (n) => COMMON_MEMORY(n, 'Codex / OpenCode 配置') },
      { path: 'QWEN.md',   content: (n) => COMMON_MEMORY(n, 'Qwen Code 配置') },
    ],
  },
];

// ─── Store ───────────────────────────────────────────────────────────────────

export const useSessionStore = create((set, get) => ({
  projects: [],
  activeSessionId: null,
  isLoading: true,
  yoloMode: false,               // Global: YOLO/skip-permissions toggle
  notificationsEnabled: true,    // Global: desktop notifications on completion
  alwaysOnTop: false,            // Window always-on-top state
  autoRestoreSessions: true,     // Auto-resume each session's last AI tool on startup
  // Real-time process status: sessionId -> { tool, label, startedAt, lastRanTool, lastDuration }
  sessionStatus: {},

  // Global clock tick — updated every 5s by App-level interval.
  // Consumed by Sidebar SessionRow and TerminalView for elapsed-time displays.
  // Single source of truth replaces N per-component 1s intervals.
  now: Date.now(),
  tickNow: () => set({ now: Date.now() }),

  // Tool catalog fetched from main process (never hardcoded in renderer)
  toolCatalog: { tools: {}, providers: {} },
  // Installation status: toolId -> { installed, version }
  toolStatus: {},

  // Provider configs (API keys etc.) — user overrides merged with defaults
  // Schema: { glm: { apiKey, baseUrl, opusModel, sonnetModel, haikuModel }, ... }
  providerConfigs: {},

  // Settings modal open state
  settingsOpen: false,

  // File tree drawer (right side panel)
  fileTreeOpen: false,
  // Git panel drawer (right side panel — mutex with file tree)
  gitPanelOpen: false,
  // UI theme: 'dark' | 'light'
  theme: 'dark',
  // Sidebar width — user-resizable via the resizer handle on its right edge
  sidebarWidth: 236,

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  init: async () => {
    try {
      const config = await window.electronAPI.loadConfig();
      let catalog = { tools: {}, providers: {} };
      try {
        catalog = await window.electronAPI.getToolCatalog();
      } catch (e) {
        console.error('getToolCatalog failed:', e);
      }

      const projects = resolveProjects(config.projects, DEFAULT_CONFIG.projects);
      const activeSessionId = resolveActiveSessionId(projects, config.activeSessionId);
      const theme = resolveTheme(config.theme);
      document.documentElement.setAttribute('data-theme', theme);

      set({
        projects,
        activeSessionId,
        yoloMode: config.yoloMode || false,
        notificationsEnabled: config.notificationsEnabled !== false,
        autoRestoreSessions: config.autoRestoreSessions !== false,  // default true
        providerConfigs: config.providerConfigs || {},
        toolCatalog: catalog || { tools: {}, providers: {} },
        theme,
        sidebarWidth: config.sidebarWidth || 236,
        isLoading: false,
      });

      // Sync initial prefs and session names to main process
      window.electronAPI.setNotificationsEnabled(config.notificationsEnabled !== false);
      get().syncSessionNamesToMain();

      // Probe installed tools in the background — UI reacts once resolved
      get().refreshToolStatus();
    } catch (e) {
      console.error('init failed:', e);
      set({
        projects: DEFAULT_CONFIG.projects,
        activeSessionId: resolveActiveSessionId(DEFAULT_CONFIG.projects, null),
        isLoading: false,
      });
    }
  },

  persist: () => {
    const {
      projects,
      activeSessionId,
      yoloMode,
      notificationsEnabled,
      providerConfigs,
      theme,
      sidebarWidth,
      autoRestoreSessions,
    } = get();
    window.electronAPI.saveConfig({
      projects,
      activeSessionId: resolveActiveSessionId(projects, activeSessionId),
      yoloMode,
      notificationsEnabled,
      providerConfigs,
      theme, sidebarWidth, autoRestoreSessions,
    });
  },

  toggleAutoRestoreSessions: () => {
    set((s) => ({ autoRestoreSessions: !s.autoRestoreSessions }));
    get().persist();
  },

  setSidebarWidth: (width) => {
    // Clamp to sensible bounds
    const clamped = Math.max(180, Math.min(420, width));
    set({ sidebarWidth: clamped });
  },

  // Persist after the user finishes dragging (not on every mouse move)
  commitSidebarWidth: () => get().persist(),

  // ── Tool installation status ──────────────────────────────────────────
  refreshToolStatus: async () => {
    try {
      const status = await window.electronAPI.checkAllTools();
      set({ toolStatus: status || {} });
    } catch (e) {
      console.error('refreshToolStatus failed:', e);
    }
  },

  // ── Provider config CRUD ──────────────────────────────────────────────
  updateProviderConfig: (providerId, patch) => {
    set((s) => ({
      providerConfigs: {
        ...s.providerConfigs,
        [providerId]: { ...(s.providerConfigs[providerId] || {}), ...patch },
      },
    }));
    get().persist();
  },

  // Merge persisted user override with catalog defaults (read-only view)
  getEffectiveProvider: (providerId) => {
    const { toolCatalog, providerConfigs } = get();
    const def = toolCatalog.providers?.[providerId];
    if (!def) return null;
    const userCfg = providerConfigs[providerId] || {};
    return {
      ...def,
      config: {
        apiKey: userCfg.apiKey || '',
        baseUrl: userCfg.baseUrl || def.defaults.baseUrl,
        opusModel: userCfg.opusModel || def.defaults.opusModel,
        sonnetModel: userCfg.sonnetModel || def.defaults.sonnetModel,
        haikuModel: userCfg.haikuModel || def.defaults.haikuModel,
      },
    };
  },

  // ── Window controls ───────────────────────────────────────────────────
  toggleAlwaysOnTop: async () => {
    const next = await window.electronAPI.toggleAlwaysOnTop();
    set({ alwaysOnTop: next });
  },

  // ── Settings modal ────────────────────────────────────────────────────
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  // ── File tree drawer ──────────────────────────────────────────────────
  // File tree and git panel are MUTEX — opening one closes the other
  toggleFileTree: () => set((s) => ({
    fileTreeOpen: !s.fileTreeOpen,
    gitPanelOpen: false,
  })),
  closeFileTree: () => set({ fileTreeOpen: false }),

  // ── Git panel drawer ──────────────────────────────────────────────────
  toggleGitPanel: () => set((s) => ({
    gitPanelOpen: !s.gitPanelOpen,
    fileTreeOpen: false,
  })),
  closeGitPanel: () => set({ gitPanelOpen: false }),

  // ── Theme ─────────────────────────────────────────────────────────────
  setTheme: (theme) => {
    const nextTheme = resolveTheme(theme);
    set({ theme: nextTheme });
    document.documentElement.setAttribute('data-theme', nextTheme);
    get().persist();
  },

  toggleYoloMode: () => {
    set((s) => ({ yoloMode: !s.yoloMode }));
    get().persist();
  },

  toggleNotifications: () => {
    const next = !get().notificationsEnabled;
    set({ notificationsEnabled: next });
    window.electronAPI.setNotificationsEnabled(next);
    get().persist();
  },

  // Push the friendly-name map to main so notifications can use real names
  syncSessionNamesToMain: () => {
    const { projects } = get();
    const names = {};
    for (const p of projects) {
      for (const s of p.sessions) {
        names[s.id] = `${p.name} / ${s.name}`;
      }
    }
    window.electronAPI.updateSessionNames(names);
  },

  // Called from App on receiving a session:status IPC event.
  // Also stamps the session's `lastTool` field whenever an AI tool is detected,
  // so the auto-restore logic on next launch knows which `--continue` to run.
  updateSessionStatus: (sessionId, status) => {
    set((s) => {
      const newStatus = { ...s.sessionStatus, [sessionId]: status };

      // If a tool is currently running, persist it as this session's lastTool
      const newToolId = status?.tool || status?.lastRanTool;
      if (newToolId) {
        const newProjects = s.projects.map((p) => ({
          ...p,
          sessions: p.sessions.map((sess) =>
            sess.id === sessionId && sess.lastTool !== newToolId
              ? { ...sess, lastTool: newToolId, lastToolUpdatedAt: Date.now() }
              : sess
          ),
        }));
        // Schedule a persist (debounced — fire-and-forget)
        setTimeout(() => get().persist(), 0);
        return { sessionStatus: newStatus, projects: newProjects };
      }
      return { sessionStatus: newStatus };
    });
  },

  // ── Prompt dialog (in-app replacement for window.prompt) ─────────────────
  // window.prompt() is disabled in Electron renderers, so we use a custom modal
  // backed by a Promise. Usage:
  //   const value = await useSessionStore.getState().showPrompt({ title, defaultValue });
  //   if (value === null) return; // user cancelled
  promptDialog: null,
  showPrompt: ({ title, defaultValue = '', placeholder = '', confirmLabel = '确定' }) => {
    return new Promise((resolve) => {
      set({
        promptDialog: {
          title, defaultValue, placeholder, confirmLabel,
          onConfirm: (value) => {
            set({ promptDialog: null });
            resolve(value);
          },
          onCancel: () => {
            set({ promptDialog: null });
            resolve(null);
          },
        },
      });
    });
  },

  // ── Toast notifications (in-app, right side) ─────────────────────────────
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  // ── Project CRUD ──────────────────────────────────────────────────────────

  addProject: (name, path) => {
    const newSession = { id: uuidv4(), name: '主会话', createdAt: Date.now() };
    const project = { id: uuidv4(), name, path, sessions: [newSession] };
    set((s) => ({ projects: [...s.projects, project], activeSessionId: newSession.id }));
    get().persist();
    get().syncSessionNamesToMain();
    return project;
  },

  // Create a project from a built-in template:
  //   1. Build sessions from template.sessions
  //   2. Write each memoryFile to disk under projectPath
  //   3. Add the project to the store
  createProjectFromTemplate: async (templateId, projectPath, projectName) => {
    const template = PROJECT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return null;

    const name = projectName || projectPath.split('/').pop() || '新项目';

    // Write all memory files in parallel
    const writePromises = template.memoryFiles.map(({ path: relPath, content }) => {
      const fullPath = `${projectPath}/${relPath}`;
      const text = typeof content === 'function' ? content(name) : content;
      return window.electronAPI.writeFile(fullPath, text);
    });
    await Promise.all(writePromises);

    // Build sessions from template
    const sessions = template.sessions.map((s) => ({
      id: uuidv4(),
      name: s.name,
      createdAt: Date.now(),
    }));

    const project = { id: uuidv4(), name, path: projectPath, sessions };

    set((s) => ({
      projects: [...s.projects, project],
      activeSessionId: sessions[0]?.id || s.activeSessionId,
    }));
    get().persist();
    get().syncSessionNamesToMain();
    return project;
  },

  removeProject: (projectId) => {
    const project = get().projects.find((p) => p.id === projectId);
    // Clean up pty + status for every session in this project
    project?.sessions.forEach((s) => {
      window.electronAPI.killPty(s.id);
      window.electronAPI.cleanupSession(s.id);
    });

    set((s) => {
      const nextProjects = removeProjectFromProjects(s.projects, projectId);
      const removedIds = project?.sessions.map((session) => session.id) || [];
      const removedSet = new Set(removedIds);
      const nextStatus = Object.fromEntries(
        Object.entries(s.sessionStatus).filter(([sessionId]) => !removedSet.has(sessionId))
      );
      return {
        projects: nextProjects,
        activeSessionId: getFallbackActiveSessionId(nextProjects, removedIds, s.activeSessionId),
        sessionStatus: nextStatus,
        toasts: s.toasts.filter((toast) => !toast.sessionId || !removedSet.has(toast.sessionId)),
      };
    });
    get().persist();
    get().syncSessionNamesToMain();
  },

  renameProject: (projectId, name) => {
    set((s) => ({
      projects: s.projects.map((p) => (p.id === projectId ? { ...p, name } : p)),
    }));
    get().persist();
    get().syncSessionNamesToMain();
  },

  updateProjectPath: (projectId, path) => {
    set((s) => ({
      projects: s.projects.map((p) => (p.id === projectId ? { ...p, path } : p)),
    }));
    get().persist();
  },

  // ── Session CRUD ──────────────────────────────────────────────────────────

  addSession: (projectId, name) => {
    const session = { id: uuidv4(), name: name || '新会话', createdAt: Date.now() };
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, sessions: [...p.sessions, session] } : p
      ),
      activeSessionId: session.id,
    }));
    get().persist();
    get().syncSessionNamesToMain();
    return session;
  },

  removeSession: (projectId, sessionId) => {
    set((s) => {
      const nextProjects = removeSessionFromProjects(s.projects, projectId, sessionId);
      const newActive = getFallbackActiveSessionId(nextProjects, [sessionId], s.activeSessionId);

      // Strip the sessionStatus entry for the removed session
      const newStatus = { ...s.sessionStatus };
      delete newStatus[sessionId];

      return {
        projects: nextProjects,
        activeSessionId: newActive,
        sessionStatus: newStatus,
        toasts: s.toasts.filter((toast) => toast.sessionId !== sessionId),
      };
    });
    // Kill the pty process AND tell main to drop its monitoring state
    window.electronAPI.killPty(sessionId);
    window.electronAPI.cleanupSession(sessionId);
    get().persist();
    get().syncSessionNamesToMain();
  },

  renameSession: (projectId, sessionId, name) => {
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              sessions: p.sessions.map((ss) => (ss.id === sessionId ? { ...ss, name } : ss)),
            }
          : p
      ),
    }));
    get().persist();
    get().syncSessionNamesToMain();
  },

  setActiveSession: (sessionId) => {
    if (hasSessionId(get().projects, sessionId)) {
      set({ activeSessionId: sessionId });
    }
  },

  // ── Keyboard-shortcut helpers ─────────────────────────────────────────
  // Cmd+T → add a session to the project that owns the currently-active session
  addSessionToActiveProject: () => {
    const active = get().getActiveSession();
    if (active) {
      get().addSession(active.project.id);
    } else if (get().projects.length > 0) {
      get().addSession(get().projects[0].id);
    }
  },

  // Cmd+W → close the currently-active session
  closeActiveSession: () => {
    const active = get().getActiveSession();
    if (!active) return;
    get().removeSession(active.project.id, active.session.id);
  },

  // Cmd+1..9 → jump to the Nth session across ALL projects (flattened order)
  setSessionByIndex: (index) => {
    const flat = [];
    for (const p of get().projects) {
      for (const s of p.sessions) flat.push(s.id);
    }
    if (flat[index]) set({ activeSessionId: flat[index] });
  },

  // ── Helpers ───────────────────────────────────────────────────────────────

  getActiveProject: () => {
    const { projects, activeSessionId } = get();
    return projects.find((p) => p.sessions.some((s) => s.id === activeSessionId));
  },

  getActiveSession: () => {
    const { projects, activeSessionId } = get();
    for (const p of projects) {
      const s = p.sessions.find((s) => s.id === activeSessionId);
      if (s) return { session: s, project: p };
    }
    return null;
  },
}));

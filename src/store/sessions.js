import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  hasSessionId,
  resolveProjects,
  resolveTheme,
  resolveActiveSessionId,
  removeSessionFromProjects,
  removeProjectFromProjects,
  reorderProjectsInList,
  reorderSessionsInProject,
  getFallbackActiveSessionId,
  resolveGroups,
  ensureUngrouped,
} from './sessionState';

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

  // Custom Anthropic-format endpoint providers (user-defined)
  // Schema: { 'custom-xxx': { id, name, baseUrl, apiKey, opusModel, sonnetModel, haikuModel, color } }
  customProviders: {},

  // Settings modal open state
  settingsOpen: false,

  // File tree drawer (right side panel)
  fileTreeOpen: false,
  // Git panel drawer (right side panel)
  gitPanelOpen: false,
  // File preview panel — independent open state
  previewPanelOpen: false,
  // File currently shown in the preview panel: { path, name } | null
  filePreview: null,
  // Preview panel width — persisted
  previewPanelWidth: 360,
  // UI theme: 'dark' | 'light'
  theme: 'dark',
  // Sidebar width — user-resizable via the resizer handle on its right edge
  sidebarWidth: 236,
  // Panel widths — user-resizable via the resizer handle on each panel's left edge
  gitPanelWidth: 320,
  fileTreeWidth: 300,

  // Split pane state: null when no split, object when active
  // { sessionId, direction: 'horizontal'|'vertical', ratio: 0.5 }
  // NOT persisted — transient workspace arrangement
  splitPane: null,

  // ── TODO panel ────────────────────────────────────────────────────────────
  todoPanelOpen: false,
  todoPanelWidth: 300,
  // todos: [{ id, text, done, priority, createdAt, doneAt, dueDate, projectId, status }]
  todos: [],
  // YYYY-MM-DD of the last day the daily-review reminder was shown, to avoid repeat toasts
  todoLastReminderDate: null,
  // Currently selected AI provider ID for the TODO chat panel
  todoChatProvider: null,
  // TODO panel focus: which project's todos to show (null = show all)
  todoFocusProjectId: null,

  // ── Command Palette ──────────────────────────────────────────────────────
  commandPaletteOpen: false,

  // ── System resources (CPU / Memory / Battery) ───────────────────────────
  // Updated every 1.5s via IPC push from main process resourceMonitor.
  systemResources: null,

  // Group system: project folders for organizing projects
  // groups: [{ id, name, color?, system?, collapsed? }]
  groups: [{ id: 'ungrouped', name: '未分组', system: true }],

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

      // Resolve groups from config, ensuring "ungrouped" is always present
      const groups = resolveGroups(config.groups);
      let todos = config.todos || [];

      // ── Data migration: add projectId + status to legacy todos ──────────
      const validProjectIds = new Set((projects || []).map((p) => p.id));
      todos = todos.map((t) => ({
        ...t,
        projectId: t.projectId ?? null,
        status: t.status ?? (t.done ? 'done' : 'todo'),
      }));
      // Orphan cleanup: todos referencing deleted projects -> null (global)
      todos.forEach((t) => {
        if (t.projectId && !validProjectIds.has(t.projectId)) {
          t.projectId = null;
        }
      });

      const todoLastReminderDate = config.todoLastReminderDate || null;
      const todoChatProvider = config.todoChatProvider || null;
      const todoFocusProjectId = config.todoFocusProjectId || null;

      set({
        projects,
        activeSessionId,
        yoloMode: config.yoloMode || false,
        notificationsEnabled: config.notificationsEnabled !== false,
        autoRestoreSessions: config.autoRestoreSessions !== false,  // default true
        providerConfigs: config.providerConfigs || {},
        customProviders: config.customProviders || {},
        toolCatalog: catalog || { tools: {}, providers: {} },
        theme,
        sidebarWidth: config.sidebarWidth || 236,
        gitPanelWidth: config.gitPanelWidth || 320,
        fileTreeWidth: config.fileTreeWidth || 300,
        previewPanelWidth: config.previewPanelWidth || 360,
        todoPanelWidth: config.todoPanelWidth || 300,
        groups,
        todos,
        todoLastReminderDate,
        todoChatProvider,
        todoFocusProjectId,
        isLoading: false,
      });

      // Daily review: auto-open TODO panel once per day if there are pending items
      const today = new Date().toISOString().slice(0, 10);
      const pendingTodos = todos.filter((t) => !t.done);
      if (pendingTodos.length > 0 && todoLastReminderDate !== today) {
        setTimeout(() => {
          set({ todoPanelOpen: true });
          get().markTodoReminderShown();
        }, 1800);
      }

      // Sync initial prefs and session names to main process
      window.electronAPI.setNotificationsEnabled(config.notificationsEnabled !== false);
      get().syncSessionNamesToMain();

      // Subscribe to system resource updates (CPU, memory, battery)
      window.electronAPI.onSystemResources((data) => {
        get().updateSystemResources(data);
      });

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
      customProviders,
      theme,
      sidebarWidth,
      gitPanelWidth,
      fileTreeWidth,
      previewPanelWidth,
      todoPanelWidth,
      autoRestoreSessions,
      groups,
      todos,
      todoLastReminderDate,
      todoChatProvider,
      todoFocusProjectId,
    } = get();
    window.electronAPI.saveConfig({
      projects,
      activeSessionId: resolveActiveSessionId(projects, activeSessionId),
      yoloMode,
      notificationsEnabled,
      providerConfigs,
      customProviders,
      theme, sidebarWidth, gitPanelWidth, fileTreeWidth, previewPanelWidth,
      todoPanelWidth, autoRestoreSessions,
      groups,
      todos,
      todoLastReminderDate,
      todoChatProvider,
      todoFocusProjectId,
    });
  },

  toggleAutoRestoreSessions: () => {
    set((s) => ({ autoRestoreSessions: !s.autoRestoreSessions }));
    get().persist();
  },

  setSidebarWidth: (width) => {
    // Clamp to sensible bounds, including a 30vw responsive cap
    const viewMax = typeof window !== 'undefined' ? window.innerWidth * 0.3 : 420;
    const clamped = Math.max(180, Math.min(420, viewMax, width));
    set({ sidebarWidth: clamped });
  },

  // Persist after the user finishes dragging (not on every mouse move)
  commitSidebarWidth: () => get().persist(),

  // Panel (Git / FileTree / Preview / Todo) width resize
  setPanelWidth: (panelType, width) => {
    if (panelType === 'git') {
      const clamped = Math.max(250, Math.min(500, width));
      set({ gitPanelWidth: clamped });
    } else if (panelType === 'preview') {
      const clamped = Math.max(280, Math.min(720, width));
      set({ previewPanelWidth: clamped });
    } else if (panelType === 'todo') {
      const clamped = Math.max(260, Math.min(500, width));
      set({ todoPanelWidth: clamped });
    } else {
      const clamped = Math.max(250, Math.min(500, width));
      set({ fileTreeWidth: clamped });
    }
  },
  commitPanelWidth: () => get().persist(),

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
  // Also checks customProviders for user-defined Anthropic-format endpoints.
  getEffectiveProvider: (providerId) => {
    const { toolCatalog, providerConfigs, customProviders } = get();

    // 1. Built-in Provider
    const def = toolCatalog.providers?.[providerId];
    if (def) {
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
    }

    // 2. Custom Provider
    const custom = customProviders[providerId];
    if (custom) {
      return {
        id: custom.id,
        name: custom.name,
        baseTool: 'claude',
        configurable: true,
        config: {
          apiKey: custom.apiKey || '',
          baseUrl: custom.baseUrl,
          opusModel: custom.opusModel,
          sonnetModel: custom.sonnetModel,
          haikuModel: custom.haikuModel,
        },
      };
    }

    return null;
  },

  // ── Custom Provider CRUD ────────────────────────────────────────────────

  addCustomProvider: ({ name, baseUrl, apiKey, color, opusModel, sonnetModel, haikuModel }) => {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({
      customProviders: {
        ...s.customProviders,
        [id]: { id, name, baseUrl, apiKey, color, opusModel, sonnetModel, haikuModel },
      },
    }));
    get().persist();
    return id;
  },

  updateCustomProvider: (id, patch) => {
    set((s) => ({
      customProviders: {
        ...s.customProviders,
        [id]: { ...(s.customProviders[id] || {}), ...patch },
      },
    }));
    get().persist();
  },

  removeCustomProvider: (id) => {
    set((s) => {
      const { [id]: _, ...rest } = s.customProviders;
      return { customProviders: rest };
    });
    get().persist();
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
  toggleFileTree: () => set((s) => ({ fileTreeOpen: !s.fileTreeOpen })),
  closeFileTree: () => set({ fileTreeOpen: false }),

  // ── Git panel drawer ──────────────────────────────────────────────────
  toggleGitPanel: () => set((s) => ({ gitPanelOpen: !s.gitPanelOpen })),
  closeGitPanel: () => set({ gitPanelOpen: false }),

  // ── File preview panel ────────────────────────────────────────────────
  openFilePreview: (path, name) => set({ filePreview: { path, name }, previewPanelOpen: true }),
  closeFilePreview: () => set({ previewPanelOpen: false, filePreview: null }),
  togglePreviewPanel: () => set((s) => ({
    previewPanelOpen: !s.previewPanelOpen,
    // Intentionally do NOT clear filePreview on close — reopen should restore
    // last-viewed file. Explicit clear only via closeFilePreview().
  })),

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
        // Persist immediately — config.js uses synchronous atomic write
        // so this won't block the event loop. Eliminates the risk of
        // losing lastTool data on forced kill (setTimeout(fn,0) may not
        // fire before process termination).
        get().persist();
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

    // If a mergeKey is provided, check for an existing unexpired toast with the
    // same key.  When found, update its text to a merged summary instead of
    // creating a new toast.  This prevents N simultaneous completion events
    // from spawning N toasts.
    if (toast.mergeKey) {
      set((s) => {
        const existing = s.toasts.find((t) => t.mergeKey === toast.mergeKey);
        if (existing) {
          const batchCount = (existing.batchCount || 1) + 1;
          const updated = {
            ...existing,
            batchCount,
            sessionName: `${toast.sessionName} +${batchCount - 1} 个会话`,
            // Keep the most recent sessionId for click-to-navigate
            sessionId: toast.sessionId,
            // Update tool info to the latest completion
            tool: toast.tool,
            toolLabel: toast.toolLabel,
            duration: toast.duration,
          };
          return { toasts: s.toasts.map((t) => (t.id === existing.id ? updated : t)) };
        }
        // No existing toast with this mergeKey — create a new one
        return { toasts: [...s.toasts, { ...toast, id, batchCount: 1 }] };
      });
      return;
    }

    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
  },

  updateToastText: (id, newText) => {
    set((s) => ({
      toasts: s.toasts.map((t) =>
        t.id === id ? { ...t, sessionName: newText } : t
      ),
    }));
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  // ── Group CRUD ───────────────────────────────────────────────────────────

  createGroup: (name) => {
    const id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => {
      const groups = ensureUngrouped([...s.groups, { id, name }]);
      return { groups };
    });
    get().persist();
    return id;
  },

  removeGroup: (groupId) => {
    if (groupId === 'ungrouped') return; // Cannot remove the built-in group
    set((s) => {
      const groups = s.groups.filter((g) => g.id !== groupId);
      // Move all projects from this group back to ungrouped (null groupId)
      const projects = s.projects.map((p) =>
        p.groupId === groupId ? { ...p, groupId: null } : p
      );
      return { groups: ensureUngrouped(groups), projects };
    });
    get().persist();
  },

  renameGroup: (groupId, name) => {
    if (groupId === 'ungrouped') return; // Cannot rename the built-in group
    set((s) => ({
      groups: s.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
    }));
    get().persist();
  },

  moveProjectToGroup: (projectId, groupId) => {
    // groupId can be 'ungrouped' → store as null, or a real group id
    const resolvedGroupId = groupId === 'ungrouped' ? null : groupId;
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, groupId: resolvedGroupId } : p
      ),
    }));
    get().persist();
  },

  toggleGroupCollapsed: (groupId) => {
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId ? { ...g, collapsed: !g.collapsed } : g
      ),
    }));
    get().persist();
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
      // Orphan cleanup: move this project's todos to global (projectId = null)
      const nextTodos = s.todos.map((t) =>
        t.projectId === projectId ? { ...t, projectId: null } : t
      );
      return {
        projects: nextProjects,
        activeSessionId: getFallbackActiveSessionId(nextProjects, removedIds, s.activeSessionId),
        sessionStatus: nextStatus,
        toasts: s.toasts.filter((toast) => !toast.sessionId || !removedSet.has(toast.sessionId)),
        todos: nextTodos,
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

  reorderProjects: (fromIndex, toIndex) => {
    set((s) => ({
      projects: reorderProjectsInList(s.projects, fromIndex, toIndex),
    }));
    get().persist();
  },

  reorderSessions: (projectId, fromIndex, toIndex) => {
    set((s) => ({
      projects: reorderSessionsInProject(s.projects, projectId, fromIndex, toIndex),
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

      // Close split if either participant is removed
      let newSplitPane = s.splitPane;
      if (s.splitPane && (s.splitPane.sessionId === sessionId || s.activeSessionId === sessionId)) {
        newSplitPane = null;
      }

      return {
        projects: nextProjects,
        activeSessionId: newActive,
        sessionStatus: newStatus,
        splitPane: newSplitPane,
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

  // ── Split pane ────────────────────────────────────────────────────────────

  // Open a split with an existing session displayed alongside the active one.
  // direction: 'horizontal' (left-right) or 'vertical' (top-bottom)
  openSplit: (sessionId, direction = 'horizontal') => {
    const { activeSessionId, projects, splitPane } = get();
    // Cannot split with the same session as the active one
    if (!sessionId || sessionId === activeSessionId) return;
    // The session must exist
    if (!hasSessionId(projects, sessionId)) return;
    // If there is already a split, just replace the secondary
    set({
      splitPane: {
        sessionId,
        direction: splitPane?.direction || direction,
        ratio: splitPane?.ratio ?? 0.5,
      },
    });
  },

  // Close the split pane. The secondary session goes back into the termStack.
  closeSplit: () => {
    set({ splitPane: null });
  },

  // Update split ratio during drag (0.2–0.8 clamped)
  setSplitRatio: (ratio) => {
    const clamped = Math.max(0.2, Math.min(0.8, ratio));
    set((s) => {
      if (!s.splitPane) return {};
      return { splitPane: { ...s.splitPane, ratio: clamped } };
    });
  },

  // Swap primary and secondary sessions
  swapSplitSessions: () => {
    const { activeSessionId, splitPane } = get();
    if (!splitPane) return;
    const secondaryId = splitPane.sessionId;
    // Make the secondary the active (primary) and the current active the new secondary
    set({
      activeSessionId: secondaryId,
      splitPane: { ...splitPane, sessionId: activeSessionId },
    });
  },

  setActiveSession: (sessionId) => {
    if (hasSessionId(get().projects, sessionId)) {
      const { splitPane, activeSessionId } = get();
      // H2: If the new session is NOT one of the two split participants,
      // the user clicked on a third session in the Sidebar — close split.
      let nextSplitPane = splitPane;
      if (splitPane && sessionId !== activeSessionId && sessionId !== splitPane.sessionId) {
        nextSplitPane = null;
      }
      set({ activeSessionId: sessionId, splitPane: nextSplitPane });
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

  // ── TODO panel ────────────────────────────────────────────────────────────

  toggleTodoPanel: () => set((s) => ({ todoPanelOpen: !s.todoPanelOpen })),
  closeTodoPanel: () => set({ todoPanelOpen: false }),

  addTodo: (text, priority = 'none', dueDate = null, projectId = undefined) => {
    const id = `todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const resolvedProjectId = projectId !== undefined ? projectId : get().todoFocusProjectId;
    set((s) => ({
      todos: [...s.todos, {
        id, text, done: false, priority, createdAt: Date.now(), doneAt: null, dueDate,
        projectId: resolvedProjectId, status: 'todo',
      }],
    }));
    get().persist();
  },

  updateTodo: (id, updates) => {
    set((s) => ({
      todos: s.todos.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
    get().persist();
  },

  deleteTodo: (id) => {
    set((s) => ({ todos: s.todos.filter((t) => t.id !== id) }));
    get().persist();
  },

  toggleTodoDone: (id) => {
    set((s) => ({
      todos: s.todos.map((t) =>
        t.id === id
          ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null, status: !t.done ? 'done' : 'todo' }
          : t
      ),
    }));
    get().persist();
  },

  clearDoneTodos: () => {
    set((s) => ({ todos: s.todos.filter((t) => t.status !== 'done') }));
    get().persist();
  },

  markTodoReminderShown: () => {
    const today = new Date().toISOString().slice(0, 10);
    set({ todoLastReminderDate: today });
    get().persist();
  },

  setTodoChatProvider: (id) => {
    set({ todoChatProvider: id });
    get().persist();
  },

  setTodoStatus: (id, status) => {
    set((s) => ({
      todos: s.todos.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              done: status === 'done',
              doneAt: status === 'done' ? Date.now() : null,
            }
          : t
      ),
    }));
    get().persist();
  },

  setTodoFocusProject: (projectId) => {
    set({ todoFocusProjectId: projectId });
    get().persist();
  },

  // ── Command Palette ──────────────────────────────────────────────────────
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),

  // ── System resources ─────────────────────────────────────────────────────
  updateSystemResources: (data) => set({ systemResources: data }),

}));

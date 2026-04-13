# 智枢 ZhiShu - AI Terminal Manager

> 多 Agent AI 编程终端统一指挥台。在一个桌面应用内管理 Claude Code / Codex / Gemini CLI / Qwen / OpenCode / GLM / MiniMax / Kimi 等 8 款 AI CLI 工具。

**技术栈**: Electron 31 + React 18 + xterm.js (WebGL) + Zustand + node-pty
**平台**: macOS (当前唯一支持)
**协议**: MIT | **作者**: Xuuuuu04

---

## 架构总览

```mermaid
graph TB
    subgraph "Main Process (Node.js)"
        MW[BrowserWindow]
        PTY[node-pty<br/>进程管理]
        MON[Process Monitor<br/>1.5s BFS tick]
        GIT[Git Wrapper<br/>execFile]
        FS[FS Operations<br/>文件浏览/操作]
        CFG[Config Persistence<br/>~/.ai-terminal-manager.json]
        TRAY[Tray / Menu Bar<br/>驻留模式]
    end

    subgraph "IPC Bridge (contextIsolation)"
        PRE[preload.js<br/>白名单 API]
    end

    subgraph "Renderer Process (React)"
        ZS[Zustand Store<br/>全局状态]
        SB[Sidebar<br/>项目/会话树]
        TV[TerminalView<br/>xterm.js + WebGL]
        GP[GitPanel<br/>双模式 Git 管理]
        FTP[FileTreePanel<br/>文件浏览器]
        SM[SettingsModal<br/>Provider 配置]
        TS[ToastStack<br/>完成通知]
    end

    MW --> PRE
    PTY --> PRE
    MON --> PRE
    GIT --> PRE
    FS --> PRE
    PRE --> ZS
    ZS --> SB
    ZS --> TV
    ZS --> GP
    ZS --> FTP
    ZS --> SM
    ZS --> TS
```

## 模块索引

| 模块 | 路径 | 职责 | 详情 |
|------|------|------|------|
| **主进程** | `electron/` | pty 管理、进程监控、Git/FS 操作、Tray | [electron/CLAUDE.md](electron/CLAUDE.md) |
| **渲染进程** | `src/` | React UI、Zustand 状态管理、xterm.js 终端 | [src/CLAUDE.md](src/CLAUDE.md) |
| **CI/CD** | `.github/workflows/` | GitHub Actions：测试 + 原生模块重编译 + 桌面包包验证 | ci.yml |
| **构建资产** | `build-assets/` | SVG 图标源文件 → .icns | BUILD.md |
| **构建文档** | `BUILD.md` | 图标工作流、打包配置、Gatekeeper 绕过 | BUILD.md |

## 全局开发规范

### 进程边界
- **所有** pty / 文件系统 / git 操作必须在 Main 进程，Renderer 只通过 `window.electronAPI` (IPC) 调用
- `contextIsolation: true` + `nodeIntegration: false` — 不在 Renderer 中直接使用 Node.js API
- 新增 IPC handler 时必须在 `preload.js` 同步暴露

### 安全
- 命令执行一律用 `execFile`（参数数组），禁止 `exec` / `shell=True`（防 CWE-78）
- 文件路径不允许用户控制完整路径（`newName` 必须是 basename，防 CWE-22）
- Provider API Key 存储在 `~/.ai-terminal-manager.json`，不入 git

### 状态管理
- **唯一状态源**: `src/store/sessions.js` (Zustand store)
- 纯函数抽取到 `src/store/sessionState.js`（可独立测试）
- 持久化到 `~/.ai-terminal-manager.json`，通过 `persist()` 方法显式触发

### 进程监控状态机
```
not_started → idle_no_instruction → running → awaiting_review
     ↑              ↑                 ↑              │
     └──────────────┴─────────────────┴──────────────┘
```
- `not_started`: 无 AI 进程
- `idle_no_instruction`: AI 已启动，用户未发指令
- `running`: 用户已发指令，AI 正在输出（静默 < 3s）
- `awaiting_review`: AI 输出静默 > 3s → debounce 3.5s → 发通知

### Provider 系统
GLM / MiniMax / Kimi 复用 Claude 二进制 + 环境变量注入（`ANTHROPIC_BASE_URL`）：
- `sessionLaunchedTool` Map 区分 "声明意图" vs `ps` 检测结果
- POSIX 单引号转义：`'` → `'\''`
- Provider 配置合并：用户覆盖 (`providerConfigs`) + 目录默认值 (`PROVIDER_CATALOG.defaults`)

### 会话自动恢复
- 启动时读取每个 session 的 `lastTool` → 延迟 1.2s 注入 `--continue` 命令
- `autoRestoreSessions` 开关控制（默认开启）

### pty 生命周期
- React 18 strict mode 会 double-mount useEffect → `createPty` 必须 reuse 已有 pty
- 删除 session 时 `killPtyTree` 递归 SIGKILL 整个进程树（不只是 SIGHUP shell）
- `collectDescendants` 用同步 `execFileSync`（before-quit 不可 await）

### 测试
- 运行: `npm test`（Node.js 内置 test runner）
- 测试文件: `electron/gitStatus.test.js`, `src/store/sessionState.test.js`
- 仅纯函数可测（Main 进程的 pty/Git 依赖 Node.js 运行时，Renderer 依赖 DOM）

### 关键技术决策
1. **Electron 而非 Tauri**: node-pty 是 Node native addon，Tauri (Rust) 需重写整个 pty 层
2. **Zustand 而非 Redux**: 无 Provider / boilerplate，适合中等复杂度桌面应用
3. **`ps -axo` BFS 而非 pgrep 循环**: 单次快照 + 内存 BFS 比多次 shell-out 高效 10 倍
4. **通知 debounce 3.5s**: 避免 tool-call 暂停（1-3s）误触发完成通知
5. **ImageAddon 禁用**: xterm.js #4793 dispose race condition，等上游修复
6. **WebGL addon 单独 dispose**: 时序敏感，不走 AddonManager 批量 dispose

## 常用命令

```bash
npm start          # 开发模式 (React dev server + Electron)
npm test           # 运行测试
npm run package    # 生产构建 (.dmg/.zip/.app)
npm run verify:desktop  # 验证打包链路（不产完整安装包）
npm run rebuild-native  # 重编译 node-pty（Electron 版本更新后必须）
```

## 项目结构

```
ai-terminal-manager/
├── electron/
│   ├── main.js            # 应用入口：生命周期 + 窗口 + 模块组装（~190行）
│   ├── preload.js         # IPC 安全桥
│   ├── pty.js             # PTY 生命周期、共享状态、进程清理
│   ├── monitor.js         # 进程监控 FSM（1.5s BFS tick）
│   ├── git.js             # Git IPC handlers
│   ├── fs-handlers.js     # 文件系统 IPC handlers
│   ├── tray.js            # macOS 菜单栏驻留
│   ├── tools.js           # 工具目录 + 安装 IPC handlers
│   ├── config.js          # 配置持久化 + Keychain 迁移
│   ├── gitStatus.js       # git status --porcelain 解析器（纯函数）
│   ├── keychain.js        # macOS Keychain 集成
│   ├── pathValidator.js   # 文件路径验证
│   ├── gitStatus.test.js  # gitStatus 单元测试
│   ├── keychain.test.js   # keychain 单元测试
│   └── pathValidator.test.js  # pathValidator 单元测试
├── src/
│   ├── index.js           # 入口，字体导入，全局 CSS 变量
│   ├── App.jsx            # 根组件，快捷键，Toast/Modal 挂载
│   ├── store/
│   │   ├── sessions.js    # Zustand store（~596行）
│   │   ├── sessionState.js    # 纯函数抽取（可独立测试）
│   │   └── sessionState.test.js
│   ├── components/
│   │   ├── Sidebar.jsx        # 项目树 + 会话列表 + 统计
│   │   ├── TerminalView.jsx   # xterm 终端 + 工具栏 + 状态条
│   │   ├── GitPanel.jsx       # Git 管理（当前仓库 + 多仓库扫描）
│   │   ├── FileTreePanel.jsx  # 文件浏览器 + 拖拽到终端
│   │   ├── SettingsModal.jsx  # 设置窗口 (Provider/工具/主题)
│   │   ├── ContextMenu.jsx    # 通用右键菜单 (Portal 渲染)
│   │   ├── PromptDialog.jsx   # 自定义 prompt 对话框
│   │   ├── ToastStack.jsx     # 响应完成 toast
│   │   ├── ToolIcons.jsx      # 手绘 SVG 图标集
│   │   └── ErrorBoundary.jsx  # 渲染错误边界
│   └── utils/
│       └── sound.js       # Web Audio 合成提示音
├── .github/workflows/ci.yml
├── BUILD.md
├── README.md
├── package.json
└── build-assets/
    └── icon.svg            # 图标源文件
```

---

*Updated: 2026-04-13 -- main.js modular refactoring*

# electron/ - Main Process

> [← 返回根目录](../CLAUDE.md)

Electron 主进程模块。所有 pty、文件系统、git、进程监控、系统通知、Tray 驻留都在这里。

---

## 文件清单

| 文件 | 行数 | 职责 |
|------|------|------|
| `main.js` | ~1500 | 主进程核心：BrowserWindow、pty 生命周期、进程监控 FSM、IPC handlers、Git wrapper、FS 操作、Tray |
| `preload.js` | ~103 | contextBridge 白名单 API surface |
| `gitStatus.js` | ~88 | `git status --porcelain=v1 -b` 输出解析器（纯函数，无 I/O） |
| `gitStatus.test.js` | ~54 | gitStatus 单元测试 |

## 核心数据结构

### ptyProcesses: `Map<sessionId, ptyProcess>`
所有活跃的 node-pty 进程。key 是 UUID string。

### ptyMeta: `Map<sessionId, { lastOutputAt: number, hasUserInput: boolean }>`
- `lastOutputAt`: 最近一次 stdout 时间戳，用于检测 busy/idle 转换
- `hasUserInput`: 用户是否按过 Enter（区分"未指令" vs "待审查"）

### sessionStatus: `Map<sessionId, { tool, label, phase, startedAt, runningStartedAt, lastRanTool, lastDuration }>`
四态状态机输出。`phase ∈ { not_started, idle_no_instruction, running, awaiting_review }`

### sessionLaunchedTool: `Map<sessionId, { id, label }>`
声明意图：区分 GLM/MiniMax/Kimi（都 spawn 同一个 `claude` 二进制）。monitorTick 优先使用此值。

### notifyTimers: `Map<sessionId, setTimeout handle>`
debounce 通知定时器。running → awaiting_review 启动，3.5s 后确认仍 idle 才发通知。

## IPC Handler 分类

### PTY 生命周期
| Channel | 方向 | 说明 |
|---------|------|------|
| `pty:create` | invoke | 创建 pty（已有则 reuse，React 18 strict mode 兼容） |
| `pty:write` | send | 写入数据（同时检测 Enter → hasUserInput） |
| `pty:resize` | send | 调整终端尺寸 |
| `pty:kill` | send | killPtyTree（递归 SIGKILL） |
| `pty:launch` | send | 在 pty 中启动 AI 工具（声明 toolId） |
| `pty:insertText` | send | 插入文本（拖拽文件路径用） |
| `pty:data:{id}` | send (→renderer) | 终端输出 |
| `pty:exit:{id}` | send (→renderer) | 进程退出 |

### 进程监控
| Channel | 方向 | 说明 |
|---------|------|------|
| `session:status:{id}` | send (→renderer) | 状态变更广播 |
| `session:responseComplete` | send (→renderer) | AI 完成响应（debounce 后） |
| `session:updateNames` | send | 同步会话友好名 |
| `session:cleanup` | send | 清理会话状态 |

### Git
| Channel | 方向 | 说明 |
|---------|------|------|
| `git:status` | invoke | `git status --porcelain=v1 -b` |
| `git:branches` | invoke | `git branch -a` |
| `git:log` | invoke | `git log`（NUL 分隔自定义格式） |
| `git:fileDiff` | invoke | `git diff -- <path>` |
| `git:scanRepos` | invoke | 递归扫描所有 git 仓库（深度 4） |
| `git:runInSession` | send | 在 pty 中执行 git 命令 |

### 文件系统
| Channel | 方向 | 说明 |
|---------|------|------|
| `fs:listDir` | invoke | 懒加载目录列表 |
| `fs:readFilePreview` | invoke | 文件前 10KB 预览 |
| `fs:exists` | invoke | 文件存在检查 |
| `fs:writeFile` | invoke | 写文件（模板系统用） |
| `fs:trash` | invoke | 移到废纸篓 |
| `fs:rename` | invoke | 重命名（防路径遍历） |
| `fs:copy` | invoke | 递归复制 |
| `fs:move` | invoke | 移动（跨文件系统 fallback copy+delete） |
| `fs:zip` | invoke | 系统 zip 命令压缩 |
| `fs:newFile` / `fs:newFolder` | invoke | 创建空文件/目录 |
| `fs:convertHeic` | invoke | HEIC → PNG（sips） |
| `fs:normalizeImage` | invoke | 通用图片 → PNG |
| `fs:stat` | invoke | 文件元信息 |
| `fs:reveal` | invoke | Finder 显示 |
| `fs:openFile` | invoke | 默认应用打开 |

### 配置 / 工具 / 窗口
| Channel | 方向 | 说明 |
|---------|------|------|
| `config:load` / `config:save` | invoke | 持久化到 `~/.ai-terminal-manager.json` |
| `tools:catalog` | invoke | 返回 TOOL_CATALOG + PROVIDER_CATALOG |
| `tools:checkAll` | invoke | 并行检测所有工具安装状态 |
| `tools:installInSession` | send | 在 pty 中安装/升级工具 |
| `window:toggleAlwaysOnTop` | invoke | 窗口置顶 |
| `dialog:selectDir` | invoke | 目录选择对话框 |

## 关键常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `IDLE_SILENCE_MS` | 3000 | 输出静默阈值（超过此值认为 AI 停止输出） |
| `NOTIFY_DEBOUNCE_MS` | 3500 | 通知 debounce（确认仍 idle 才触发） |
| `CONFIG_PATH` | `~/.ai-terminal-manager.json` | 用户配置持久化路径 |
| Monitor interval | 1500ms | 进程扫描频率 |
| Scan max depth | 4 | Git 仓库递归扫描深度 |
| `IGNORED_DIRS` | node_modules, .git, dist, build... | 文件树/扫描忽略目录 |

## 依赖

- `electron` (^31.0.0) — BrowserWindow, IPC, Tray, Notification
- `node-pty` (^1.1.0) — 原生 PTY 绑定（延迟加载，app ready 后 require）
- Node.js 内置: `child_process` (execFile/execFileSync), `fs`, `path`, `os`

## 新增 IPC Handler 检查清单
1. 在 `main.js` 注册 `ipcMain.handle` 或 `ipcMain.on`
2. 在 `preload.js` 的 `contextBridge.exposeInMainWorld` 中暴露
3. 如果涉及 Renderer 调用，在组件中通过 `window.electronAPI.xxx` 使用
4. 安全审查：参数验证、路径遍历防护、无 shell 注入

---

*Auto-generated: 2026-04-13T23:18:53+08:00 by /init-project*

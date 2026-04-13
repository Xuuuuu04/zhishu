<div align="center">

# 智枢 · ZhiShu

### 多 Agent AI 编程终端 · The AI Hub Terminal

**在一个精心设计的黑色面板里，统一管理 Claude Code / Codex / Gemini CLI / Qwen / OpenCode / GLM / MiniMax / Kimi 等 8 款主流 AI 编程工具与 Provider**

<p>
  <img src="https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/xterm.js-WebGL-000000?logo=javascript&logoColor=white" />
  <img src="https://img.shields.io/badge/node--pty-native-339933?logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/platform-macOS-black?logo=apple&logoColor=white" />
  <img src="https://img.shields.io/badge/license-MIT-blue" />
</p>

<p>
  <strong>
    一键启动 · 进程监控 · 响应完成提醒 · 会话自动恢复 · Git 多仓库管理 · 文件拖拽 · Provider 热切换
  </strong>
</p>

</div>

---

## 目录

- [这是什么？](#这是什么)
- [为什么要做这个](#为什么要做这个)
- [核心特性一览](#核心特性一览)
- [快速开始](#快速开始)
- [功能深度讲解](#功能深度讲解)
  - [1. 多工具统一启动](#1-多工具统一启动)
  - [2. 四态会话生命周期](#2-四态会话生命周期)
  - [3. Provider 系统（GLM / MiniMax / Kimi）](#3-provider-系统glm--minimax--kimi)
  - [4. 自动恢复上次会话](#4-自动恢复上次会话)
  - [5. Git 多仓库管理](#5-git-多仓库管理)
  - [6. 文件浏览器 + 拖拽到终端](#6-文件浏览器--拖拽到终端)
  - [7. 项目模板（含 Memory File 预填）](#7-项目模板含-memory-file-预填)
  - [8. 键盘快捷键](#8-键盘快捷键)
- [架构设计](#架构设计)
- [项目结构](#项目结构)
- [开发指南](#开发指南)
- [常见问题（FAQ）](#常见问题faq)
- [Roadmap](#roadmap)
- [技术决策记录](#技术决策记录)
- [License](#license)

---

## 这是什么？

**智枢（ZhiShu）** 是一个基于 Electron + React + xterm.js 的桌面应用，目标是**替代在 iTerm2 里开无数个 tab 混乱管理多个 AI 编程助手**的痛苦。

你有没有过这种经历？

- 在 `frontend/` 目录开一个 tab 跑 Claude，`backend/` 再开一个 tab 跑 Gemini，又想对比一下 Codex 的输出，再开第三个 tab……
- 跑了一会回头找不到哪个 tab 对应哪个项目
- 某个任务跑完了你却没发现，它在那里干等了半小时
- 想切换到 GLM、MiniMax 或 Kimi 这种 Anthropic 兼容 Provider，还得记一堆 shell 函数

**智枢** 把这些全部解决。

---

## 为什么要做这个

现在每家 AI 公司都在卷 CLI 工具：
- Anthropic 的 **Claude Code**
- OpenAI 的 **Codex**
- Google 的 **Gemini CLI**
- 阿里的 **Qwen Code**
- 开源的 **OpenCode**
- 智谱 **GLM**、MiniMax、Kimi 等**Anthropic 兼容 Provider**

每个都很强，**但每个都只解决"自己和用户的一对一对话"这一件事**。现实中的开发者往往：

1. **同时用多个** — 不同任务选不同工具，Claude 做架构、Codex 做代码、Gemini 做调研
2. **在多个项目间切换** — monorepo、子项目、试验性分支
3. **需要长跑任务的后台化** — 让 Claude 重构一大块代码，开另一个 tab 跑别的事
4. **对比多个模型的输出** — 同一个问题问三个 AI 看谁更好

iTerm2 + tmux 能做，但**所有"项目↔会话↔工具↔状态"的组织都得靠人脑**。会话一多就混乱。

**智枢的定位**：做**AI Agent 的统一指挥台** —— 像空管塔台一样俯视所有会话的状态、进度、等待审查的任务。你一眼就知道 "Frontend 会话的 Claude 刚刚跑完，需要我 review；Backend 的 Codex 还在工作"。

---

## 核心特性一览

| 特性 | 描述 |
|---|---|
| **🧠 8 款 AI 工具一键启动** | Claude Code / Codex / Gemini CLI / Qwen Code / OpenCode / GLM / MiniMax / Kimi，点按钮即启动，无需记命令 |
| **🎯 四态会话生命周期监控** | `未启动 → 未指令 → 运行中 → 待审查`，每个状态都有视觉指示 |
| **🔔 智能响应完成通知** | 带 debounce 去抖的完成检测，不会被 AI 思考暂停误触发。完成时 Toast + 系统通知 + 双音提示音 |
| **🔄 会话自动恢复** | 应用重启后，每个会话自动执行该工具的 `--continue` 命令（`claude --continue` / `codex resume --last` / `gemini --resume latest`），无缝接续上次对话 |
| **🌐 Provider 系统** | 通过环境变量注入，让官方 Claude 二进制变身 GLM / MiniMax / Kimi Provider。设置窗口可视化配置 API Key，无需 shell 函数 |
| **📂 Git 多仓库管理** | 扫描父目录下所有 git 仓库，统一显示变更/ahead/behind 状态。单仓库可以切分支、暂存、commit、pull/push |
| **📁 智能文件浏览器** | 右侧抽屉式文件树，懒加载、git status 着色、右键菜单（新建/重命名/复制/压缩/删除）、**拖拽到终端自动插入路径** |
| **📋 项目模板** | 4 个内置模板，新建项目时自动创建会话布局 + 写入每个工具对应的 memory 文件（CLAUDE.md / AGENTS.md / GEMINI.md / QWEN.md）|
| **⚡ WebGL GPU 渲染** | xterm.js + WebglAddon GPU 加速，10 倍于 Canvas 的渲染性能，Unicode 11 宽字符支持 |
| **⌨️ 快捷键系统** | `Cmd+T` 新会话 / `Cmd+W` 关闭 / `Cmd+1~9` 切换 / `Cmd+F` 终端搜索 / `Shift+点击` 续接上次 |
| **🎨 手绘 SVG 图标系统** | 每个工具专属的手绘矢量图标 + 品牌色，完全自研无商标争议 |
| **📌 窗口置顶 + 菜单栏驻留** | 关闭窗口不退出，继续在 macOS 菜单栏显示运行/待审数量 |
| **🛡️ YOLO 模式** | 全局开关一键切换"正常确认"↔ "跳过所有权限"（`--dangerously-skip-permissions` 等），颜色警示 |

---

## 快速开始

### 前置要求

- **macOS**（Linux 和 Windows 可能需要小调整）
- **Node.js 18+**（推荐 20+）
- **Git**
- 至少装一个 AI CLI（应用内可以检测未安装的工具并一键安装）

### 安装

```bash
# Clone
git clone https://github.com/Xuuuuu04/zhishu.git
cd zhishu

# Install dependencies
npm install

# Rebuild native node-pty against the current Electron version
npm run rebuild-native

# Start in development mode (React dev server + Electron hot-reload)
npm start
```

### 打包分发

```bash
# Build the React bundle + package into a macOS .app
npm run package
```

输出在 `dist/`。

如需只验证桌面打包链路而不产出完整安装包，可执行：

```bash
npm run verify:desktop
```

---

## 功能深度讲解

### 1. 多工具统一启动

应用内置 **8 个主流 AI CLI / Provider 的启动配置**，每个都有：
- 唯一的品牌色（Claude 橙 / Codex 绿 / Gemini 蓝 / Qwen 青 / OpenCode 橙红 / GLM 紫 / MiniMax 粉 / Kimi 蓝）
- 手绘 SVG 品牌图标（从零设计，不侵权）
- 自动检测是否已安装 + 版本号
- 未安装时红点提示，点击自动执行安装命令

**启动命令**（写死在 main.js 的 `TOOL_CATALOG` 中）：

| 工具 | 启动 | YOLO | 续接最近会话 | Memory 文件 |
|---|---|---|---|---|
| Claude Code | `claude` | `--dangerously-skip-permissions` | `--continue` | `CLAUDE.md` |
| Codex | `codex` | `--dangerously-bypass-approvals-and-sandbox` | `resume --last` | `AGENTS.md` |
| Gemini CLI | `gemini` | `-y` | `--resume latest` | `GEMINI.md` |
| Qwen Code | `qwen` | `-y` | `--continue` | `QWEN.md` |
| OpenCode | `opencode` | — | `--continue` | `AGENTS.md` |
| GLM Code | 通过 claude + env | — | `--continue` | `CLAUDE.md` |
| MiniMax Code | 通过 claude + env | — | `--continue` | `CLAUDE.md` |
| Kimi Code | 通过 claude + env | — | `--continue` | `CLAUDE.md` |

### 2. 四态会话生命周期

智枢把每个会话的 AI 状态抽象为 **4 个精确的 phase**，这是和普通终端管理器的最大差异：

```
┌─────────────┐
│  未启动     │  no AI process — 会话里只有 shell
│ not_started │
└──────┬──────┘
       │ 用户点击 AI 工具按钮
       ▼
┌──────────────────┐
│   未指令          │  AI 已启动 + 用户还没发第一条指令
│ idle_no_instr... │  (Claude 欢迎界面显示中)
└──────┬───────────┘
       │ 用户按回车发送指令 + AI 开始输出
       ▼
┌─────────────┐
│  运行中     │  AI 正在生成响应（快速脉冲，品牌色）
│  running    │
└──────┬──────┘
       │ pty 输出静默 > 3 秒
       ▼
┌──────────────────┐
│ 运行后待审查      │  AI 完成响应，等你查看（慢速呼吸，绿色）
│ awaiting_review  │  ⏱️ 3.5 秒 debounce 后才发通知
└──────┬───────────┘    │
       │ 用户继续输入      │ 🔔 Toast + 系统通知 + 声音
       │                 ▼
       ▼             通知已发
   回到 running
```

**关键设计点**：
- 这些状态都是**主进程推断出来的**，不需要修改 AI 工具的代码
- 推断方式：`ps` 扫描 pty 进程树 + 跟踪用户是否按过 Enter + 输出静默时长
- **通知去抖**：连续 6.5 秒（3s 静默阈值 + 3.5s debounce）无输出才触发，避免 tool call 暂停误触发

### 3. Provider 系统（GLM / MiniMax / Kimi）

这是一个**非常巧妙的设计**：Claude Code 二进制本身支持通过环境变量切换 API 端点。所以：

```bash
ANTHROPIC_BASE_URL='https://open.bigmodel.cn/api/anthropic' \
ANTHROPIC_AUTH_TOKEN='your-glm-key' \
ANTHROPIC_DEFAULT_SONNET_MODEL='glm-5.1' \
claude --dangerously-skip-permissions
```

这条命令让**官方 Claude 二进制完全变成 GLM 的 CLI**。智谱 / MiniMax / Kimi 也是同样的原理。

智枢把这个机制**完全内化**到应用里：
- 设置窗口可视化配置每个 Provider 的 API Key / Base URL / Model
- 用户点按钮时自动构造内联环境变量命令
- **完全不依赖用户的 shell 函数** —— 换台电脑就能用
- POSIX 安全的单引号转义（`'` → `'\''`）处理特殊字符

对比"传统方案"（在 `.zshrc` 里写 shell 函数）：
| 维度 | Shell 函数 | 智枢 Provider |
|---|---|---|
| 配置位置 | `.zshrc` 硬编码 | 设置窗口可视化 |
| 跨机器迁移 | ❌ 需要手动复制 | ✅ 跟配置文件走 |
| 多 key 管理 | 🔧 要写多个函数 | ✅ 直接切换 |
| 非 zsh 用户 | ❌ 要重写 | ✅ 无关 |

### 4. 自动恢复上次会话

**这是智枢最实用的功能之一。**

应用每次启动时：
1. 读取配置文件里每个 session 的 `lastTool` 字段（自动跟踪）
2. 为每个 session 创建 pty
3. **延迟 1.2 秒后**（等 shell prompt 就绪），自动注入对应工具的续接命令
4. 终端显示 `[自动恢复 claude 上次会话...]` 提示
5. AI 工具带回**完整的对话上下文**（记忆、文件引用、已分析的代码等）

**这意味着你可以关闭应用不丢任何东西** —— 第二天打开，前一天的对话瞬间恢复到每个工具的"最近一次"会话。

设置里的开关控制是否启用（默认开启）。

### 5. Git 多仓库管理

**场景**：你的 `~/Desktop/项目群/` 下有 20 个独立 git 仓库（每个客户一个、每个实验一个等）。想知道**哪些有未提交改动、哪些待推送**？

智枢的 Git 面板有**两个模式**：

**A. 当前仓库模式**：
- 3 个 Tab：变更 / 分支 / 历史
- 变更文件列表带颜色徽章（M / A / D / U / R）
- 分支切换、Pull / Push / Fetch 一键操作
- 命令注入到当前会话的 pty 执行（看得见过程）

**B. 扫描全部模式**：
- **递归扫描当前工作区父目录下所有 git 仓库**（深度 4，自动跳过 node_modules 等）
- **并行** `git status` 每个仓库，几十个仓库 500ms 内完成
- 脏仓库自动排在最前
- 每个仓库的**健康状态用脉冲圆点**标识：绿 = 干净 / 黄 = 有变更 / 红 = ahead+behind 冲突
- 批量 Pull All / Fetch All 操作
- 点任意仓库展开看前 8 个变更文件

### 6. 文件浏览器 + 拖拽到终端

右侧抽屉式文件树，特点：

- **懒加载** — 点开目录才请求子内容，大仓库也秒开
- **Git 感知** — 每个文件根据 git status 自动着色（M/A/D/U/R 徽章）
- **隐藏文件可见** — `.env` / `.git` / `.gitignore` 等以半透明显示
- **完整右键菜单** — 新建 / 重命名 / 复制 / 压缩 / 移到废纸篓 / 在 Finder 显示 / 复制路径
- **文件预览** — 点文件显示前 10KB 内容
- **过滤搜索框** — 按名字快速找文件

**杀手级特性：拖拽到终端自动插入路径**
- 从文件树拖任意文件 → 丢到 xterm 区域
- 终端立即出现 `'完整/绝对/路径/file.ts' `（POSIX 单引号转义）
- 这是给 AI "指定要操作的文件"最快的方式，比复制粘贴快 5 倍

### 7. 项目模板（含 Memory File 预填）

新建项目时有 4 个内置模板：
- **空项目** — 只创建一个会话
- **Claude 单会话** — 写入 CLAUDE.md
- **全栈开发** — Frontend + Backend 两个会话 + CLAUDE.md + AGENTS.md
- **多 AI 对比** — Claude/Gemini/Codex 三个会话 + 4 个 memory 文件

**关键点**：智枢知道每个工具的 memory 文件约定不同：
| 工具 | Memory 文件 |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |
| Qwen Code | `QWEN.md` |
| OpenCode | `AGENTS.md`（与 Codex 共享）|

多 AI 对比模板会**同时**创建这些文件，让你用哪个工具都自动带上项目上下文。

### 8. 键盘快捷键

| 快捷键 | 功能 |
|---|---|
| `Cmd + T` | 在当前会话所属项目下新建会话 |
| `Cmd + W` | 关闭当前会话 |
| `Cmd + 1 ~ 9` | 切换到第 N 个会话（跨项目扁平编号）|
| `Cmd + F` | 在当前终端内搜索 |
| `Shift + 点击工具按钮` | 用续接模式启动（`--continue`）|
| `Option + 滚动` | 10 倍速快速滚动 |
| `Esc` | 关闭 modal / 取消重命名 |
| `双击会话名` | 开始重命名 |

---

## 架构设计

```
┌──────────────────────────────────────────────────────────┐
│                    Main Process (Node.js)                │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌───────────────────┐  │
│  │  BrowserWin│  │  node-pty  │  │  sessionStatus    │  │
│  │            │  │            │  │  ptyProcesses     │  │
│  │  (renderer)│  │  (shells)  │  │  notifyTimers     │  │
│  └──────┬─────┘  └──────┬─────┘  └─────────┬─────────┘  │
│         │               │                   │            │
│         │               │                   │            │
│     ┌───┴───────────────┴───────────────────┴────┐      │
│     │           IPC handlers                    │      │
│     │  pty:* / git:* / fs:* / tools:* /         │      │
│     │  window:* / config:* / session:*          │      │
│     └─────────────────┬──────────────────────────┘      │
│                       │                                  │
│     ┌─────────────────┴──────────────────────┐          │
│     │       Process monitor (1.5s tick)       │          │
│     │   ps -axo → BFS pty trees → state FSM  │          │
│     └─────────────────────────────────────────┘          │
└───────────────────────┬──────────────────────────────────┘
                        │ contextBridge
                        │ (safe IPC surface)
┌───────────────────────┴──────────────────────────────────┐
│               Renderer Process (Chromium)                │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │                  Zustand Store                     │  │
│  │  projects / sessions / sessionStatus / providers  │  │
│  │  toasts / promptDialog / toolCatalog / theme      │  │
│  └────┬──────────────────────────────────────────────┘  │
│       │                                                  │
│  ┌────┴─────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ Sidebar  │  │ TerminalView │  │ GitPanel        │   │
│  │          │  │  (xterm.js   │  │ FileTreePanel   │   │
│  │ Projects │  │   + WebGL)   │  │ SettingsModal   │   │
│  │ Sessions │  │  phase badge │  │ ContextMenu     │   │
│  │  status  │  │  search bar  │  │ ToastStack      │   │
│  └──────────┘  └──────────────┘  └─────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**关键架构决策：**

1. **Main vs Renderer 边界严格** — 所有 pty / 文件系统 / git 操作都在 main 进程，renderer 只通过 IPC 调用。contextIsolation + 白名单 API
2. **Zustand 而不是 Redux** — 无 Provider / 无 boilerplate，适合中等复杂度的桌面应用
3. **Session 持久化但 pty 不持久化** — 应用配置存在 `~/.ai-terminal-manager.json`，pty 进程随应用生命周期。通过 `lastTool` 字段在重启时自动恢复 AI 上下文
4. **进程监控用 `ps` 快照 + BFS 而不是 pgrep 循环** — 一次 `ps -axo` 获取全局快照，在内存里 BFS 每个 session 的进程树，比循环 shell-out 高效 10 倍
5. **通知 debounce** — running → awaiting_review 的转换只启动定时器，确认 3.5 秒后仍然 idle 才真正发通知。避免 tool-call 暂停误触发

---

## 项目结构

```
ai-terminal-manager/
├── electron/
│   ├── main.js          # 主进程：pty / git / fs / 监控 / tray
│   └── preload.js       # IPC 安全桥
├── src/
│   ├── index.js         # 入口，字体导入，全局 CSS
│   ├── App.jsx          # 根组件，快捷键监听，Toast/Modal 挂载
│   ├── store/
│   │   └── sessions.js  # Zustand store：所有应用状态
│   ├── components/
│   │   ├── Sidebar.jsx          # 项目树 + 会话列表 + 统计
│   │   ├── TerminalView.jsx     # xterm 终端 + 工具栏 + 状态条
│   │   ├── GitPanel.jsx         # Git 管理（双模式）
│   │   ├── FileTreePanel.jsx    # 文件浏览器 + 文件操作
│   │   ├── SettingsModal.jsx    # 设置窗口 (5 Tab)
│   │   ├── ContextMenu.jsx      # 通用右键菜单 (Portal 渲染)
│   │   ├── PromptDialog.jsx     # 自定义 prompt 对话框
│   │   ├── ToastStack.jsx       # 响应完成 toast
│   │   ├── ToolIcons.jsx        # 手绘 SVG 图标集
│   │   └── ErrorBoundary.jsx    # 渲染错误边界
│   └── utils/
│       └── sound.js     # Web Audio 合成提示音
├── public/
│   └── index.html
└── package.json
```

---

## 开发指南

### 启动开发环境

```bash
# 开两个终端：
# Terminal 1: React dev server (hot reload)
npm run react-start

# Terminal 2: Electron (连接到 localhost:3000)
NODE_ENV=development ./node_modules/.bin/electron .

# 或者一条命令（concurrently）
npm start
```

### 重新编译 node-pty

每次 Electron 版本更新都要重新编译 native 模块：

```bash
npx electron-rebuild -f -w node-pty
```

### 新增 AI 工具

在 `electron/main.js` 的 `TOOL_CATALOG` 中加条目：

```js
newtool: {
  id: 'newtool',
  name: 'New Tool',
  kind: 'npm',
  command: 'newtool',
  versionArgs: ['--version'],
  installCmd: 'npm install -g @vendor/newtool',
  upgradeCmd: 'npm update -g @vendor/newtool',
  yoloFlag: '--yes',
  continueArgs: '--continue',
  memoryFile: 'NEWTOOL.md',
},
```

然后在 `src/components/TerminalView.jsx` 的 `TOOL_VISUALS` 加颜色配置：

```js
newtool: { label: 'NewTool', color: '#4ecdc4', glow: 'rgba(78, 205, 196, 0.35)' },
```

在 `src/components/ToolIcons.jsx` 画一个 SVG 图标。

---

## 常见问题（FAQ）

### Q: 跨工具的上下文可以共享吗？
**A:** 理论上不可能。每家 AI 工具的"会话"都包含私有的系统提示、工具调用 schema、文件快照等元数据，格式互不兼容。**但实践上** 你可以通过 memory 文件共享背景知识 —— 智枢的"多 AI 对比"模板就是这么做的：同一个项目同时写入 `CLAUDE.md` + `AGENTS.md` + `GEMINI.md` + `QWEN.md`，每个文件内容相同，这样无论用哪个工具启动都自动读到项目背景。

### Q: 为什么 macOS 菜单栏有个图标，关闭窗口不退出？
**A:** 这是**菜单栏驻留模式**。应用最小化到菜单栏后仍然跟踪所有 pty 和会话状态，可以通过菜单栏图标查看运行中/待审查的会话数量，点击恢复窗口。真正的退出用 tray 菜单的"退出"或 `Cmd+Q`。

### Q: 我的 GLM 会话显示成 "Claude" 怎么办？
**A:** 应该不会。智枢用"声明意图"模式解决这个问题：启动 GLM 时前端把 `toolId='glm'` 传给主进程，主进程记住"这个 session 上次 launch 的是 GLM"。虽然从 `ps` 角度看它和 Claude 都是同一个 `claude` 二进制，但因为有 declared intent，侧边栏能正确显示紫色 GLM 标识。如果你看到错误显示，检查是否在主进程输出看到 `sessionLaunchedTool` 相关日志。

### Q: Dark 模式之外有 Light 模式吗？
**A:** 目前没有可用的 Light 模式。设置里会显示为"开发中"且不可选，避免进入半完成的混合主题状态。完整的浅色支持仍在 Roadmap 中。

### Q: Windows / Linux 支持吗？
**A:** 目前只在 macOS 上测试过。理论上 Electron + React 是跨平台的，主要障碍是：
- `stty` 命令（Windows 无 POSIX shell）
- macOS 特定的 `vibrancy` / `titleBarStyle: hiddenInset`
- `osascript` / Finder 交互
- 系统通知的 `sound: 'Glass'`（macOS 专属）

修起来不复杂但需要时间。欢迎 PR。

### Q: 为什么叫"智枢"？
**A:** "智" = 智能（AI），"枢" = 枢纽、中心。合起来就是"AI 的中枢"。灵感是应用的核心定位：**在多个 AI Agent 之间做统一调度的中心节点**。Logo 的六条辐射线也对应这个意象。

---

## Roadmap

- [ ] **Light 主题完整支持**（所有组件迁移到 CSS 变量）
- [ ] **跨平台构建**（Windows + Linux）
- [ ] **会话分屏**（同一个项目下 2 个会话并排显示，同时跑两个工具）
- [ ] **命令 Palette**（`Cmd+P` 模糊搜索所有项目/会话/文件）
- [ ] **会话对话导出**（把 xterm 缓冲区导出为 Markdown，作为跨工具的上下文桥梁）
- [ ] **全局快捷键**（系统级呼出窗口）
- [ ] **模板市场**（社区贡献的项目模板，包含现成的 memory 文件）
- [ ] **Agent 编排**（让一个 AI 给另一个 AI 发任务，DAG 式工作流）
- [ ] **完整的 Light / Auto 主题**
- [ ] **AI 工具 Sixel 图像显示**（等 xterm.js #4793 fix）

---

## 技术决策记录

记录一些关键设计决策的"为什么"，避免未来有人重复踩坑：

**1. 为什么不用 Tauri？** 虽然 Tauri 包体更小、性能更好，但 **node-pty 是 Node native addon**，在 Tauri 的 Rust 后端需要重写整个 pty 管理层。Electron 下 node-pty 是成熟方案，VSCode 终端也是这么做的。

**2. 为什么 Context menu 要用 React Portal？** FileTreePanel 用 `transform: translateX(...)` 做滑入动画。CSS 规范里 transformed 祖先会创建新的包含块，导致内部的 `position: fixed` 相对于该祖先而非 viewport。不用 Portal 的话右键菜单会在抽屉内部定位，可能跑到屏幕外。

**3. 为什么用 mousedown 检测右键而不是 contextmenu 事件？** HTML5 `draggable=true` 的元素会吞掉 contextmenu 事件（Chromium 的拖拽系统抢占）。mousedown 是最底层事件，早于拖拽系统接管，**button===2 检测右键是最可靠的方式**。

**4. 为什么通知要 debounce 3.5 秒？** Claude / Codex / Gemini 在 tool call 之间经常有 1-3 秒的暂停（读文件、等 API）。不 debounce 的话每次暂停都会触发"任务完成"通知，完全不准。3.5 秒是经验值：覆盖多数 tool call 延迟，又不会让用户等太久。

**5. 为什么 createPty 要 reuse 而不是 kill？** React 18 strict mode 在 dev 环境双调用 useEffect（mount → unmount → mount）检测 cleanup bug。如果 createPty 看到已有 pty 就 kill 重建，AI 工具会收到 SIGHUP 被意外杀死。改成 reuse 后 React 的 double-mount 无副作用。

**6. 为什么 process 监控用 BFS 而不是 pgrep？** `pgrep -P shellPid` 只能看到直接子进程。但 AI 工具可能 fork 子工具（git、rg、python），进程树是多层的。单次 `ps -axo` 获取全快照 + 内存 BFS 比多次 pgrep 快得多，也更完整。

**7. 为什么不用 ImageAddon？** xterm.js issue #4793：`ImageAddon` 的 WASM-based sixel 解码器在 dispose 时有 race condition，会抛 `Cannot read properties of undefined (reading '_isDisposed')`。等上游修复后再启用。

**8. 为什么 WebGL addon 要单独 dispose 而不是走 AddonManager？** WebGL 的 dispose 链对时序敏感，如果走 AddonManager 批量 dispose，可能在 terminal core 已经 cleanup 部分内部状态后才轮到 WebGL，访问 `_isDisposed` 时是 undefined。单独持 ref 优先 dispose 是稳定解法。

---

## License

MIT © 2026 - Present

---

## 致谢

- [xterm.js](https://xtermjs.org/) — 业界标杆的终端模拟器
- [node-pty](https://github.com/microsoft/node-pty) — Node.js 的真实 PTY 绑定
- [Electron](https://www.electronjs.org/) — 桌面应用跨平台框架
- [Inter](https://rsms.me/inter/) + [JetBrains Mono](https://www.jetbrains.com/lp/mono/) — 一流的字体
- 以及所有 AI CLI 工具的开发者，是他们先把交互式 AI 编程带到了终端

<div align="center">

**如果智枢对你有帮助，考虑给个 ⭐ Star 支持一下。**

有问题、建议、PR 都非常欢迎。

</div>

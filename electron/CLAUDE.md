# electron/ - Main Process

> [<< Back to root](../CLAUDE.md)

Electron main process modules. All pty, filesystem, git, process monitoring, system notifications, and tray resident logic live here.

---

## File List

| File | Lines | Responsibility |
|------|-------|----------------|
| `main.js` | ~190 | App lifecycle, BrowserWindow creation, module assembly |
| `preload.js` | ~103 | contextBridge whitelist API surface |
| `pty.js` | ~315 | PTY lifecycle, shared state maps, process cleanup, shell helpers |
| `monitor.js` | ~230 | Process monitor FSM (1.5s BFS tick) |
| `git.js` | ~150 | Git IPC handlers |
| `fs-handlers.js` | ~310 | File system IPC handlers |
| `tray.js` | ~85 | macOS menu bar resident |
| `tools.js` | ~160 | Tool catalog + installation IPC handlers |
| `config.js` | ~100 | Config persistence + Keychain migration |
| `gitStatus.js` | ~88 | `git status --porcelain=v1 -b` output parser (pure functions, no I/O) |
| `gitStatus.test.js` | ~54 | gitStatus unit tests |
| `keychain.js` | ~248 | macOS Keychain integration for secure API key storage |
| `keychain.test.js` | - | keychain unit tests |
| `pathValidator.js` | ~95 | File path validation for IPC security |
| `pathValidator.test.js` | - | pathValidator unit tests |

## Module Dependency Graph

```
main.js
  +-- config.js           (loadConfigAsync, loadConfig, saveConfigAsync)
  +-- pty.js              (loadPtyModule, initPtyIPC, ptyProcesses, killPtyTree, cleanupAll)
  |     +-- keychain.js   (migrateKeysFromConfig, extractAndStoreKeys, restoreKeysIntoConfig)
  +-- monitor.js          (monitorTick)
  |     +-- pty.js        (reads shared maps + broadcastStatus, broadcastResponseComplete)
  +-- git.js              (initGitIPC)
  |     +-- pty.js        (interruptAndRunInShell)
  |     +-- gitStatus.js  (parseGitStatus)
  +-- fs-handlers.js      (initFsIPC)
  |     +-- pathValidator.js (validatePath)
  +-- tray.js             (createTray, refreshTrayMenu, destroyTray)
  |     +-- pty.js        (reads sessionStatus)
  +-- tools.js            (initToolsIPC)
        +-- pty.js        (interruptAndRunInShell)
```

**Shared state ownership**: `pty.js` owns all core Maps (ptyProcesses, ptyMeta, sessionStatus, sessionLaunchedTool, notifyTimers, sessionNames). Other modules import these references and read/mutate through them. Primitive state (notificationsEnabled) is exported via getter/setter functions to avoid stale value copies.

## Core Data Structures

### ptyProcesses: `Map<sessionId, ptyProcess>`
All active node-pty processes. Key is UUID string.

### ptyMeta: `Map<sessionId, { lastOutputAt: number, hasUserInput: boolean }>`
- `lastOutputAt`: Most recent stdout timestamp, used to detect busy/idle transitions
- `hasUserInput`: Whether user has pressed Enter (distinguishes "never instructed" vs "finished instruction")

### sessionStatus: `Map<sessionId, { tool, label, phase, startedAt, runningStartedAt, lastRanTool, lastDuration }>`
Four-state FSM output. `phase in { not_started, idle_no_instruction, running, awaiting_review }`

### sessionLaunchedTool: `Map<sessionId, { id, label }>`
Declared intent: distinguishes GLM/MiniMax/Kimi (all spawn the same `claude` binary). monitorTick prefers this value.

### notifyTimers: `Map<sessionId, setTimeout handle>`
Debounced notification timers. running -> awaiting_review starts one; fires only if still idle after 3.5s.

## IPC Handler Classification

### PTY Lifecycle (registered in `pty.js`)
| Channel | Direction | Description |
|---------|-----------|-------------|
| `pty:create` | invoke | Create pty (reuse if exists, React 18 strict mode compatible) |
| `pty:write` | send | Write data (also detects Enter -> hasUserInput) |
| `pty:resize` | send | Resize terminal |
| `pty:kill` | send | killPtyTree (recursive SIGKILL) |
| `pty:launch` | send | Launch AI tool in pty (declares toolId) |
| `pty:insertText` | send | Insert text (drag-drop file paths) |
| `pty:data:{id}` | send (->renderer) | Terminal output |
| `pty:exit:{id}` | send (->renderer) | Process exit |

### Process Monitoring (broadcast from `monitor.js` via `pty.js` helpers)
| Channel | Direction | Description |
|---------|-----------|-------------|
| `session:status:{id}` | send (->renderer) | State change broadcast |
| `session:responseComplete` | send (->renderer) | AI finished responding (after debounce) |
| `session:updateNames` | send | Sync friendly session names |
| `session:cleanup` | send | Clean up session state |

### Git (registered in `git.js`)
| Channel | Direction | Description |
|---------|-----------|-------------|
| `git:status` | invoke | `git status --porcelain=v1 -b` |
| `git:branches` | invoke | `git branch -a` |
| `git:log` | invoke | `git log` (NUL-separated custom format) |
| `git:fileDiff` | invoke | `git diff -- <path>` |
| `git:scanRepos` | invoke | Recursively scan all git repos (depth 4) |
| `git:runInSession` | send | Execute git command in pty |

### File System (registered in `fs-handlers.js`)
| Channel | Direction | Description |
|---------|-----------|-------------|
| `fs:listDir` | invoke | Lazy directory listing |
| `fs:readFilePreview` | invoke | First 10KB file preview |
| `fs:exists` | invoke | File existence check |
| `fs:writeFile` | invoke | Write file (template system) |
| `fs:trash` | invoke | Move to Trash |
| `fs:rename` | invoke | Rename (path traversal prevention) |
| `fs:copy` | invoke | Recursive copy |
| `fs:move` | invoke | Move (cross-filesystem fallback copy+delete) |
| `fs:zip` | invoke | System zip command |
| `fs:newFile` / `fs:newFolder` | invoke | Create empty file/directory |
| `fs:convertHeic` | invoke | HEIC -> PNG (sips) |
| `fs:normalizeImage` | invoke | Generic image -> PNG |
| `fs:stat` | invoke | File metadata |
| `fs:reveal` | invoke | Reveal in Finder |
| `fs:openFile` | invoke | Open with default app |

### Config / Tools / Window (registered in `main.js` and `tools.js`)
| Channel | Direction | Description |
|---------|-----------|-------------|
| `config:load` / `config:save` | invoke | Persist to `~/.ai-terminal-manager.json` |
| `tools:catalog` | invoke | Return TOOL_CATALOG + PROVIDER_CATALOG |
| `tools:checkAll` | invoke | Check all tools installation status in parallel |
| `tools:installInSession` | send | Install/upgrade tool in pty |
| `window:toggleAlwaysOnTop` | invoke | Toggle always-on-top |
| `dialog:selectDir` | invoke | Directory selection dialog |

## Key Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `IDLE_SILENCE_MS` | 3000 | Output silence threshold (exceed = AI stopped outputting) |
| `NOTIFY_DEBOUNCE_MS` | 3500 | Notification debounce (confirm still idle before triggering) |
| `CONFIG_PATH` | `~/.ai-terminal-manager.json` | User config persistence path |
| Monitor interval | 1500ms | Process scan frequency |
| Scan max depth | 4 | Git repo recursive scan depth |
| `IGNORED_DIRS` | node_modules, .git, dist, build... | File tree/scan ignored directories |

## Dependencies

- `electron` (^31.0.0) -- BrowserWindow, IPC, Tray, Notification
- `node-pty` (^1.1.0) -- Native PTY binding (lazy-loaded after app ready)
- Node.js built-in: `child_process` (execFile/execFileSync), `fs`, `path`, `os`

## Adding a New IPC Handler Checklist
1. Register `ipcMain.handle` or `ipcMain.on` in the appropriate module's `initXxxIPC()` function (or `initSystemIPC()` in main.js for system/window/config handlers)
2. Expose in `preload.js` within `contextBridge.exposeInMainWorld`
3. If involving Renderer calls, use via `window.electronAPI.xxx` in components
4. Security review: parameter validation, path traversal prevention, no shell injection

---

*Updated: 2026-04-13 -- main.js modular refactoring*

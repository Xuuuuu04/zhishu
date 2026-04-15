/**
 * Tool catalog & installation IPC handlers.
 *
 * Single source of truth for AI CLI tool definitions and provider recipes.
 * The frontend reads the catalog via IPC to render buttons without hardcoding
 * command strings. Provider configs are mergeable — persisted config only
 * stores user overrides; defaults come from PROVIDER_CATALOG.
 */

const { ipcMain } = require('electron');
const { execFile } = require('child_process');
const { interruptAndRunInShell } = require('./pty');

const TOOL_CATALOG = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    kind: 'native',
    command: 'claude',
    versionArgs: ['--version'],
    installCmd: 'curl -fsSL https://claude.ai/install.sh | bash',
    upgradeCmd: 'curl -fsSL https://claude.ai/install.sh | bash',
    yoloFlag: '--dangerously-skip-permissions',
    continueArgs: '--continue',
    memoryFile: 'CLAUDE.md',
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    kind: 'npm',
    command: 'codex',
    versionArgs: ['--version'],
    installCmd: 'npm install -g @openai/codex',
    upgradeCmd: 'npm update -g @openai/codex',
    yoloFlag: '--dangerously-bypass-approvals-and-sandbox',
    continueArgs: 'resume --last',
    memoryFile: 'AGENTS.md',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini CLI',
    kind: 'npm',
    command: 'gemini',
    versionArgs: ['--version'],
    installCmd: 'npm install -g @google/gemini-cli',
    upgradeCmd: 'npm update -g @google/gemini-cli',
    yoloFlag: '-y',
    continueArgs: '--resume latest',
    memoryFile: 'GEMINI.md',
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen Code',
    kind: 'npm',
    command: 'qwen',
    versionArgs: ['--version'],
    installCmd: 'npm install -g @qwen-code/qwen-code',
    upgradeCmd: 'npm update -g @qwen-code/qwen-code',
    yoloFlag: '-y',
    continueArgs: '--continue',
    memoryFile: 'QWEN.md',
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    kind: 'npm',
    command: 'opencode',
    versionArgs: ['--version'],
    installCmd: 'npm install -g opencode-ai',
    upgradeCmd: 'opencode upgrade',
    yoloFlag: null,
    continueArgs: '--continue',
    memoryFile: 'AGENTS.md',
  },
};

const PROVIDER_CATALOG = {
  glm: {
    id: 'glm',
    name: 'GLM Code',
    baseTool: 'claude',
    configurable: true,
    defaults: {
      baseUrl: 'https://open.bigmodel.cn/api/anthropic',
      opusModel: 'glm-5.1',
      sonnetModel: 'glm-5.1',
      haikuModel: 'glm-5-turbo',
    },
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    baseTool: 'claude',
    configurable: true,
    defaults: {
      baseUrl: 'https://api.minimaxi.com/anthropic',
      opusModel: 'MiniMax-M2.7-highspeed',
      sonnetModel: 'MiniMax-M2.7-highspeed',
      haikuModel: 'MiniMax-M2.7-highspeed',
    },
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi Code',
    baseTool: 'claude',
    configurable: true,
    defaults: {
      baseUrl: 'https://api.kimi.com/coding',
      opusModel: 'kimi-for-coding',
      sonnetModel: 'kimi-for-coding',
      haikuModel: 'kimi-for-coding',
    },
  },
  qwencp: {
    id: 'qwencp',
    name: 'Qwen CodingPlan',
    baseTool: 'claude',
    configurable: true,
    defaults: {
      baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
      opusModel: 'qwen3.5-plus',
      sonnetModel: 'qwen3.5-plus',
      haikuModel: 'qwen3.5-plus',
    },
  },
};

function checkToolInstalled(tool) {
  return new Promise((resolve) => {
    execFile('which', [tool.command],
      { timeout: 5000 },
      (whichErr) => {
        if (whichErr) return resolve({ id: tool.id, installed: false, version: null });

        execFile(tool.command, tool.versionArgs,
          { timeout: 5000, maxBuffer: 1024 * 1024 },
          (verErr, stdout) => {
            if (verErr) return resolve({ id: tool.id, installed: true, version: null });
            const out = (stdout || '').trim();
            if (!out) return resolve({ id: tool.id, installed: true, version: null });
            const firstLine = out.split('\n')[0].replace(/\x1b\[[0-9;]*m/g, '').trim();
            resolve({ id: tool.id, installed: true, version: firstLine });
          });
      });
  });
}

function initToolsIPC() {
  ipcMain.handle('tools:catalog', () => ({
    tools: TOOL_CATALOG,
    providers: PROVIDER_CATALOG,
  }));

  ipcMain.handle('tools:checkAll', async () => {
    const entries = await Promise.all(
      Object.values(TOOL_CATALOG).map((t) =>
        checkToolInstalled(t).catch(() => ({ id: t.id, installed: false, version: null }))
      )
    );
    const result = {};
    for (const r of entries) result[r.id] = r;
    return result;
  });

  ipcMain.on('tools:installInSession', (_, { sessionId, toolId, action }) => {
    const tool = TOOL_CATALOG[toolId];
    if (!tool) return;
    const cmd = action === 'upgrade' ? tool.upgradeCmd : tool.installCmd;
    if (!cmd) return;
    interruptAndRunInShell(sessionId, cmd, {
      resetUserInput: true,
      prelude: `echo "📦 正在 ${action === 'upgrade' ? '升级' : '安装'} ${tool.name}..."`,
    }).catch(() => {});
  });
}

module.exports = {
  TOOL_CATALOG,
  PROVIDER_CATALOG,
  initToolsIPC,
};

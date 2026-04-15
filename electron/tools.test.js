/**
 * Tests for electron/tools.js — Tool catalog + provider definitions
 *
 * Business rules tested:
 *   - TOOL_CATALOG data completeness: every tool has required fields
 *   - TOOL_CATALOG field consistency: id matches key, command is lowercase
 *   - PROVIDER_CATALOG data completeness: every provider has required fields
 *   - PROVIDER_CATALOG defaults include baseUrl and models
 *   - PROVIDER_CATALOG baseTool is always 'claude'
 *   - Tool ID uniqueness
 *   - Kind field valid values
 *   - Command naming conventions
 *   - Provider-tool cross-references are valid
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TOOL_CATALOG,
  PROVIDER_CATALOG,
} = require('./tools');

// ─── TOOL_CATALOG structure and completeness ────────────────────────────────

test('TOOL_CATALOG has exactly 5 tools', () => {
  const keys = Object.keys(TOOL_CATALOG);
  assert.equal(keys.length, 5);
  assert.ok(keys.includes('claude'));
  assert.ok(keys.includes('codex'));
  assert.ok(keys.includes('gemini'));
  assert.ok(keys.includes('qwen'));
  assert.ok(keys.includes('opencode'));
});

test('every tool has all required fields', () => {
  const requiredFields = [
    'id', 'name', 'kind', 'command', 'versionArgs',
    'installCmd', 'upgradeCmd', 'yoloFlag', 'continueArgs', 'memoryFile',
  ];

  for (const [key, tool] of Object.entries(TOOL_CATALOG)) {
    for (const field of requiredFields) {
      assert.ok(field in tool, `Tool '${key}' is missing field '${field}'`);
    }
  }
});

test('every tool id matches its catalog key', () => {
  for (const [key, tool] of Object.entries(TOOL_CATALOG)) {
    assert.equal(tool.id, key, `Tool key '${key}' has id '${tool.id}'`);
  }
});

test('every tool name is a non-empty string', () => {
  for (const [key, tool] of Object.entries(TOOL_CATALOG)) {
    assert.ok(typeof tool.name === 'string' && tool.name.length > 0,
      `Tool '${key}' has invalid name: '${tool.name}'`);
  }
});

test('every tool command is lowercase and non-empty', () => {
  for (const [key, tool] of Object.entries(TOOL_CATALOG)) {
    assert.ok(typeof tool.command === 'string' && tool.command.length > 0,
      `Tool '${key}' has invalid command`);
    assert.equal(tool.command, tool.command.toLowerCase(),
      `Tool '${key}' command should be lowercase`);
  }
});

test('every tool kind is one of the valid values', () => {
  const validKinds = ['native', 'npm'];
  for (const [key, tool] of Object.entries(TOOL_CATALOG)) {
    assert.ok(validKinds.includes(tool.kind),
      `Tool '${key}' has invalid kind '${tool.kind}'`);
  }
});

test('every tool versionArgs is a non-empty array of strings', () => {
  for (const [key, tool] of Object.entries(TOOL_CATALOG)) {
    assert.ok(Array.isArray(tool.versionArgs) && tool.versionArgs.length > 0,
      `Tool '${key}' has invalid versionArgs`);
    for (const arg of tool.versionArgs) {
      assert.ok(typeof arg === 'string',
        `Tool '${key}' versionArgs contains non-string`);
    }
  }
});

test('every tool installCmd and upgradeCmd are non-empty strings', () => {
  for (const [key, tool] of Object.entries(TOOL_CATALOG)) {
    assert.ok(typeof tool.installCmd === 'string' && tool.installCmd.length > 0,
      `Tool '${key}' has invalid installCmd`);
    assert.ok(typeof tool.upgradeCmd === 'string' && tool.upgradeCmd.length > 0,
      `Tool '${key}' has invalid upgradeCmd`);
  }
});

test('continueArgs field is a non-empty string for all tools', () => {
  for (const [key, tool] of Object.entries(TOOL_CATALOG)) {
    assert.ok(typeof tool.continueArgs === 'string' && tool.continueArgs.length > 0,
      `Tool '${key}' has invalid continueArgs`);
  }
});

test('memoryFile is a non-empty string ending in .md for all tools', () => {
  for (const [key, tool] of Object.entries(TOOL_CATALOG)) {
    assert.ok(typeof tool.memoryFile === 'string' && tool.memoryFile.length > 0,
      `Tool '${key}' has invalid memoryFile`);
    assert.ok(tool.memoryFile.endsWith('.md'),
      `Tool '${key}' memoryFile '${tool.memoryFile}' should end with .md`);
  }
});

test('yoloFlag is either a string or null', () => {
  for (const [key, tool] of Object.entries(TOOL_CATALOG)) {
    assert.ok(
      tool.yoloFlag === null || typeof tool.yoloFlag === 'string',
      `Tool '${key}' has invalid yoloFlag: ${tool.yoloFlag}`
    );
  }
});

test('opencode is the only tool without a yolo flag', () => {
  assert.equal(TOOL_CATALOG.opencode.yoloFlag, null);
  // All others should have a yolo flag
  for (const [key, tool] of Object.entries(TOOL_CATALOG)) {
    if (key !== 'opencode') {
      assert.ok(tool.yoloFlag !== null, `Tool '${key}' should have a yoloFlag`);
    }
  }
});

// ─── TOOL_CATALOG specific tool data ────────────────────────────────────────

test('claude tool has correct native kind and command', () => {
  assert.equal(TOOL_CATALOG.claude.kind, 'native');
  assert.equal(TOOL_CATALOG.claude.command, 'claude');
  assert.equal(TOOL_CATALOG.claude.memoryFile, 'CLAUDE.md');
  assert.equal(TOOL_CATALOG.claude.continueArgs, '--continue');
  assert.equal(TOOL_CATALOG.claude.yoloFlag, '--dangerously-skip-permissions');
});

test('codex tool has correct npm kind and command', () => {
  assert.equal(TOOL_CATALOG.codex.kind, 'npm');
  assert.equal(TOOL_CATALOG.codex.command, 'codex');
  assert.equal(TOOL_CATALOG.codex.memoryFile, 'AGENTS.md');
  assert.equal(TOOL_CATALOG.codex.continueArgs, 'resume --last');
  assert.equal(TOOL_CATALOG.codex.yoloFlag, '--dangerously-bypass-approvals-and-sandbox');
});

test('gemini tool has correct npm kind and command', () => {
  assert.equal(TOOL_CATALOG.gemini.kind, 'npm');
  assert.equal(TOOL_CATALOG.gemini.command, 'gemini');
  assert.equal(TOOL_CATALOG.gemini.memoryFile, 'GEMINI.md');
  assert.equal(TOOL_CATALOG.gemini.continueArgs, '--resume latest');
});

test('qwen tool has correct npm kind and command', () => {
  assert.equal(TOOL_CATALOG.qwen.kind, 'npm');
  assert.equal(TOOL_CATALOG.qwen.command, 'qwen');
  assert.equal(TOOL_CATALOG.qwen.memoryFile, 'QWEN.md');
  assert.equal(TOOL_CATALOG.qwen.continueArgs, '--continue');
});

test('opencode tool has correct npm kind and command', () => {
  assert.equal(TOOL_CATALOG.opencode.kind, 'npm');
  assert.equal(TOOL_CATALOG.opencode.command, 'opencode');
  assert.equal(TOOL_CATALOG.opencode.memoryFile, 'AGENTS.md');
  assert.equal(TOOL_CATALOG.opencode.continueArgs, '--continue');
});

test('npm tools reference valid npm package names in installCmd', () => {
  const npmTools = Object.entries(TOOL_CATALOG).filter(([, t]) => t.kind === 'npm');
  for (const [key, tool] of npmTools) {
    assert.ok(tool.installCmd.includes('npm install -g'),
      `npm tool '${key}' installCmd should use 'npm install -g'`);
    // Extract package name from install command
    const match = tool.installCmd.match(/npm install -g (@?\S+)/);
    assert.ok(match, `npm tool '${key}' installCmd should have a package name`);
    assert.ok(match[1].length > 0, `npm tool '${key}' should have non-empty package name`);
  }
});

test('all tool IDs are unique', () => {
  const ids = Object.values(TOOL_CATALOG).map(t => t.id);
  const uniqueIds = new Set(ids);
  assert.equal(ids.length, uniqueIds.size, 'All tool IDs must be unique');
});

test('all tool commands are unique', () => {
  const commands = Object.values(TOOL_CATALOG).map(t => t.command);
  const uniqueCommands = new Set(commands);
  assert.equal(commands.length, uniqueCommands.size, 'All tool commands must be unique');
});

// ─── PROVIDER_CATALOG structure and completeness ────────────────────────────

test('PROVIDER_CATALOG has exactly 4 providers', () => {
  const keys = Object.keys(PROVIDER_CATALOG);
  assert.equal(keys.length, 4);
  assert.ok(keys.includes('glm'));
  assert.ok(keys.includes('minimax'));
  assert.ok(keys.includes('kimi'));
  assert.ok(keys.includes('qwencp'));
});

test('every provider has all required fields', () => {
  const requiredFields = ['id', 'name', 'baseTool', 'configurable', 'defaults'];
  for (const [key, provider] of Object.entries(PROVIDER_CATALOG)) {
    for (const field of requiredFields) {
      assert.ok(field in provider, `Provider '${key}' is missing field '${field}'`);
    }
  }
});

test('every provider id matches its catalog key', () => {
  for (const [key, provider] of Object.entries(PROVIDER_CATALOG)) {
    assert.equal(provider.id, key, `Provider key '${key}' has id '${provider.id}'`);
  }
});

test('every provider is configurable', () => {
  for (const [key, provider] of Object.entries(PROVIDER_CATALOG)) {
    assert.equal(provider.configurable, true,
      `Provider '${key}' should be configurable`);
  }
});

test('every provider baseTool references a valid tool in TOOL_CATALOG', () => {
  for (const [key, provider] of Object.entries(PROVIDER_CATALOG)) {
    assert.ok(provider.baseTool in TOOL_CATALOG,
      `Provider '${key}' references unknown baseTool '${provider.baseTool}'`);
  }
});

test('all providers use claude as baseTool', () => {
  for (const [key, provider] of Object.entries(PROVIDER_CATALOG)) {
    assert.equal(provider.baseTool, 'claude',
      `Provider '${key}' should use claude as baseTool`);
  }
});

test('every provider defaults include baseUrl', () => {
  for (const [key, provider] of Object.entries(PROVIDER_CATALOG)) {
    assert.ok('baseUrl' in provider.defaults,
      `Provider '${key}' defaults missing baseUrl`);
    assert.ok(typeof provider.defaults.baseUrl === 'string' &&
      provider.defaults.baseUrl.startsWith('https://'),
      `Provider '${key}' defaults.baseUrl should be an https URL`);
  }
});

test('every provider defaults include model fields', () => {
  const modelFields = ['opusModel', 'sonnetModel', 'haikuModel'];
  for (const [key, provider] of Object.entries(PROVIDER_CATALOG)) {
    for (const field of modelFields) {
      assert.ok(field in provider.defaults,
        `Provider '${key}' defaults missing '${field}'`);
      assert.ok(typeof provider.defaults[field] === 'string' &&
        provider.defaults[field].length > 0,
        `Provider '${key}' defaults.${field} should be non-empty string`);
    }
  }
});

test('GLM provider has correct defaults', () => {
  const glm = PROVIDER_CATALOG.glm;
  assert.equal(glm.name, 'GLM Code');
  assert.equal(glm.defaults.baseUrl, 'https://open.bigmodel.cn/api/anthropic');
  assert.ok(glm.defaults.opusModel.includes('glm'));
});

test('MiniMax provider has correct defaults', () => {
  const minimax = PROVIDER_CATALOG.minimax;
  assert.equal(minimax.name, 'MiniMax');
  assert.equal(minimax.defaults.baseUrl, 'https://api.minimaxi.com/anthropic');
  assert.ok(minimax.defaults.opusModel.includes('MiniMax'));
});

test('Kimi provider has correct defaults', () => {
  const kimi = PROVIDER_CATALOG.kimi;
  assert.equal(kimi.name, 'Kimi Code');
  assert.equal(kimi.defaults.baseUrl, 'https://api.kimi.com/coding');
  assert.ok(kimi.defaults.opusModel.includes('kimi'));
});

test('all provider IDs are unique', () => {
  const ids = Object.values(PROVIDER_CATALOG).map(p => p.id);
  const uniqueIds = new Set(ids);
  assert.equal(ids.length, uniqueIds.size, 'All provider IDs must be unique');
});

test('provider IDs match keychain ALLOWED_ACCOUNTS', () => {
  // From keychain.js: ALLOWED_ACCOUNTS = new Set(['glm', 'minimax', 'kimi', 'qwencp'])
  const providerIds = Object.keys(PROVIDER_CATALOG);
  const allowedAccounts = new Set(['glm', 'minimax', 'kimi', 'qwencp']);
  for (const id of providerIds) {
    assert.ok(allowedAccounts.has(id),
      `Provider '${id}' should be in ALLOWED_ACCOUNTS`);
  }
  assert.equal(providerIds.length, allowedAccounts.size,
    'PROVIDER_CATALOG and ALLOWED_ACCOUNTS should have the same size');
});

// ─── Cross-reference: provider baseTools reference memoryFile ───────────────

test('providers inherit memoryFile from their baseTool', () => {
  for (const [key, provider] of Object.entries(PROVIDER_CATALOG)) {
    const baseTool = TOOL_CATALOG[provider.baseTool];
    assert.ok(baseTool, `Provider '${key}' references non-existent baseTool`);
    // Providers that use the claude binary share claude's memoryFile (CLAUDE.md)
    // This is implicit — the provider reuses claude's command
    assert.equal(baseTool.memoryFile, 'CLAUDE.md');
  }
});

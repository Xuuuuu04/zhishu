const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ALLOWED_ACCOUNTS,
  migrateKeysFromConfig,
  extractAndStoreKeys,
  restoreKeysIntoConfig,
} = require('./keychain');

// ─── Unit tests for pure-logic helpers (no Keychain access needed) ──────────

test('ALLOWED_ACCOUNTS contains exactly glm, minimax, kimi', () => {
  assert.ok(ALLOWED_ACCOUNTS.has('glm'));
  assert.ok(ALLOWED_ACCOUNTS.has('minimax'));
  assert.ok(ALLOWED_ACCOUNTS.has('kimi'));
  assert.equal(ALLOWED_ACCOUNTS.size, 3);
});

test('migrateKeysFromConfig passes through non-managed providers unchanged', async () => {
  const input = {
    other: { apiKey: 'plaintext-key', baseUrl: 'https://example.com' },
  };
  const result = await migrateKeysFromConfig(input);
  assert.equal(result.other.apiKey, 'plaintext-key');
});

test('migrateKeysFromConfig returns empty/undefined providerConfigs as-is', async () => {
  assert.equal(await migrateKeysFromConfig(null), null);
  assert.equal(await migrateKeysFromConfig(undefined), undefined);
  assert.deepEqual(await migrateKeysFromConfig({}), {});
});

test('extractAndStoreKeys replaces real keys with placeholder', async () => {
  // Note: This will actually call `security` on macOS — the setKey will either
  // succeed (if running on macOS) or fail gracefully. Either way the logic
  // of replacing with '***' should hold.
  const input = {
    glm: { apiKey: 'test-glm-key-12345', baseUrl: 'https://example.com' },
  };
  const result = await extractAndStoreKeys(input);
  assert.equal(result.glm.apiKey, '***');
  assert.equal(result.glm.baseUrl, 'https://example.com');
});

test('extractAndStoreKeys leaves placeholder keys as-is', async () => {
  const input = {
    glm: { apiKey: '***', baseUrl: 'https://example.com' },
  };
  const result = await extractAndStoreKeys(input);
  assert.equal(result.glm.apiKey, '***');
});

test('extractAndStoreKeys leaves empty keys as-is', async () => {
  const input = {
    glm: { apiKey: '', baseUrl: 'https://example.com' },
  };
  const result = await extractAndStoreKeys(input);
  assert.equal(result.glm.apiKey, '');
});

test('restoreKeysIntoConfig leaves non-managed providers unchanged', async () => {
  const input = {
    other: { apiKey: 'real-key', baseUrl: 'https://example.com' },
  };
  const result = await restoreKeysIntoConfig(input);
  assert.equal(result.other.apiKey, 'real-key');
});

test('restoreKeysIntoConfig returns empty/undefined providerConfigs as-is', async () => {
  assert.equal(await restoreKeysIntoConfig(null), null);
  assert.equal(await restoreKeysIntoConfig(undefined), undefined);
  assert.deepEqual(await restoreKeysIntoConfig({}), {});
});

// ─── Integration test with real Keychain (macOS only) ───────────────────────
//
// These tests read/write the actual macOS Keychain. They will be skipped
// silently if `security` is not available (non-macOS, CI, etc.).

const { execFileSync } = require('child_process');
let hasSecurity = false;
try {
  execFileSync('which', ['security'], { timeout: 2000 });
  hasSecurity = true;
} catch (_) {}

test('round-trip: setKey -> getKey -> deleteKey', { skip: !hasSecurity }, async () => {
  const { getKey, setKey, deleteKey } = require('./keychain');
  const testAccount = 'glm';
  const testPassword = `test-key-${Date.now()}`;

  // Set
  const setOk = await setKey(testAccount, testPassword);
  assert.ok(setOk, 'setKey should succeed');

  // Get
  const retrieved = await getKey(testAccount);
  assert.equal(retrieved, testPassword, 'getKey should return the value we just set');

  // Clean up
  const delOk = await deleteKey(testAccount);
  assert.ok(delOk, 'deleteKey should succeed');

  // Verify deletion
  const afterDelete = await getKey(testAccount);
  assert.equal(afterDelete, null, 'getKey should return null after delete');
});

test('restoreKeysIntoConfig restores from Keychain', { skip: !hasSecurity }, async () => {
  const { getKey, setKey, deleteKey } = require('./keychain');
  const testAccount = 'kimi';
  const testPassword = `restore-test-${Date.now()}`;

  // Store a key first
  await setKey(testAccount, testPassword);

  // Now restore into a config with placeholder
  const input = {
    kimi: { apiKey: '***', baseUrl: 'https://example.com' },
  };
  const result = await restoreKeysIntoConfig(input);
  assert.equal(result.kimi.apiKey, testPassword, 'should restore real key from Keychain');

  // Clean up
  await deleteKey(testAccount);
});

test('restoreKeysIntoConfig handles missing Keychain entry gracefully', { skip: !hasSecurity }, async () => {
  const { deleteKey } = require('./keychain');
  // Ensure no entry exists for 'minimax' (clean slate)
  try { await deleteKey('minimax'); } catch (_) {}

  const input = {
    minimax: { apiKey: '***', baseUrl: 'https://example.com' },
  };
  const result = await restoreKeysIntoConfig(input);
  // If no Keychain entry, the placeholder should remain or become empty string
  assert.ok(
    result.minimax.apiKey === '***' || result.minimax.apiKey === '',
    `Expected '***' or '' but got '${result.minimax.apiKey}'`
  );
});

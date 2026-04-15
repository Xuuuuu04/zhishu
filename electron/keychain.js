/**
 * macOS Keychain integration for secure API key storage.
 *
 * Uses the built-in `security` CLI — zero external dependencies.
 * All commands go through `execFile` (not `exec`) to prevent shell injection (CWE-78).
 */

const { execFile } = require('child_process');

const SERVICE_NAME = 'ai-terminal-manager';

// Provider IDs that are allowed to store keys in Keychain.
// Must match the keys in PROVIDER_CATALOG.
const ALLOWED_ACCOUNTS = new Set(['glm', 'minimax', 'kimi', 'qwencp']);

/**
 * Validate that an account name is a known provider ID.
 * Prevents arbitrary Keychain reads/writes via crafted input.
 */
function validateAccount(account) {
  if (!ALLOWED_ACCOUNTS.has(account)) {
    throw new Error(`Invalid keychain account: ${account}`);
  }
}

/**
 * Retrieve a password from macOS Keychain.
 * Returns null if the key does not exist or the operation fails.
 *
 * @param {string} account - Provider ID (e.g. 'glm', 'minimax', 'kimi')
 * @returns {Promise<string|null>}
 */
function getKey(account) {
  validateAccount(account);

  return new Promise((resolve) => {
    execFile(
      'security',
      ['find-generic-password', '-s', SERVICE_NAME, '-a', account, '-w'],
      { timeout: 5000 },
      (err, stdout) => {
        if (err) {
          // Key not found or other error — return null (not a crash-worthy event)
          return resolve(null);
        }
        resolve(stdout.trimEnd() || null);
      }
    );
  });
}

/**
 * Store (or update) a password in macOS Keychain.
 * Uses -U flag to update if the entry already exists.
 *
 * @param {string} account - Provider ID
 * @param {string} password - The API key to store
 * @returns {Promise<boolean>} - true on success, false on failure
 */
function setKey(account, password) {
  validateAccount(account);

  return new Promise((resolve) => {
    execFile(
      'security',
      ['add-generic-password', '-U', '-s', SERVICE_NAME, '-a', account, '-w', password],
      { timeout: 5000 },
      (err) => {
        if (err) {
          console.error(`[keychain] setKey failed for ${account}:`, err.message);
          return resolve(false);
        }
        resolve(true);
      }
    );
  });
}

/**
 * Delete a password from macOS Keychain.
 * Silently succeeds if the key does not exist.
 *
 * @param {string} account - Provider ID
 * @returns {Promise<boolean>}
 */
function deleteKey(account) {
  validateAccount(account);

  return new Promise((resolve) => {
    execFile(
      'security',
      ['delete-generic-password', '-s', SERVICE_NAME, '-a', account],
      { timeout: 5000 },
      (err) => {
        if (err) {
          // "The specified item could not be found in the keychain" is fine
          return resolve(false);
        }
        resolve(true);
      }
    );
  });
}

/**
 * Migrate API keys from the JSON config into Keychain.
 *
 * For each provider in providerConfigs:
 *   - If the JSON has a plaintext apiKey that is NOT the placeholder ('***')
 *     AND Keychain does NOT already have a key for this account:
 *     => Write to Keychain
 *   - Returns a sanitized copy of providerConfigs where all apiKeys are replaced
 *     with '***' (or removed entirely if empty).
 *
 * @param {Object} providerConfigs - { glm: { apiKey: '...', ... }, ... }
 * @returns {Promise<Object>} - sanitized providerConfigs
 */
async function migrateKeysFromConfig(providerConfigs) {
  if (!providerConfigs || typeof providerConfigs !== 'object') {
    return providerConfigs;
  }

  const sanitized = {};

  for (const [providerId, config] of Object.entries(providerConfigs)) {
    if (!ALLOWED_ACCOUNTS.has(providerId)) {
      // Not a keychain-managed provider — pass through unchanged
      sanitized[providerId] = config;
      continue;
    }

    const cfg = { ...config };
    const apiKey = cfg.apiKey;

    if (apiKey && apiKey !== '***') {
      // Plaintext key found — try to migrate to Keychain
      const existingKey = await getKey(providerId);
      if (!existingKey) {
        // Keychain has no entry yet — migrate
        const ok = await setKey(providerId, apiKey);
        if (ok) {
          console.log(`[keychain] Migrated API key for ${providerId} to Keychain`);
        } else {
          console.warn(`[keychain] Migration failed for ${providerId} — key stays in memory only`);
        }
      }
      // Replace plaintext with placeholder regardless
      cfg.apiKey = '***';
    }

    sanitized[providerId] = cfg;
  }

  return sanitized;
}

/**
 * Extract API keys from providerConfigs for Keychain storage.
 *
 * For each managed provider:
 *   - If the config has a real apiKey (not '***', not empty):
 *     => Write to Keychain, replace with '***'
 *   - If the config has '***' or no apiKey:
 *     => Leave as-is (Keychain retains whatever it has)
 *
 * @param {Object} providerConfigs - { glm: { apiKey: '...', ... }, ... }
 * @returns {Promise<Object>} - sanitized providerConfigs (apiKey replaced with '***')
 */
async function extractAndStoreKeys(providerConfigs) {
  if (!providerConfigs || typeof providerConfigs !== 'object') {
    return providerConfigs;
  }

  const sanitized = {};

  for (const [providerId, config] of Object.entries(providerConfigs)) {
    if (!ALLOWED_ACCOUNTS.has(providerId)) {
      sanitized[providerId] = config;
      continue;
    }

    const cfg = { ...config };
    const apiKey = cfg.apiKey;

    if (apiKey && apiKey !== '***') {
      // Real key provided — store in Keychain
      const ok = await setKey(providerId, apiKey);
      if (ok) {
        cfg.apiKey = '***';
      } else {
        // Fallback: keep the key in memory for this session but warn
        console.warn(`[keychain] Could not store API key for ${providerId} in Keychain`);
        cfg.apiKey = '***'; // Still mask it — don't write plaintext to disk
      }
    }

    sanitized[providerId] = cfg;
  }

  return sanitized;
}

/**
 * Restore API keys from Keychain into providerConfigs.
 *
 * For each managed provider that has '***' as its apiKey:
 *   => Read from Keychain and replace with the real value.
 *
 * @param {Object} providerConfigs - { glm: { apiKey: '***', ... }, ... }
 * @returns {Promise<Object>} - providerConfigs with real API keys restored
 */
async function restoreKeysIntoConfig(providerConfigs) {
  if (!providerConfigs || typeof providerConfigs !== 'object') {
    return providerConfigs;
  }

  const restored = {};

  for (const [providerId, config] of Object.entries(providerConfigs)) {
    if (!ALLOWED_ACCOUNTS.has(providerId)) {
      restored[providerId] = config;
      continue;
    }

    const cfg = { ...config };

    if (cfg.apiKey === '***' || !cfg.apiKey) {
      // Try to restore from Keychain
      const key = await getKey(providerId);
      cfg.apiKey = key || cfg.apiKey || '';
    }

    restored[providerId] = cfg;
  }

  return restored;
}

module.exports = {
  getKey,
  setKey,
  deleteKey,
  migrateKeysFromConfig,
  extractAndStoreKeys,
  restoreKeysIntoConfig,
  ALLOWED_ACCOUNTS,
};

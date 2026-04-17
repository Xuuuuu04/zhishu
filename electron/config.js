/**
 * Config persistence module.
 *
 * Manages loading/saving the user config file at ~/.ai-terminal-manager.json,
 * with Keychain migration for API keys. The on-disk file never contains
 * plaintext API keys — they are stored in macOS Keychain and restored into
 * the in-memory cache only.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  migrateKeysFromConfig,
  extractAndStoreKeys,
  restoreKeysIntoConfig,
} = require('./keychain');

const CONFIG_PATH = path.join(os.homedir(), '.ai-terminal-manager.json');

// In-memory cache of the most recently loaded config (with real API keys).
let cachedConfig = null;

function loadConfig() {
  // Synchronous path — returns the cached config if available,
  // otherwise reads from disk (without Keychain restoration).
  if (cachedConfig) return JSON.parse(JSON.stringify(cachedConfig));
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return { projects: [] };
}

/**
 * Async config loader that migrates plaintext API keys to Keychain
 * and restores the real keys into memory for the renderer to use.
 * Should be called once during app startup (before the IPC handler is first invoked).
 */
async function loadConfigAsync() {
  let config;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } else {
      config = { projects: [] };
    }
  } catch (e) {
    console.error('Failed to load config:', e);
    config = { projects: [] };
  }

  // Step 1: Migrate any plaintext API keys from JSON to Keychain.
  if (config.providerConfigs) {
    const needsRewrite = Object.entries(config.providerConfigs).some(
      ([, cfg]) => cfg.apiKey && cfg.apiKey !== '***'
    );
    if (needsRewrite) {
      config.providerConfigs = await migrateKeysFromConfig(config.providerConfigs);
      try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
        try { fs.chmodSync(CONFIG_PATH, 0o600); } catch (_) {}
      } catch (e) {
        console.error('Failed to rewrite config after migration:', e);
      }
    }
  }

  // Also migrate custom provider keys
  if (config.customProviders) {
    const needsRewrite = Object.entries(config.customProviders).some(
      ([, cfg]) => cfg.apiKey && cfg.apiKey !== '***'
    );
    if (needsRewrite) {
      config.customProviders = await migrateKeysFromConfig(config.customProviders);
      try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
        try { fs.chmodSync(CONFIG_PATH, 0o600); } catch (_) {}
      } catch (e) {
        console.error('Failed to rewrite config after custom provider migration:', e);
      }
    }
  }

  // Step 2: Restore real API keys from Keychain into the in-memory config
  if (config.providerConfigs) {
    config.providerConfigs = await restoreKeysIntoConfig(config.providerConfigs);
  }
  if (config.customProviders) {
    config.customProviders = await restoreKeysIntoConfig(config.customProviders);
  }

  cachedConfig = config;
  return config;
}

/**
 * Async config saver that extracts API keys to Keychain before writing to disk.
 */
async function saveConfigAsync(data) {
  try {
    const toWrite = JSON.parse(JSON.stringify(data));

    if (toWrite.providerConfigs) {
      toWrite.providerConfigs = await extractAndStoreKeys(toWrite.providerConfigs);
    }

    if (toWrite.customProviders) {
      toWrite.customProviders = await extractAndStoreKeys(toWrite.customProviders);
    }

    // Atomic write: write to temp file then rename — prevents partial writes
    // on forced kill / crash (rename is atomic on POSIX).
    const tmpPath = CONFIG_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(toWrite, null, 2), 'utf-8');
    try { fs.chmodSync(tmpPath, 0o600); } catch (_) {}
    fs.renameSync(tmpPath, CONFIG_PATH);

    cachedConfig = JSON.parse(JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

module.exports = {
  loadConfig,
  loadConfigAsync,
  saveConfigAsync,
};

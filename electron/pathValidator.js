const path = require('path');
const os = require('os');
const fs = require('fs');

// Blacklisted directory names that must never be accessible through file-system IPC.
// Each entry represents a path component (e.g. ".ssh" matches /home/user/.ssh and
// /home/user/.ssh/id_rsa but NOT /home/user/.sshrc).
// We store without leading/trailing slashes; boundary checking is done in validatePath.
const FORBIDDEN_DIR_COMPONENTS = [
  '.ssh',
  '.gnupg',
  '.aws',
  '.kube',
];

// Blacklisted path prefixes — system directories that are never user-project paths.
// Includes both literal paths (e.g. /etc) and symlink-resolved equivalents
// (e.g. /private/etc — macOS symlinks /etc -> /private/etc).
const FORBIDDEN_PREFIXES = [
  '/etc/',
  '/etc',
  '/private/etc/',
  '/private/etc',
  '/System/',
  '/System',
  '/private/var/',
  '/private/var',
];

/**
 * Validate a file-system path for safe IPC access.
 *
 * Rules:
 *   1. Input must be a non-empty string.
 *   2. Path is normalize + resolve'd (eliminates ../ traversal).
 *   3. Must reside under the user's home directory or the system temp directory.
 *   4. Must not match any blacklisted sensitive segments (.ssh, .aws, .gnupg, Keychains, etc.).
 *   5. Must not match system directory prefixes (/etc, /System, /private/var).
 *
 * Returns { valid: true, resolved } on success, { valid: false, error } on failure.
 * Pure function — no I/O, no side effects.
 */
function validatePath(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.length === 0) {
    return { valid: false, error: 'Invalid path: must be a non-empty string' };
  }

  const resolved = path.resolve(path.normalize(inputPath));

  // Resolve symlinks to get the real path. If the path doesn't exist yet,
  // realpathSync will throw — in that case we fall back to the resolved path
  // and check as much as we can (parent directories may still be symlinks).
  let checkedPath = resolved;
  try {
    checkedPath = fs.realpathSync(resolved);
  } catch {
    // Path doesn't exist on disk. Try resolving parent directories that do exist.
    try {
      const realParent = fs.realpathSync(path.dirname(resolved));
      checkedPath = path.join(realParent, path.basename(resolved));
    } catch {
      // Even parent doesn't exist; fall through with the unresolved path.
    }
  }

  // Check forbidden prefixes first (system directories)
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (checkedPath === prefix || checkedPath.startsWith(prefix + '/')) {
      return { valid: false, error: 'Access denied: path is in a restricted area' };
    }
  }

  // Check forbidden directory components (sensitive credential directories).
  // We split the resolved path into components and check each one against the blacklist.
  const components = checkedPath.split('/').filter(Boolean); // filter removes empty strings from leading /
  for (const forbidden of FORBIDDEN_DIR_COMPONENTS) {
    if (components.includes(forbidden)) {
      return { valid: false, error: 'Access denied: path is in a restricted area' };
    }
  }

  // Check for the special case of ~/Library/Keychains/ (multi-component pattern).
  // We check if "Keychains" appears as a component and is preceded by "Library".
  const kcIdx = components.indexOf('Keychains');
  if (kcIdx !== -1 && kcIdx > 0 && components[kcIdx - 1] === 'Library') {
    return { valid: false, error: 'Access denied: path is in a restricted area' };
  }

  // Ensure the resolved path is under the user's home directory or temp directory.
  const homeDir = os.homedir();
  const tmpDir = os.tmpdir();
  if (!checkedPath.startsWith(homeDir) && !checkedPath.startsWith(tmpDir)) {
    return { valid: false, error: 'Access denied: path must be under home or temp directory' };
  }

  return { valid: true, resolved };
}

/**
 * Validate multiple paths at once. Returns the first validation failure,
 * or { valid: true } if all paths pass.
 */
function validatePaths(...inputPaths) {
  for (const p of inputPaths) {
    const result = validatePath(p);
    if (!result.valid) return result;
  }
  return { valid: true };
}

module.exports = {
  validatePath,
  validatePaths,
  FORBIDDEN_DIR_COMPONENTS,
  FORBIDDEN_PREFIXES,
};

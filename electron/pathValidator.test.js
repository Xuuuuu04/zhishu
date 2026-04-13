const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const { validatePath, validatePaths } = require('./pathValidator');

const HOME = os.homedir();
const TMP = os.tmpdir();

// ─── Basic validation ────────────────────────────────────────────────────────

test('rejects non-string input', () => {
  assert.deepStrictEqual(validatePath(null), { valid: false, error: 'Invalid path: must be a non-empty string' });
  assert.deepStrictEqual(validatePath(undefined), { valid: false, error: 'Invalid path: must be a non-empty string' });
  assert.deepStrictEqual(validatePath(123), { valid: false, error: 'Invalid path: must be a non-empty string' });
  assert.deepStrictEqual(validatePath(''), { valid: false, error: 'Invalid path: must be a non-empty string' });
});

test('accepts a normal home-directory path', () => {
  const result = validatePath(path.join(HOME, 'projects', 'my-app', 'src', 'index.js'));
  assert.equal(result.valid, true);
  assert.equal(result.resolved, path.join(HOME, 'projects', 'my-app', 'src', 'index.js'));
});

test('accepts a temp-directory path', () => {
  const result = validatePath(path.join(TMP, 'zhishu-build-12345', 'output.png'));
  assert.equal(result.valid, true);
});

// ─── Path traversal prevention ───────────────────────────────────────────────

test('blocks traversal to /etc/passwd via ../../', () => {
  // From home, traverse up to root and down to /etc
  const traversal = path.join(HOME, 'projects', '..', '..', '..', 'etc', 'passwd');
  const result = validatePath(traversal);
  assert.equal(result.valid, false);
  assert.ok(result.error.includes('restricted area'));
});

test('blocks traversal to /etc/shadow', () => {
  const traversal = path.join(HOME, '..', '..', 'etc', 'shadow');
  const result = validatePath(traversal);
  assert.equal(result.valid, false);
});

test('normalizes and resolves ../ within home directory', () => {
  // This is safe: /Users/foo/projects/../notes = /Users/foo/notes
  const normalized = path.join(HOME, 'projects', '..', 'notes', 'todo.txt');
  const result = validatePath(normalized);
  assert.equal(result.valid, true);
  assert.equal(result.resolved, path.join(HOME, 'notes', 'todo.txt'));
});

test('blocks deeply nested traversal escaping home', () => {
  const traversal = path.join(HOME, 'a', 'b', 'c', 'd', '..', '..', '..', '..', '..', 'System', 'Library');
  const result = validatePath(traversal);
  assert.equal(result.valid, false);
});

// ─── Sensitive directory blocking ────────────────────────────────────────────

test('blocks access to ~/.ssh', () => {
  const result = validatePath(path.join(HOME, '.ssh'));
  assert.equal(result.valid, false);
  assert.ok(result.error.includes('restricted area'));
});

test('blocks access to ~/.ssh/authorized_keys', () => {
  const result = validatePath(path.join(HOME, '.ssh', 'authorized_keys'));
  assert.equal(result.valid, false);
});

test('blocks access to ~/.ssh/id_rsa', () => {
  const result = validatePath(path.join(HOME, '.ssh', 'id_rsa'));
  assert.equal(result.valid, false);
});

test('blocks access to ~/.aws/credentials', () => {
  const result = validatePath(path.join(HOME, '.aws', 'credentials'));
  assert.equal(result.valid, false);
});

test('blocks access to ~/.aws/config', () => {
  const result = validatePath(path.join(HOME, '.aws', 'config'));
  assert.equal(result.valid, false);
});

test('blocks access to ~/.gnupg', () => {
  const result = validatePath(path.join(HOME, '.gnupg'));
  assert.equal(result.valid, false);
});

test('blocks access to ~/.gnupg/private-keys', () => {
  const result = validatePath(path.join(HOME, '.gnupg', 'private-keys-v1.d', 'abc.key'));
  assert.equal(result.valid, false);
});

test('blocks access to ~/.kube/config', () => {
  const result = validatePath(path.join(HOME, '.kube', 'config'));
  assert.equal(result.valid, false);
});

test('blocks access to ~/Library/Keychains/', () => {
  const result = validatePath(path.join(HOME, 'Library', 'Keychains', 'login.keychain-db'));
  assert.equal(result.valid, false);
});

// ─── System directory blocking ───────────────────────────────────────────────

test('blocks /etc directly', () => {
  const result = validatePath('/etc');
  assert.equal(result.valid, false);
});

test('blocks /etc/hosts', () => {
  const result = validatePath('/etc/hosts');
  assert.equal(result.valid, false);
});

test('blocks /System directly', () => {
  const result = validatePath('/System');
  assert.equal(result.valid, false);
});

test('blocks /System/Library/CoreServices', () => {
  const result = validatePath('/System/Library/CoreServices');
  assert.equal(result.valid, false);
});

test('blocks /private/var/', () => {
  const result = validatePath('/private/var/log/system.log');
  assert.equal(result.valid, false);
});

test('blocks /private/var directly', () => {
  const result = validatePath('/private/var');
  assert.equal(result.valid, false);
});

// ─── Non-home, non-temp paths blocked ────────────────────────────────────────

test('blocks /usr/local/bin', () => {
  const result = validatePath('/usr/local/bin/node');
  assert.equal(result.valid, false);
  assert.ok(result.error.includes('home or temp'));
});

test('blocks /var/log', () => {
  // /var is typically a symlink to /private/var on macOS
  // but resolved should be checked
  const result = validatePath('/var/log/system.log');
  // May resolve to /private/var which is blocked by prefix, or /var which is not home/tmp
  assert.equal(result.valid, false);
});

test('/tmp is blocked because it does not match os.tmpdir() on this system', () => {
  // On macOS, /tmp is a symlink to /private/tmp, but path.resolve does NOT follow symlinks.
  // os.tmpdir() typically returns /var/folders/... which is different from /tmp.
  // Therefore /tmp is correctly rejected as not being under home or temp.
  const result = validatePath('/tmp');
  assert.equal(result.valid, false);
});

// ─── Edge cases: false positives must not happen ─────────────────────────────

test('allows a file named .sshrc in home directory (not inside .ssh/)', () => {
  // ".sshrc" contains ".ssh" but is NOT inside a .ssh directory
  // However, the segment check should NOT match "/.sshrc" because:
  //   "/.sshrc" does not match "/.ssh/" or "/.ssh" followed by '/' or end
  // Actually "/.sshrc" contains "/.ssh" at the boundary...
  // Let's check: resolved = "/Users/foo/.sshrc"
  //   segment "/.ssh" is found at index 10 (after /Users/foo)
  //   after segment = "rc" which is not '' and not starting with '/'
  //   So it should NOT be blocked. Good.
  const result = validatePath(path.join(HOME, '.sshrc'));
  assert.equal(result.valid, true);
});

test('allows a directory named ssh (without dot) in home', () => {
  const result = validatePath(path.join(HOME, 'ssh', 'known_hosts'));
  assert.equal(result.valid, true);
});

test('allows .github directory (not in forbidden list)', () => {
  const result = validatePath(path.join(HOME, 'projects', 'repo', '.github', 'workflows', 'ci.yml'));
  assert.equal(result.valid, true);
});

test('allows .env file (not in forbidden list)', () => {
  const result = validatePath(path.join(HOME, 'projects', 'my-app', '.env'));
  assert.equal(result.valid, true);
});

test('allows .config directory (not in forbidden list)', () => {
  const result = validatePath(path.join(HOME, '.config', 'some-app', 'settings.json'));
  assert.equal(result.valid, true);
});

test('allows normal project .git directory (not blocked by file-system validator)', () => {
  const result = validatePath(path.join(HOME, 'projects', 'my-repo', '.git', 'config'));
  assert.equal(result.valid, true);
});

test('allows home directory itself', () => {
  const result = validatePath(HOME);
  assert.equal(result.valid, true);
});

test('allows a deeply nested project file', () => {
  const result = validatePath(path.join(HOME, 'work', 'company', 'project', 'src', 'components', 'App.tsx'));
  assert.equal(result.valid, true);
});

// ─── validatePaths (multi-path) ──────────────────────────────────────────────

test('validatePaths passes when all paths are valid', () => {
  const result = validatePaths(
    path.join(HOME, 'file1.txt'),
    path.join(HOME, 'file2.txt'),
  );
  assert.equal(result.valid, true);
});

test('validatePaths fails on first invalid path', () => {
  const result = validatePaths(
    path.join(HOME, 'safe.txt'),
    '/etc/passwd',
    path.join(HOME, 'other.txt'),
  );
  assert.equal(result.valid, false);
});

test('validatePaths fails when first argument is invalid', () => {
  const result = validatePaths(
    path.join(HOME, '.ssh', 'id_rsa'),
    path.join(HOME, 'safe.txt'),
  );
  assert.equal(result.valid, false);
});

// ─── Path normalization edge cases ───────────────────────────────────────────

test('handles redundant slashes gracefully', () => {
  const result = validatePath(HOME + '///projects///file.txt');
  assert.equal(result.valid, true);
  assert.equal(result.resolved, path.join(HOME, 'projects', 'file.txt'));
});

test('handles ./ in path', () => {
  const result = validatePath(HOME + '/./projects/./file.txt');
  assert.equal(result.valid, true);
  assert.equal(result.resolved, path.join(HOME, 'projects', 'file.txt'));
});

test('tilde ~ is NOT expanded by path.resolve', () => {
  // path.resolve does NOT expand ~. It treats ~ as a literal directory name
  // relative to CWD. Since CWD is under HOME, the resolved path ends up
  // being under HOME, so it passes validation. This is expected behavior —
  // paths should be pre-expanded by the caller.
  const result = validatePath('~/projects/file.txt');
  // The resolved path will be $CWD/~/projects/file.txt which IS under HOME
  // so it passes. This is fine — the file browser always sends full paths.
  assert.equal(result.valid, true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseGitStatus } = require('./gitStatus');

test('parses ahead/behind counts and dotted branch names', () => {
  const parsed = parseGitStatus([
    '## release/1.2.0...origin/release/1.2.0 [ahead 2, behind 1]',
    ' M src/App.jsx',
    'R  src/old.js -> src/new.js',
  ].join('\n'));

  assert.equal(parsed.branch, 'release/1.2.0');
  assert.equal(parsed.upstream, 'origin/release/1.2.0');
  assert.equal(parsed.ahead, 2);
  assert.equal(parsed.behind, 1);
  assert.deepEqual(parsed.files[0], {
    path: 'src/App.jsx',
    status: 'modified',
    x: ' ',
    y: 'M',
    staged: false,
  });
  assert.equal(parsed.files[1].status, 'renamed');
  assert.equal(parsed.files[1].staged, true);
});

test('parses initial repositories without upstream', () => {
  const parsed = parseGitStatus([
    '## No commits yet on main',
    'A  README.md',
    '?? src/index.js',
  ].join('\n'));

  assert.equal(parsed.branch, 'main');
  assert.equal(parsed.upstream, null);
  assert.equal(parsed.ahead, 0);
  assert.equal(parsed.behind, 0);
  assert.equal(parsed.files[0].status, 'added');
  assert.equal(parsed.files[1].status, 'untracked');
});

test('marks merge conflicts explicitly', () => {
  const parsed = parseGitStatus([
    '## feature/conflicts',
    'UU src/conflict.js',
    'AA src/also-conflicted.js',
  ].join('\n'));

  assert.equal(parsed.branch, 'feature/conflicts');
  assert.equal(parsed.files[0].status, 'conflicted');
  assert.equal(parsed.files[1].status, 'conflicted');
  assert.equal(parsed.files[0].staged, true);
});

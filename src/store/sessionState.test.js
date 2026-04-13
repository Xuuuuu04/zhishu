const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getFirstSessionId,
  hasSessionId,
  resolveProjects,
  resolveTheme,
  resolveActiveSessionId,
  removeSessionFromProjects,
  removeProjectFromProjects,
  getFallbackActiveSessionId,
} = require('./sessionState');

const projects = [
  {
    id: 'p1',
    sessions: [{ id: 's1' }, { id: 's2' }],
  },
  {
    id: 'p2',
    sessions: [{ id: 's3' }],
  },
];

test('falls back to the next remaining session when removing the active session', () => {
  const nextProjects = removeSessionFromProjects(projects, 'p1', 's2');
  assert.equal(getFallbackActiveSessionId(nextProjects, ['s2'], 's2'), 's1');
});

test('falls back to another project when deleting the active project', () => {
  const nextProjects = removeProjectFromProjects(projects, 'p1');
  assert.equal(getFallbackActiveSessionId(nextProjects, ['s1', 's2'], 's1'), 's3');
});

test('returns null only when no sessions remain', () => {
  assert.equal(getFirstSessionId([]), null);
  assert.equal(getFallbackActiveSessionId([], ['s1'], 's1'), null);
});

test('detects whether a session id still exists', () => {
  assert.equal(hasSessionId(projects, 's1'), true);
  assert.equal(hasSessionId(projects, 'missing'), false);
});

test('resolves the preferred active session when it still exists', () => {
  assert.equal(resolveActiveSessionId(projects, 's3'), 's3');
});

test('falls back to the first existing session when the preferred one is missing', () => {
  const sparseProjects = [
    { id: 'empty', sessions: [] },
    { id: 'real', sessions: [{ id: 's9' }] },
  ];
  assert.equal(resolveActiveSessionId(sparseProjects, 'missing'), 's9');
});

test('uses fallback projects only when the stored list is empty', () => {
  const fallback = [{ id: 'fallback', sessions: [{ id: 'sf' }] }];
  assert.equal(resolveProjects(projects, fallback), projects);
  assert.equal(resolveProjects([], fallback), fallback);
});

test('forces unsupported themes back to dark', () => {
  assert.equal(resolveTheme('dark'), 'dark');
  assert.equal(resolveTheme('light'), 'dark');
  assert.equal(resolveTheme(undefined), 'dark');
});

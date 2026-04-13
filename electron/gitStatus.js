const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

function parseBranchHeader(headerLine) {
  const headerRaw = headerLine.slice(3).trim();
  const parts = headerRaw.match(/^(.*?)(?:\s+\[([^\]]+)\])?$/);
  const head = (parts?.[1] || headerRaw).trim();
  const counts = parts?.[2] || '';

  const result = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
  };

  if (head.startsWith('No commits yet on ')) {
    result.branch = head.slice('No commits yet on '.length);
  } else if (head.startsWith('Initial commit on ')) {
    result.branch = head.slice('Initial commit on '.length);
  } else {
    const splitIndex = head.indexOf('...');
    if (splitIndex >= 0) {
      result.branch = head.slice(0, splitIndex);
      result.upstream = head.slice(splitIndex + 3).trim() || null;
    } else {
      result.branch = head;
    }
  }

  const ahead = counts.match(/ahead (\d+)/);
  const behind = counts.match(/behind (\d+)/);
  if (ahead) result.ahead = parseInt(ahead[1], 10);
  if (behind) result.behind = parseInt(behind[1], 10);

  return result;
}

function parseFileStatus(line) {
  const x = line[0];
  const y = line[1];
  const xy = `${x}${y}`;
  const filePath = line.slice(3);

  let status = 'modified';
  if (xy === '??') status = 'untracked';
  else if (xy === '!!') status = 'ignored';
  else if (CONFLICT_CODES.has(xy)) status = 'conflicted';
  else if (x === 'D' || y === 'D') status = 'deleted';
  else if (x === 'R' || y === 'R' || x === 'C' || y === 'C') status = 'renamed';
  else if (x === 'A' || y === 'A') status = 'added';

  return {
    path: filePath,
    status,
    x,
    y,
    staged: x !== ' ' && x !== '?',
  };
}

function parseGitStatus(stdout) {
  const lines = stdout.split('\n').filter(Boolean);
  const result = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    files: [],
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      Object.assign(result, parseBranchHeader(line));
      continue;
    }

    result.files.push(parseFileStatus(line));
  }

  return result;
}

module.exports = {
  parseGitStatus,
  parseBranchHeader,
  parseFileStatus,
};

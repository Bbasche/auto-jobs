import { execSync } from 'child_process';

function readGit(command, cwd) {
  try {
    return execSync(command, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    }).trim();
  } catch {
    return '';
  }
}

export function getGitMetadata(root = process.cwd()) {
  return {
    sha: readGit('git rev-parse --short HEAD', root),
    tag: readGit('git describe --tags --exact-match', root),
  };
}

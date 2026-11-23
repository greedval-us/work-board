import { spawnSync } from 'node:child_process';
import { PROJECT_ROOT } from './lib/runtime.mjs';

function gitPaths(args, { noMatches = false } = {}) {
  const result = spawnSync('git', args, { cwd: PROJECT_ROOT, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (noMatches && result.status === 1) return [];
  if (result.status !== 0) throw new Error(result.stderr || 'Git could not inspect the index.');
  return result.stdout.split('\0').filter(Boolean);
}

// Inspect the staged snapshot, including files added with git add --force.
const ignored = gitPaths(['ls-files', '--cached', '--ignored', '--exclude-per-directory=.gitignore', '-z']);
const credentials = [
  '-----BEGIN ([A-Z0-9 ]*PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----',
  'gh[pousr]_[[:alnum:]]{36,}|github_pat_[[:alnum:]_]{50,}',
  '(AKIA|ASIA)[A-Z0-9]{16}',
  'xox[baprs]-[[:alnum:]-]{20,}|sk-(proj-|svcacct-)?[[:alnum:]_-]{32,}',
];
const sensitive = gitPaths(['grep', '--cached', '-I', '-l', '-z', '-E',
  ...credentials.flatMap(pattern => ['-e', pattern]), '--', '.'], { noMatches: true });

for (const name of ignored) console.error('Excluded file in the Git index:', name);
for (const name of sensitive) console.error('Possible credential in the Git index:', name);
if (ignored.length || sensitive.length) process.exitCode = 1;
else console.log('Repository file and credential checks passed.');

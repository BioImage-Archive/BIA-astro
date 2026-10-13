import { readFile, realpath, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { sha256 } from './report.mjs';

export const MAX_INPUT_BYTES = 8 * 1024 * 1024;

export async function captureProvenance(root, files) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 });
  if (await realpath(git('rev-parse', '--show-toplevel').trim()) !== await realpath(root)) {
    throw new Error('Run the audit from the Git repository root');
  }
  const physicalRoot = await realpath(root);
  const hashes = {};
  for (const file of [...new Set(files)].sort()) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`Input outside repository: ${file}`);
    const stat = await lstat(file);
    if (!stat.isFile()) throw new Error(`Audit input must be a regular file: ${relative}`);
    if (stat.size > MAX_INPUT_BYTES) throw new Error(`Input exceeds ${MAX_INPUT_BYTES} bytes: ${relative}`);
    const physical = path.relative(physicalRoot, await realpath(file));
    if (physical === '..' || physical.startsWith(`..${path.sep}`) || path.isAbsolute(physical)) {
      throw new Error(`Input resolves outside repository: ${relative}`);
    }
    hashes[relative] = sha256(await readFile(file));
  }
  return {
    head: git('rev-parse', 'HEAD').trim(),
    trackedStatus: git('status', '--porcelain=v1', '--untracked-files=no'),
    inputHashes: hashes,
  };
}

export function inputsChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

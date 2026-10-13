import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const probe = fileURLToPath(new URL('../../scripts/dead-code/verify-tools.mjs', import.meta.url));

test('Installed Astro analyzers detect unused code and preserve template references', { timeout: 60_000 }, () => {
  // Exercise the same installed analyzers and configuration used by the audit runner.
  const result = spawnSync(process.execPath, [probe], {
    cwd: root, encoding: 'utf8', timeout: 45_000,
  });
  assert(!result.error && !result.signal, result.error?.message ?? result.signal);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS: Astro frontmatter, template references, client scripts, local CSS, style variables, parse failures\./);
});

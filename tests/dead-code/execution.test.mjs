import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execute } from '../../scripts/dead-code/execution.mjs';

test('execution preserves stdout, stderr and nonzero exit evidence', () => {
  const result = execute(process.execPath, ['-e', 'console.log("out"); console.error("err"); process.exitCode = 17;']);
  assert.equal(result.exitCode, 17);
  assert.equal(result.signal, null);
  assert.equal(result.error, null);
  assert.equal(result.stdout, 'out\n');
  assert.equal(result.stderr, 'err\n');
});

test('a timed-out analyzer cannot extend its deadline by handling SIGTERM', () => {
  // Self-exit bounds the negative case if the hard-kill policy regresses.
  const source = 'process.on("SIGTERM", () => {}); console.log("ready"); setTimeout(() => process.exit(0), 5000);';
  const result = execute(process.execPath, ['-e', source], { timeout: 1000 });
  assert.match(result.stdout, /ready/);
  assert.equal(result.exitCode, null);
  assert.equal(result.signal, 'SIGKILL');
  assert.match(result.error, /ETIMEDOUT/);
});

test('missing commands retain execution failure rather than a successful exit', () => {
  const result = execute('/bijux-unavailable-analyzer', []);
  assert.equal(result.exitCode, null);
  assert.match(result.error, /ENOENT/);
});

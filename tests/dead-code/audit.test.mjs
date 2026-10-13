import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const executable = fileURLToPath(new URL('../../scripts/dead-code/audit.mjs', import.meta.url));
const output = path.resolve('artifacts/dead-code-tests');
mkdirSync(output, { recursive: true });
const suiteRoot = mkdtempSync(path.join(output, 'audit-suite-'));
// Own both fixture repositories and their external-file test inputs. Keeping
// these files after testing would make the ordinary Astro check analyze them.
after(() => rmSync(suiteRoot, { recursive: true, force: true }));
const gitLookup = spawnSync('which', ['git'], { encoding: 'utf8' });
assert.equal(gitLookup.status, 0, 'Git is required for audit integration tests');
const gitBinary = gitLookup.stdout.trim();

function git(fixture, args) {
  const result = spawnSync(gitBinary, args, { cwd: fixture, encoding: 'utf8', timeout: 20_000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function fixture({ knip = { files: [], issues: [] }, eslint, knipExit = 0, duringScan = '' } = {}) {
  const root = mkdtempSync(path.join(suiteRoot, 'audit-contract-'));
  for (const folder of ['src', 'scripts/dead-code', 'configs/quality', 'bin', 'disabled-hooks']) {
    mkdirSync(path.join(root, folder), { recursive: true });
  }
  writeFileSync(path.join(root, '.gitignore'), '/node_modules/\n/artifacts/\n/bin/\n/disabled-hooks/\n');
  writeFileSync(path.join(root, 'package.json'), '{"name":"bijux-audit-fixture","private":true}');
  writeFileSync(path.join(root, 'package-lock.json'), '{}');
  writeFileSync(path.join(root, 'src/a.ts'), 'export const unchanged = 1;\n');
  writeFileSync(path.join(root, 'scripts/dead-code/verify-tools.mjs'), 'console.log("controlled probe");');
  for (const name of ['eslint.config.mjs', 'knip.json', 'tsconfig.dead-code.json']) {
    writeFileSync(path.join(root, 'configs/quality', name), '{}');
  }
  // Controlled analyzers isolate the wrapper contract; the real-tool probe is tested separately.
  for (const [name, output, exit] of [
    ['eslint', eslint ?? [{ filePath: path.join(root, 'src/a.ts'), messages: [] }], 0],
    ['knip', knip, knipExit],
  ]) {
    const folder = path.join(root, 'node_modules', name);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name, version: '0.0.0', bin: 'cli.cjs' }));
    writeFileSync(path.join(folder, 'cli.cjs'),
      `${name === 'knip' ? duringScan : ''}\n${name === 'eslint' && eslint === undefined
        ? "const path = require('node:path'); const files = require('node:fs').readdirSync('src').filter(file => /\\.(?:astro|[cm]?[jt]sx?)$/.test(file)); console.log(JSON.stringify(files.map(file => ({filePath: path.resolve('src', file), messages: []}))));"
        : `console.log(${JSON.stringify(JSON.stringify(output))});`} process.exitCode = ${exit};`);
  }
  git(root, ['init', '--quiet', '--template=']);
  git(root, ['config', 'user.name', 'Bijux audit fixture']);
  git(root, ['config', 'user.email', 'audit@example.invalid']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['config', 'core.hooksPath', path.join(root, 'disabled-hooks')]);
  git(root, ['add', '--', '.gitignore', 'package.json', 'package-lock.json', 'src', 'scripts', 'configs']);
  git(root, ['commit', '--quiet', '-m', 'test(audit): establish fixture inputs']);
  return root;
}

function run(root, flags = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [executable, ...flags], {
    cwd: root, encoding: 'utf8', timeout: 20_000, env: { ...process.env, ...extraEnv },
  });
  assert(!result.error && !result.signal, result.error?.message ?? result.signal);
  const log = readFileSync(path.join(root, 'artifacts/dead-codes.log'), 'utf8');
  const evidence = log.match(/See (artifacts\/dead-code\/[^/]+)\//)?.[1];
  assert(evidence, 'Human-readable report must identify its raw evidence');
  const report = JSON.parse(readFileSync(path.join(root, evidence, 'report.json'), 'utf8'));
  assert.equal(report.exitCode, result.status);
  return { ...result, log, report, evidence: path.join(root, evidence) };
}

function gitFailure(root, command, after = false, emptyInputs = false) {
  const shim = path.join(root, 'bin/git');
  writeFileSync(shim, `#!${process.execPath}
const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
const label = args[0] === 'rev-parse' ? (args[1] === 'HEAD' ? 'head' : 'root') : args[0] === 'ls-files' ? 'inputs' : 'status';
if (label === ${JSON.stringify(command)}) {
  const countFile = 'artifacts/git-command-count';
  const count = existsSync(countFile) ? Number(readFileSync(countFile, 'utf8')) + 1 : 1;
  writeFileSync(countFile, String(count));
  if (${after ? 'count > 1' : 'true'}) {
    ${emptyInputs ? 'process.exit(0);' : 'console.error("controlled Git failure"); process.exit(17);'}
  }
}
const result = spawnSync(${JSON.stringify(gitBinary)}, args, { encoding: 'utf8' });
process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 2);
`);
  chmodSync(shim, 0o755);
  return { PATH: path.join(root, 'bin') + path.delimiter + process.env.PATH };
}

test('Stable complete provenance and candidate exit codes are preserved', () => {
  for (const [knip, flags, exit] of [
    [{ files: [], issues: [] }, [], 0],
    [{ files: [], issues: [{ file: 'src/a.ts', exports: [{ name: 'unchanged', line: 1, col: 14 }] }] }, [], 1],
    [{ files: [], issues: [{ file: 'src/a.ts', exports: [{ name: 'unchanged' }] }] }, ['--report-only'], 0],
  ]) {
    const root = fixture({ knip });
    writeFileSync(path.join(root, 'src/untracked.ts'), 'export const present = 2;\n');
    const result = run(root, flags);
    assert.equal(result.status, exit, result.log);
    assert(result.report.stages.every(stage => stage.state === 'COMPLETED'));
    assert.equal(result.report.gitHead, result.report.gitHeadAfter);
    assert.deepEqual(result.report.inputHashesBefore, result.report.inputHashesAfter);
    assert(result.report.inputHashesBefore['src/untracked.ts']);
    assert.deepEqual(result.report.hashes, result.report.hashesAfter);
    assert(!Object.values(result.report.hashes).includes(null));
  }
});

for (const command of ['root', 'head', 'status', 'inputs']) {
  for (const after of [false, true]) {
    test(`Git ${command} failure ${after ? 'after' : 'before'} scanning is incomplete in both modes`, () => {
      for (const flags of [[], ['--report-only']]) {
        const root = fixture();
        const result = run(root, flags, gitFailure(root, command, after));
        assert.equal(result.status, 2, result.log);
        assert.equal(result.report.completeness, 'INCOMPLETE');
        const stage = result.report.stages.find(item => item.name === `provenance-${after ? 'after' : 'before'}`);
        assert.equal(stage.state, 'FAILED');
        assert.match(stage.error, /Git .* failed/);
        assert(result.report.stages.filter(item => ['eslint', 'knip'].includes(item.name))
          .every(item => item.state === (after ? 'COMPLETED' : 'SKIPPED')));
        assert.match(readFileSync(path.join(result.evidence, `${stage.name}.${command}.stderr.log`), 'utf8'), /controlled Git failure/);
      }
    });
  }
}

test('Empty Git input enumeration cannot establish completeness', () => {
  const root = fixture();
  const result = run(root, ['--report-only'], gitFailure(root, 'inputs', false, true));
  assert.equal(result.status, 2);
  assert.match(result.log, /zero audit inputs/);
});

test('Unreadable source inputs and missing required configuration are incomplete', () => {
  for (const flags of [[], ['--report-only']]) {
    const root = fixture();
    symlinkSync('nonexistent.ts', path.join(root, 'src/unreadable.ts'));
    const result = run(root, flags);
    assert.equal(result.status, 2);
    assert.match(result.log, /provenance-before: FAILED/);
    assert.equal(result.report.inputHashesBefore, null);
  }
  const root = fixture({ duringScan: "require('node:fs').unlinkSync('configs/quality/knip.json');" });
  const result = run(root, ['--report-only']);
  assert.equal(result.status, 2);
  assert.match(result.log, /provenance-after: FAILED/);
});

test('Non-regular tracked inputs fail provenance without waiting for a writer', () => {
  for (const flags of [[], ['--report-only']]) {
    const root = fixture({ knip: { files: [], issues: [{ file: 'src/a.ts', exports: [{ name: 'unchanged', line: 1, col: 14 }] }] } });
    const input = path.join(root, 'src/a.ts');
    unlinkSync(input);
    const createPipe = spawnSync('mkfifo', [input], { encoding: 'utf8', timeout: 5_000 });
    assert.equal(createPipe.status, 0, createPipe.stderr);
    const result = spawnSync(process.execPath, [executable, ...flags], {
      cwd: root, encoding: 'utf8', timeout: 5_000,
    });
    assert(!result.error && !result.signal, result.error?.message ?? result.signal);
    assert.equal(result.status, 2, result.stdout);
    const log = readFileSync(path.join(root, 'artifacts/dead-codes.log'), 'utf8');
    assert.match(log, /Audit input must be a regular file: src\/a\.ts/);
    assert.match(log, /Status: INCOMPLETE/);
    assert.match(log, /provenance-before: FAILED/);
    assert.match(log, /provenance-after: FAILED/);
    unlinkSync(input);
  }
});

test('Changed source content and changed HEAD are incomplete even in report-only mode', () => {
  for (const duringScan of [
    "require('node:fs').writeFileSync('src/a.ts', 'export const changed = 2;');",
    `const result = require('node:child_process').spawnSync(${JSON.stringify(gitBinary)}, ['commit', '--quiet', '--allow-empty', '-m', 'test(audit): change fixture head']); if (result.status !== 0) throw new Error('Fixture commit failed');`,
  ]) {
    const root = fixture({ duringScan });
    const result = run(root, ['--report-only']);
    assert.equal(result.status, 2);
    assert.match(result.log, /inputs or HEAD changed/);
  }
});

test('Nested malformed analyzer output fails and retains raw evidence in both modes', () => {
  for (const tool of ['knip', 'eslint']) {
    for (const flags of [[], ['--report-only']]) {
      const knip = { files: [], issues: [{ file: 'src/a.ts', exports: ['invalid'] }] };
      const eslint = [{ filePath: 'src/a.ts', messages: [{ message: 'invalid', line: '1' }] }];
      const root = fixture(tool === 'knip' ? { knip } : { eslint });
      const result = run(root, flags);
      assert.equal(result.status, 2, result.log);
      assert.match(result.log, new RegExp(`${tool}: FAILED`));
      const raw = JSON.parse(readFileSync(path.join(result.evidence, `${tool}.stdout.log`), 'utf8'));
      assert.deepEqual(raw, tool === 'knip' ? knip : eslint);
      assert(result.report.stages.find(item => item.name === tool).error);
      assert.match(readFileSync(path.join(root, 'src/a.ts'), 'utf8'), /unchanged/);
    }
  }
});

test('Unknown command flags are configuration failures', () => {
  const result = spawnSync(process.execPath, [executable, '--fix'], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown argument: --fix/);
});

test('Unavailable tools still produce the requested log and a failure status', () => {
  const root = fixture();
  for (const name of ['eslint', 'knip']) {
    writeFileSync(path.join(root, 'node_modules', name, 'package.json'), JSON.stringify({ name, exports: {} }));
  }
  const result = run(root);
  assert.equal(result.status, 2);
  assert.match(result.log, /eslint: FAILED/);
  assert.match(result.log, /knip: FAILED/);
  assert.match(readFileSync(path.join(root, 'src/a.ts'), 'utf8'), /unchanged/);
});

test('An analyzer failure without JSON findings is not a clean report', () => {
  const root = fixture({ knipExit: 1 });
  const result = run(root, ['--report-only']);
  assert.equal(result.status, 2);
  assert.match(result.log, /knip: FAILED/);
  assert.match(result.log, /without active normalized findings/);
  assert(readdirSync(result.evidence).includes('knip.failure.log'));
});

test('A nested directory cannot borrow the parent repository provenance', () => {
  const root = fixture();
  const nested = path.join(root, 'nested');
  mkdirSync(path.join(nested, 'src'), { recursive: true });
  writeFileSync(path.join(nested, 'package.json'), '{"private":true}');
  const result = run(nested, ['--report-only']);
  assert.equal(result.status, 2);
  assert.match(result.log, /not the Git repository root/);
});


test('A partial ESLint source inventory is incomplete in both modes', () => {
  for (const flags of [[], ['--report-only']]) {
    const root = fixture({ eslint: [{ filePath: 'src/a.ts', messages: [] }] });
    writeFileSync(path.join(root, 'src/omitted.ts'), 'export const live = 1;\n');
    const result = run(root, flags);
    assert.equal(result.status, 2);
    assert.match(result.log, /ESLint omitted selected source inputs: src\/omitted.ts/);
  }
});

test('Rejected source symlinks launch no analyzers and copy no external bytes into evidence', () => {
  for (const flags of [[], ['--report-only', '--with-astro-check']]) {
    const root = fixture();
    const outside = path.join(path.dirname(root), 'outside-input.ts');
    const privateContent = 'PRIVATE_CONTENT_OUTSIDE_THE_AUDIT_REPOSITORY';
    writeFileSync(outside, `const external = "${privateContent}";\n`);
    symlinkSync(outside, path.join(root, 'src/external.ts'));
    // Every executable leaves evidence if launched. The ESLint output would
    // include the rejected source bytes, just as its real JSON reporter does.
    const marker = "require('node:fs').writeFileSync('artifacts/analyzer-launched', 'yes');";
    for (const name of ['eslint', 'knip']) {
      const cli = path.join(root, 'node_modules', name, 'cli.cjs');
      writeFileSync(cli, marker + readFileSync(cli, 'utf8'));
    }
    const probe = path.join(root, 'scripts/dead-code/verify-tools.mjs');
    writeFileSync(probe, "import { writeFileSync } from 'node:fs'; writeFileSync('artifacts/probe-launched', 'yes');");
    writeFileSync(path.join(root, 'node_modules/eslint/cli.cjs'), marker +
      `console.log(JSON.stringify([{filePath: 'src/external.ts', source: ${JSON.stringify(privateContent)}, messages: [{ruleId:'@typescript-eslint/no-unused-vars', message:'unused', line:1, column:7}]}]));`);
    const result = run(root, flags);
    assert.equal(result.status, 2);
    assert.match(result.log, /Input resolves outside repository: src\/external.ts/);
    assert.equal(result.report.inputHashesBefore, null);
    assert(result.report.stages.filter(stage => !stage.name.startsWith('provenance-'))
      .every(stage => stage.state === 'SKIPPED'));
    assert(!readdirSync(path.join(root, 'artifacts')).includes('analyzer-launched'));
    assert(!readdirSync(path.join(root, 'artifacts')).includes('probe-launched'));
    for (const file of readdirSync(result.evidence)) {
      assert(!readFileSync(path.join(result.evidence, file), 'utf8').includes(privateContent), file);
    }
    assert(!result.log.includes(privateContent));
  }
});

test('Source excerpts reject a symlink introduced after successful initial provenance', () => {
  const privateContent = 'PRIVATE_CONTENT_OUTSIDE_THE_AUDIT_REPOSITORY';
  const root = fixture({
    knip: { files: [], issues: [{ file: 'src/a.ts', exports: [{ name: 'unchanged', line: 1, col: 14 }] }] },
    duringScan: "const fs = require('node:fs'); fs.unlinkSync('src/a.ts'); fs.symlinkSync(require('node:path').join(process.cwd(), '../outside-excerpt.ts'), 'src/a.ts');",
  });
  writeFileSync(path.join(path.dirname(root), 'outside-excerpt.ts'), `const external = "${privateContent}";\n`);
  const result = run(root, ['--report-only']);
  assert.equal(result.status, 2);
  assert.equal(result.report.stages.find(stage => stage.name === 'provenance-before').state, 'COMPLETED');
  assert.equal(result.report.stages.find(stage => stage.name === 'provenance-after').state, 'FAILED');
  assert.match(result.log, /Input resolves outside repository: src\/a\.ts/);
  assert(!result.log.includes(privateContent));
});

test('Source excerpts do not wait on a pipe introduced after initial provenance', () => {
  const root = fixture({
    knip: { files: [], issues: [{ file: 'src/a.ts', exports: [{ name: 'unchanged', line: 1, col: 14 }] }] },
    duringScan: "require('node:fs').unlinkSync('src/a.ts'); const result = require('node:child_process').spawnSync('mkfifo', ['src/a.ts']); if (result.status !== 0) throw new Error('Fixture pipe creation failed');",
  });
  const result = spawnSync(process.execPath, [executable, '--report-only'], {
    cwd: root, encoding: 'utf8', timeout: 5_000,
  });
  assert(!result.error && !result.signal, result.error?.message ?? result.signal);
  assert.equal(result.status, 2);
  const log = readFileSync(path.join(root, 'artifacts/dead-codes.log'), 'utf8');
  assert.match(log, /provenance-before: COMPLETED/);
  assert.match(log, /knip: COMPLETED/);
  assert.match(log, /Audit input must be a regular file: src\/a\.ts/);
  assert.match(log, /Status: INCOMPLETE/);
  unlinkSync(path.join(root, 'src/a.ts'));
});

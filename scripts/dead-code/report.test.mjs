import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { eslintFindings, knipFindings, renderFindings, reportExitCode } from './report.mjs';

const root = '/work/BIA-astro';
const eslintData = [{
  filePath: `${root}/src/layouts/BaseLayout.astro`,
  messages: [{ ruleId: '@typescript-eslint/no-unused-vars', line: 4, column: 8,
    endLine: 4, message: "'DataTable' is defined but never used." }],
}];
const noStagesFailed = [{ state: 'COMPLETED', exitCode: 0 }];

test('Knip preserves scripts loaded by live study and search components', () => {
  const browserScripts = [
    ['src/components/ViewableImageTable.astro', './ViewableImageTable.js', 'src/components/ViewableImageTable.js'],
    ['src/components/search/Search.astro', './search-results.js', 'src/components/search/search-results.js'],
  ];
  for (const [component, source] of browserScripts) {
    assert(readFileSync(component, 'utf8').includes(`<script src="${source}">`), `${component}: script contract changed`);
  }
  const require = createRequire(import.meta.url);
  const packageFile = require.resolve('knip/package.json');
  const info = JSON.parse(readFileSync(packageFile, 'utf8'));
  const executable = path.join(path.dirname(packageFile), info.bin.knip);
  const run = spawnSync(process.execPath, [executable, '--config', 'configs/quality/knip.json', '--reporter', 'json'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 30_000,
  });
  assert(!run.error && !run.signal, run.error?.message ?? run.signal);
  assert([0, 1].includes(run.status), run.stderr);
  const data = JSON.parse(run.stdout);
  for (const [, , file] of browserScripts) {
    assert(!data.files.includes(file), `Live browser script reported unreachable: ${file}`);
  }
});

test('ESLint source location and message survive normalization', () => {
  const [item] = eslintFindings(eslintData, root);
  assert.equal(item.file, 'src/layouts/BaseLayout.astro');
  assert.equal(item.line, 4);
  assert.equal(item.column, 8);
  assert.equal(item.status, 'REVIEW_CANDIDATE');
});

test('Fatal parse errors are diagnostics, not dead-code candidates', () => {
  const items = eslintFindings([{ filePath: `${root}/src/bad.astro`, messages: [
    { fatal: true, ruleId: null, message: 'Parsing error', line: 2, column: 1 },
  ] }], root);
  assert.equal(items[0].status, 'ANALYSIS_DIAGNOSTIC');
  assert.equal(reportExitCode(items, noStagesFailed), 2);
});

test('Missing rule definitions cannot become successful report-only scans', () => {
  const items = eslintFindings([{ filePath: `${root}/src/a.ts`, messages: [
    { ruleId: 'missing-rule', severity: 2, message: "Definition for rule 'missing-rule' was not found." },
  ] }], root);
  assert.equal(items[0].status, 'ANALYSIS_DIAGNOSTIC');
  assert.equal(reportExitCode(items, noStagesFailed, true), 2);
});

test('Suppressed findings remain visible and do not count as active findings', () => {
  const data = [{ filePath: `${root}/src/a.ts`, messages: [], suppressedMessages: [
    { ruleId: '@typescript-eslint/no-unused-vars', message: 'unused', line: 1,
      suppressions: [{ kind: 'directive', justification: 'public interface' }] },
  ] }];
  const items = eslintFindings(data, root);
  assert.equal(items[0].status, 'SUPPRESSED_REVIEW');
  assert.match(renderFindings(items, () => null), /public interface/);
  assert.equal(reportExitCode(items, noStagesFailed), 0);
});

test('Whole-file Knip findings do not invent line 1', () => {
  const items = knipFindings({ files: ['src/Unused.astro'], issues: [] }, root);
  assert.equal(items[0].line, null);
  assert.match(renderFindings(items, () => ''), /file level; line not supplied/);
});

test('Knip exports and dependency positions survive', () => {
  const items = knipFindings({ files: [], issues: [
    { file: 'src/lib.ts', exports: [{ name: 'unusedFn', line: 5, col: 17 }] },
    { file: 'package.json', devDependencies: [{ name: 'unused-pkg', line: 24, col: 5 }] },
  ] }, root);
  assert.equal(items.length, 2);
  assert.equal(items[0].column, 17);
  assert.equal(items[1].kind, 'devDependencies');
});

test('Nested enum and class members are retained', () => {
  const items = knipFindings({ files: [], issues: [{ file: 'src/a.ts',
    enumMembers: { Mode: [{ name: 'old', line: 4, col: 1 }] },
    classMembers: { Service: [{ name: 'oldMethod', line: 8, col: 2 }] },
  }] }, root);
  assert.match(items[0].message, /Mode.old/);
  assert.match(items[1].message, /Service.oldMethod/);
});

test('Unresolved and unlisted imports and duplicate exports are not labeled dead', () => {
  const items = knipFindings({ files: [], issues: [{ file: 'src/a.ts',
    unresolved: [{ name: './missing', line: 1 }],
    unlisted: [{ name: 'missing-package' }],
    duplicates: [[{ name: 'default', line: 3 }, { name: 'other', line: 4 }]],
  }] }, root);
  assert.equal(items.length, 4);
  assert(items.every(item => item.status === 'ANALYSIS_DIAGNOSTIC'));
  assert.equal(reportExitCode(items, noStagesFailed), 2);
});

test('Malformed data and changed schemas fail loudly', () => {
  assert.throws(() => eslintFindings({}, root));
  assert.throws(() => eslintFindings([{ filePath: 'a' }], root));
  assert.throws(() => knipFindings({}, root));
  assert.throws(() => knipFindings({ files: [], issues: [{ file: 'a', newCategory: [] }] }, root));
});

test('Rendering adds actual source excerpts', () => {
  const items = eslintFindings(eslintData, root);
  const text = renderFindings(items, () => "---\n// one\n// two\nimport DataTable from 'datatables.net-dt';\n---");
  assert.match(text, /4 \| import DataTable/);
  assert.match(text, /4:8/);
});

test('Exit codes distinguish findings from a failed audit, even in report-only mode', () => {
  const items = eslintFindings(eslintData, root);
  assert.equal(reportExitCode([], noStagesFailed), 0);
  assert.equal(reportExitCode(items, noStagesFailed), 1);
  assert.equal(reportExitCode(items, noStagesFailed, true), 0);
  assert.equal(reportExitCode([], [{ state: 'FAILED' }], true), 2);
  assert.equal(reportExitCode([{ kind: 'unresolved', status: 'ANALYSIS_DIAGNOSTIC' }], noStagesFailed, true), 2);
});

test('Unknown command flags are configuration failures', () => {
  const executable = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audit.mjs');
  const run = spawnSync(process.execPath, [executable, '--fix'], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Unknown argument: --fix/);
});

test('Failed/missing tools still produce the requested log and a failure status', () => {
  // Shadow parent packages so this fixture cannot borrow the repository's analyzers.
  const fixtureRoot = path.resolve('artifacts/dead-code-tests');
  mkdirSync(fixtureRoot, { recursive: true });
  const temp = mkdtempSync(path.join(fixtureRoot, 'unavailable-tools-'));
  for (const name of ['eslint', 'knip']) {
    const folder = path.join(temp, 'node_modules', name);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name, exports: {} }));
  }
  mkdirSync(path.join(temp, 'src'));
  writeFileSync(path.join(temp, 'package.json'), '{"name":"audit-fixture","private":true}');
  const sourcePath = path.join(temp, 'src', 'untouched.astro');
  const content = '---\nconst keepThis = 1;\n---\n<p>{keepThis}</p>\n';
  writeFileSync(sourcePath, content);
  const executable = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audit.mjs');
  const run = spawnSync(process.execPath, [executable], { cwd: temp, encoding: 'utf8', timeout: 20_000 });
  assert.equal(run.status, 2, run.stderr);
  const log = readFileSync(path.join(temp, 'artifacts', 'dead-codes.log'), 'utf8');
  assert.match(log, /Status: INCOMPLETE/);
  assert.match(log, /eslint: FAILED/);
  assert.match(log, /knip: FAILED/);
  assert.equal(readFileSync(sourcePath, 'utf8'), content);
});

test('An analyzer failure without JSON findings is not a clean report', () => {
  const fixtureRoot = path.resolve('artifacts/dead-code-tests');
  mkdirSync(fixtureRoot, { recursive: true });
  const fixture = mkdtempSync(path.join(fixtureRoot, 'empty-analyzer-failure-'));
  mkdirSync(path.join(fixture, 'src'));
  mkdirSync(path.join(fixture, 'scripts/dead-code'), { recursive: true });
  writeFileSync(path.join(fixture, 'package.json'), '{"private":true}');
  writeFileSync(path.join(fixture, 'scripts/dead-code/verify-tools.mjs'), 'console.log("simulated probe");');
  for (const name of ['eslint', 'knip']) {
    const folder = path.join(fixture, 'node_modules', name);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name, version: '0.0.0', bin: 'cli.cjs' }));
    const data = name === 'eslint' ? [{ filePath: path.join(fixture, 'src/a.ts'), messages: [] }] :
      { files: [], issues: [] };
    writeFileSync(path.join(folder, 'cli.cjs'),
      `console.log(${JSON.stringify(JSON.stringify(data))}); process.exitCode = ${name === 'knip' ? 1 : 0};`);
  }
  const executable = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audit.mjs');
  const run = spawnSync(process.execPath, [executable, '--report-only'], {
    cwd: fixture, encoding: 'utf8', timeout: 20_000,
  });
  assert.equal(run.status, 2, run.stderr);
  const log = readFileSync(path.join(fixture, 'artifacts/dead-codes.log'), 'utf8');
  assert.match(log, /knip: FAILED/);
  assert.match(log, /without active normalized findings/);
});

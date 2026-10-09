import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parse } from '@astrojs/compiler';
import { is, walk } from '@astrojs/compiler/utils';
import { eslintFindings, knipFindings, renderFindings, reportExitCode } from './report.mjs';

const root = '/work/BIA-astro';
const eslintData = [{
  filePath: `${root}/src/layouts/BaseLayout.astro`,
  messages: [{ ruleId: '@typescript-eslint/no-unused-vars', line: 4, column: 8,
    endLine: 4, message: "'DataTable' is defined but never used." }],
}];
const noStagesFailed = [{ state: 'COMPLETED', exitCode: 0 }];

async function scriptSources(source) {
  const { ast } = await parse(source);
  const sources = [];
  walk(ast, node => {
    if (is.element(node) && node.name === 'script') {
      const attribute = node.attributes.find(item => item.name === 'src' && item.kind === 'quoted');
      if (attribute) sources.push(attribute.value);
    }
  });
  return sources;
}

test('Script entry contracts use parsed attributes rather than tag formatting', async () => {
  for (const source of [
    '<script src="./entry.js"></script>',
    "<script src='./entry.js'></script>",
    '<script\n type="module"\n src = "./entry.js"\n></script>',
  ]) {
    assert.deepEqual(await scriptSources(source), ['./entry.js']);
  }
  assert.deepEqual(await scriptSources('<!-- <script src="./entry.js"></script> -->'), []);
  assert.deepEqual(await scriptSources('<script src="./other.js"></script>'), ['./other.js']);
});

test('Knip preserves scripts loaded by live study and search components', async () => {
  const browserScripts = [
    ['src/components/ViewableImageTable.astro', './ViewableImageTable.js', 'src/components/ViewableImageTable.js'],
    ['src/components/search/Search.astro', './search-results.js', 'src/components/search/search-results.js'],
  ];
  for (const [component, source] of browserScripts) {
    assert((await scriptSources(readFileSync(component, 'utf8'))).includes(source), `${component}: script contract changed`);
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

test('Astro fatal diagnostics preserve the parser-provided zero column', () => {
  const [item] = eslintFindings([{ filePath: `${root}/src/bad.astro`, messages: [
    { fatal: true, ruleId: null, message: 'Parsing error: Unknown token', line: 25, column: 0 },
  ] }], root);
  assert.equal(item.column, 0);
  assert.equal(item.status, 'ANALYSIS_DIAGNOSTIC');
  assert.equal(reportExitCode([item], noStagesFailed, true), 2);
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

test('Malformed nested Knip issue shapes are rejected', () => {
  const invalid = [
    { exports: ['not-an-issue-object'] },
    { exports: [null] },
    { exports: [{}] },
    { exports: [{ name: 12 }] },
    { exports: [{ name: ' ' }] },
    { exports: [{ name: 'unused', line: '2' }] },
    { exports: [{ name: 'unused', line: 0 }] },
    { exports: [{ name: 'unused', col: -1 }] },
    { exports: [{ name: 'unused', pos: 0.5 }] },
    { exports: [{ name: 'unused', line: null }] },
    { exports: [{ name: 'unused', unexpected: true }] },
    { enumMembers: [] },
    { enumMembers: { Mode: 'invalid' } },
    { classMembers: { Service: [null] } },
    { duplicates: [{ name: 'unused' }] },
    { duplicates: [['invalid']] },
    { owners: [null] },
  ];
  for (const fields of invalid) {
    assert.throws(() => knipFindings({ files: [], issues: [{ file: 'src/a.ts', ...fields }] }, root),
      undefined, JSON.stringify(fields));
  }
  assert.throws(() => knipFindings({ files: [], issues: [null] }, root));
  assert.throws(() => knipFindings({ files: [], issues: [], unexpected: [] }, root));
});

test('Knip accepts optional locations, zero-based offsets and ownership data', () => {
  const items = knipFindings({ files: [], issues: [{ file: 'src/a.ts',
    owners: [{ name: '@maintainer' }], binaries: [{ name: 'build-tool' }],
    exports: [{ name: 'unused', line: 1, col: 1, pos: 0 }],
  }] }, root);
  assert.equal(items[0].line, null);
  assert.equal(items[1].line, 1);
});

test('Malformed nested ESLint diagnostics and empty invalid file results are rejected', () => {
  for (const data of [
    [{ messages: [] }], [null],
    [{ filePath: 'src/a.ts', messages: [null] }],
    [{ filePath: 'src/a.ts', messages: [{ message: 'unused', line: '1' }] }],
    [{ filePath: 'src/a.ts', messages: [{ message: 'unused', fatal: 'false' }] }],
    [{ filePath: 'src/a.ts', messages: [], suppressedMessages: {} }],
  ]) assert.throws(() => eslintFindings(data, root));
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

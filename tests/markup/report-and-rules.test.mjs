import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import plugin, { inspectElement, tagName } from '../../scripts/markup/explicit-closing-tags.mjs';
import { normalizeMessages, auditExitCode, renderLog, sha256, isWorkerReport } from '../../scripts/markup/report.mjs';
import { astroFixtures, htmlFixtures } from '../../scripts/markup/probes.mjs';

const id = name => ({ type: 'JSXIdentifier', name });
function element(name, open, close = null, syntheticSelfClosing = false) {
  return {
    openingElement: { name: id(name), text: open, selfClosing: syntheticSelfClosing },
    closingElement: close === null ? null : { name: id(name), text: close },
  };
}
const inspect = node => inspectElement(node, n => n.text);

for (const name of ['div', 'section', 'main', 'article']) {
  test(`rule decision: unclosed ${name}`, () => assert.equal(inspect(element(name, `<${name}>`)).messageId, 'missingEnd'));
}
test('rule decision: explicitly closed container', () => assert.equal(inspect(element('div', '<div>', '</div>')), null));
test('rule decision: actual Astro self-closing source', () => assert.equal(inspect(element('Card', '<Card />')), null));
test('rule decision: synthetic selfClosing flag cannot hide missing close', () => assert.equal(inspect(element('section', '<section>', null, true)).name, 'section'));
test('rule decision: synthetic closing tag with no source text cannot hide missing close', () => assert.equal(inspect(element('div', '<div>', '')).name, 'div'));
test('rule decision: whitespace in actual closing tag', () => assert.equal(inspect(element('section', '<section>', '</section  >')), null));
test('rule decision: HTML voids need no closing tag', () => {
  for (const tag of ['img', 'br', 'input', 'link', 'meta', 'source']) assert.equal(inspect(element(tag, `<${tag}>`)), null);
});
test('rule decision: uppercase Link is not HTML link', () => assert.equal(inspect(element('Link', '<Link>')).name, 'Link'));
test('rule decision: SVG self-closing child', () => assert.equal(inspect(element('path', '<path d="M0 0" />')), null));
test('rule decision: optional li closure classified as policy', () => assert.equal(inspect(element('li', '<li>')).policyOnly, true));
test('rule decision: malformed matching-name raw close', () => assert.equal(inspect(element('div', '<div>', '</div class="x">')).name, 'div'));
test('rule decision: member component names are escaped literally', () => {
  const n = element('UI.Card', '<UI.Card>', '</UI.Card>');
  assert.equal(inspect(n), null);
  n.closingElement.text = '</UIXCard>';
  assert.equal(inspect(n).name, 'UI.Card');
});
test('name handling: member and namespace nodes', () => {
  assert.equal(tagName({ type: 'JSXMemberExpression', object: id('UI'), property: id('Card') }), 'UI.Card');
  assert.equal(tagName({ type: 'JSXNamespacedName', namespace: id('x'), name: id('node') }), 'x:node');
});
test('unknown tag AST fails explicitly', () => assert.throws(() => inspectElement({ openingElement: { name: { type: 'FutureAST' } } }, () => ''), /Unsupported/));
test('rule has no automatic fix', () => assert.equal(plugin.rules['explicit-closing-tags'].meta.fixable, undefined));
test('rule only applies to Astro parser service', () => assert.deepEqual(plugin.rules['explicit-closing-tags'].create({ sourceCode: { parserServices: {} } }), {}));
test('normalizer preserves original source location and policy distinction', () => {
  const f = normalizeMessages([{ filePath: 'src/A.astro', messages: [{ line: 8, column: 3, ruleId: 'markup/explicit-closing-tags', messageId: 'optionalEnd', message: 'test', severity: 2 }] }], 'astro-source')[0];
  assert.equal(f.line, 8); assert.equal(f.column, 3); assert.equal(f.category, 'READABILITY_POLICY');
});
test('source parser error marks further analysis incomplete', () => {
  const f = normalizeMessages([{ filePath: 'src/A.astro', messages: [{ line: 3, column: 2, fatal: true, message: 'Parse error', severity: 2 }] }], 'astro-source')[0];
  assert.equal(f.category, 'SOURCE_PARSE_ERROR'); assert.equal(f.parseIncomplete, true);
});
test('exit codes distinguish findings from execution failure', () => {
  assert.equal(auditExitCode({ failures: [], findings: [] }), 0);
  assert.equal(auditExitCode({ failures: [], findings: [{ severity: 2 }] }), 1);
  assert.equal(auditExitCode({ failures: ['missing tool'], findings: [] }), 2);
  assert.equal(auditExitCode({ failures: ['missing tool'], findings: [] }, true), 2);
  assert.equal(auditExitCode({ failures: [], findings: [{ severity: 2, parseIncomplete: true }] }, true), 2);
});
test('log records generated coordinates without inventing source mapping', () => {
  const log = renderLog({ timestamp: 'test', failures: [], findings: [{ file: 'dist/page.html', inputKind: 'generated-html', line: 1, column: 13, category: 'MARKUP_DIAGNOSTIC', rule: 'close-order', message: 'test' }], coverage: {}, versions: {} });
  assert.match(log, /NOT Astro source lines/); assert.match(log, /dist\/page.html/);
});
test('fingerprints are deterministic', () => { assert.equal(sha256('abc'), sha256('abc')); assert.notEqual(sha256('abc'), sha256('abd')); });
test('completed worker reports require stable provenance, probes and consistent input coverage', () => {
  const hash = sha256('<section>text</section>');
  const provenance = { head: 'a'.repeat(40), trackedStatus: '', inputHashes: { 'src/A.astro': hash } };
  const report = {
    timestamp: '2026-10-07T00:00:00Z', finished: '2026-10-07T00:00:01Z',
    evidenceDir: 'artifacts/markup/fixture', versions: { node: process.version }, gitHead: provenance.head,
    provenanceBefore: provenance, provenanceAfter: structuredClone(provenance),
    inputs: [{ file: 'src/A.astro', inputKind: 'astro-source', sha256: hash, bytes: 23 }],
    inventory: { 'astro-source': ['src/A.astro'], 'authored-html': [], 'generated-html': [] },
    probes: { astro: [{ passed: true }], html: [{ passed: true }] },
    coverage: { sourceAstro: 1, sourceHtml: 0, generatedHtml: 0, httpResponses: 0,
      sourceParseFailures: 0, renderedParseFailures: 0, renderedRequested: false, renderedStatus: 'NOT_REQUESTED' },
    findings: [], failures: [], exitCode: 0,
  };
  assert.equal(isWorkerReport(report), true);
  for (const invalidate of [
    r => { delete r.provenanceBefore; },
    r => { r.provenanceAfter.head = 'b'.repeat(40); },
    r => { r.gitHead = 'b'.repeat(40); },
    r => { r.inputs[0].sha256 = sha256('changed'); },
    r => { r.inputs = []; },
    r => { r.coverage.sourceAstro = 2; },
    r => { r.probes.astro[0].passed = false; },
    r => { r.coverage.renderedRequested = true; },
    r => { delete r.inventory; },
    r => { r.inventory['astro-source'].push('src/B.astro'); },
    r => { r.inventory['authored-html'].push('public/page.html'); },
    r => { r.inventory['generated-html'].push('built/page.html'); },
    r => { r.inventory['astro-source'].push('src/A.astro'); },
    r => { r.inputs.push(structuredClone(r.inputs[0])); r.coverage.sourceAstro = 2; },
  ]) {
    const invalid = structuredClone(report);
    invalidate(invalid);
    assert.equal(isWorkerReport(invalid), false);
  }
  const partial = structuredClone(report);
  delete partial.provenanceBefore;
  partial.failures.push('Provenance unavailable');
  partial.exitCode = 2;
  assert.equal(isWorkerReport(partial), true, 'Preserve partial failure evidence without claiming completion');
});
test('integration fixture inventory includes valid and broken examples', () => {
  assert.ok(astroFixtures.some(x => x[0] === 'missing nested div' && x[2]));
  assert.ok(astroFixtures.some(x => x[0] === 'comments are not tags' && !x[2]));
  assert.ok(htmlFixtures.some(x => x[0] === 'duplicate IDs' && x[2]));
  assert.ok(htmlFixtures.some(x => x[0] === 'rendered optional endings allowed' && !x[2]));
});
test('missing analyzers still write a failure report and return 2', async () => {
  await mkdir(path.resolve('artifacts/markup-tests'), { recursive: true });
  const dir = await mkdtemp(path.resolve('artifacts/markup-tests/checkout-'));
  try {
    await mkdir(path.join(dir, 'src'));
    await writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
    await writeFile(path.join(dir, 'src', 'A.astro'), '<div></div>');
    const runner = fileURLToPath(new URL('../../scripts/markup/audit.mjs', import.meta.url));
    const run = spawnSync(process.execPath, [runner], { cwd: dir, timeout: 15000, encoding: 'utf8' });
    assert.equal(run.status, 2, run.stderr);
    const log = await readFile(path.join(dir, 'artifacts', 'markup-issues.log'), 'utf8');
    assert.match(log, /Status: INCOMPLETE/);
    assert.match(log, /Astro analyzer/); assert.match(log, /HTML analyzer/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { HtmlValidate } from 'html-validate';
import { probeAstro, probeHtml } from '../../scripts/markup/probes.mjs';
import { captureProvenance, inputsChanged, MAX_INPUT_BYTES } from '../../scripts/markup/provenance.mjs';
import { normalizeMessages } from '../../scripts/markup/report.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runner = path.join(root, 'scripts/markup/audit.mjs');

async function checkout(action) {
  const parent = path.join(root, 'artifacts/markup-tests');
  await mkdir(parent, { recursive: true });
  const dir = await mkdtemp(path.join(parent, 'repository-'));
  try {
    await mkdir(path.join(dir, 'src/nested'), { recursive: true });
    await mkdir(path.join(dir, 'public'));
    await mkdir(path.join(dir, 'configs/quality'), { recursive: true });
    await cp(path.join(root, 'scripts/markup'), path.join(dir, 'scripts/markup'), { recursive: true });
    for (const name of ['eslint.markup.config.mjs', 'htmlvalidate.markup.json']) {
      await cp(path.join(root, 'configs/quality', name), path.join(dir, 'configs/quality', name));
    }
    await writeFile(path.join(dir, 'package.json'), '{"type":"module"}\n');
    await writeFile(path.join(dir, 'package-lock.json'), '{}\n');
    await writeFile(path.join(dir, 'src/A.astro'), '<section><div>OK</div></section>');
    await writeFile(path.join(dir, 'src/nested/B.astro'), '<main>nested</main>');
    await writeFile(path.join(dir, 'public/example.png'), 'coverage marker');
    await writeFile(path.join(dir, '.gitignore'), 'artifacts/\nnode_modules/\n');
    await symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
    git('init', '-q');
    // This isolated fixture HEAD tests provenance without changing application history.
    git('-c', 'core.hooksPath=.git/no-hooks', '-c', 'commit.gpgsign=false', '-c', 'user.name=Bijux Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'test fixture');
    await action(dir);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
async function run(dir, args = [], entry = runner) {
  const child = spawn(process.execPath, [entry, ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
  const status = await new Promise(resolve => child.on('close', resolve));
  clearTimeout(timer);
  const runs = await readdir(path.join(dir, 'artifacts/markup'));
  const latest = runs.sort().at(-1);
  const report = JSON.parse(await readFile(path.join(dir, 'artifacts/markup', latest, 'report.json'), 'utf8'));
  return { status, report, output };
}
async function server(action, handler) {
  const service = createServer(handler);
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  try { await action(`http://127.0.0.1:${service.address().port}`); }
  finally { service.closeAllConnections(); await new Promise(resolve => service.close(resolve)); }
}

test('installed Astro analyzer passes all valid and invalid source probes', async () => {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'configs/quality/eslint.markup.config.mjs'), fix: false, allowInlineConfig: false });
  const results = await probeAstro(eslint, path.join(root, 'src/markup-probe.astro'));
  assert.equal(results.length, 26);
  assert.deepEqual(results.filter(result => !result.passed), []);
});
test('installed HTML analyzer validates raw text, including browser-repairable errors', async () => {
  const config = JSON.parse(await readFile(path.join(root, 'configs/quality/htmlvalidate.markup.json'), 'utf8'));
  const results = await probeHtml(new HtmlValidate(config));
  assert.equal(results.length, 14);
  assert.deepEqual(results.filter(result => !result.passed), []);
  assert.equal((await new HtmlValidate({ ...config, rules: { ...config.rules, 'no-implicit-close': 'error' } }).validateString('<ul><li>one<li>two</ul>')).valid, false);
});
test('malformed analyzer reports cannot become a clean normalized inventory', () => {
  for (const value of [null, {}, [null], [{ filePath: 'x', messages: [{}] }], [{ filePath: 'x', messages: [{ severity: 2, message: 'x', line: '1' }] }]]) {
    assert.throws(() => normalizeMessages(value, 'astro-source'), /Malformed|must be an array/);
  }
});
test('source audit detects omissions, keeps original bytes, and counts excluded extensions once', async () => checkout(async dir => {
  const filename = path.join(dir, 'src/A.astro');
  const text = '<section><div>OK</div>';
  await writeFile(filename, text);
  const strict = await run(dir);
  assert.equal(strict.status, 1, strict.output);
  assert.equal(strict.report.findings.length, 1);
  assert.equal(strict.report.coverage.sourceAstro, 2);
  assert.equal(strict.report.coverage.otherSourceExtensions['.png'], 1);
  assert.equal(strict.report.coverage.renderedStatus, 'NOT_REQUESTED');
  assert.equal(await readFile(filename, 'utf8'), text);
  assert.deepEqual(strict.report.provenanceBefore, strict.report.provenanceAfter);
  const inventory = await run(dir, ['--report-only']);
  assert.equal(inventory.status, 0, inventory.output);
  assert.equal(inventory.report.findings.length, 1);
}));
test('source parsing failure remains incomplete in report-only mode', async () => checkout(async dir => {
  await writeFile(path.join(dir, 'src/A.astro'), '---\nconst value = ;\n---\n<div></div>');
  const result = await run(dir, ['--report-only']);
  assert.equal(result.status, 2, result.output);
  assert.ok(result.report.findings.some(finding => finding.parseIncomplete));
}));
test('missing or empty requested build output fails instead of skipping coverage', async () => checkout(async dir => {
  await mkdir(path.join(dir, 'empty'));
  for (const name of ['missing', 'empty']) {
    const result = await run(dir, ['--html-dir', name, '--report-only']);
    assert.equal(result.status, 2, result.output);
    assert.match(result.report.failures.join('\n'), /Generated HTML/);
  }
}));
test('nonregular selected source and output files make strict and report-only audits incomplete', async () => {
  for (const filename of ['src/unreadable.astro', 'public/unreadable.HTML', 'built/unreadable.html']) {
    await checkout(async dir => {
      const generated = filename.startsWith('built/');
      if (generated) {
        await mkdir(path.join(dir, 'built'));
        await writeFile(path.join(dir, 'built/valid.html'), '<main>generated</main>');
      }
      execFileSync('mkfifo', [path.join(dir, filename)]);
      for (const reportOnly of [false, true]) {
        const result = await run(dir, [
          ...(generated ? ['--html-dir', 'built'] : []),
          ...(reportOnly ? ['--report-only'] : []),
        ]);
        assert.equal(result.status, 2, result.output);
        assert.equal(result.report.execution.timedOut, false);
        assert.ok(result.report.failures.some(failure => failure.includes(`Audit input must be a regular file: ${filename}`)));
      }
    });
  }
});
test('generated raw HTML permits optional end tags but reports required closures and duplicate IDs', async () => checkout(async dir => {
  await mkdir(path.join(dir, 'built'));
  await writeFile(path.join(dir, 'built/optional.html'), '<ul><li>one<li>two</ul>');
  await writeFile(path.join(dir, 'built/broken.html'), '<section><div id="x"></div><div id="x"></div>');
  const result = await run(dir, ['--html-dir', 'built']);
  assert.equal(result.status, 1, result.output);
  assert.equal(result.report.coverage.generatedHtml, 2);
  assert.ok(result.report.findings.some(finding => finding.rule === 'no-dup-id'));
  assert.ok(result.report.findings.some(finding => finding.rule === 'close-order'));
  assert.ok(!result.report.findings.some(finding => finding.file.endsWith('optional.html')));
}));
test('timeout and unknown arguments remain incomplete in report-only mode', async () => checkout(async dir => {
  for (const args of [['--timeout-ms', '1', '--report-only'], ['--timeout-ms', '0', '--report-only'], ['--fix', '--report-only'], ['constructor', 'value', '--report-only']]) {
    const result = await run(dir, args);
    assert.equal(result.status, 2, result.output);
    assert.ok(result.report.failures.length > 0);
  }
}));
test('provenance detects changes to untracked audited files', async () => checkout(async dir => {
  const file = path.join(dir, 'src/A.astro');
  const before = await captureProvenance(dir, [file]);
  await writeFile(file, '<main>changed</main>');
  const after = await captureProvenance(dir, [file]);
  assert.equal(inputsChanged(before, after), true);
}));
test('HTTP audit rejects redirects, non-HTML, missing markers and malformed routes', async () => checkout(async dir => {
  const routes = [
    { path: '/redirect' }, { path: '/json' }, { path: '/html', mustContain: ['unrelated marker'] }, null,
  ];
  await writeFile(path.join(dir, 'routes.json'), JSON.stringify(routes));
  await server(async origin => {
    const result = await run(dir, ['--routes', 'routes.json', '--base-url', origin, '--report-only']);
    assert.equal(result.status, 2, result.output);
    assert.equal(result.report.failures.length, 4);
    assert.match(result.report.failures.join('\n'), /HTTP 302/);
    assert.match(result.report.failures.join('\n'), /not text\/html/);
    assert.match(result.report.failures.join('\n'), /marker missing/);
    assert.match(result.report.failures.join('\n'), /Invalid route/);
  }, (request, response) => {
    if (request.url === '/redirect') { response.writeHead(302, { Location: '/html' }); response.end(); }
    else if (request.url === '/json') { response.setHeader('Content-Type', 'application/json'); response.end('{}'); }
    else { response.setHeader('Content-Type', 'text/html'); response.end('<section>expected</section>'); }
  });
}));
test('empty HTTP bodies cannot count as checked HTML without page markers', async () => checkout(async dir => {
  await writeFile(path.join(dir, 'routes.json'), JSON.stringify([{ path: '/page', mustContain: [] }]));
  await server(async origin => {
    const result = await run(dir, ['--routes', 'routes.json', '--base-url', origin, '--report-only']);
    assert.equal(result.status, 2, result.output);
    assert.equal(result.report.coverage.httpResponses, 0);
    assert.match(result.report.failures.join('\n'), /Empty HTTP response body/);
  }, (request, response) => {
    assert.equal(request.url, '/page');
    response.setHeader('Content-Type', 'text/html');
    response.end(' \r\n\t');
  });
}));

test('HTTP audit retains raw response and detects source changing during the scan', async () => checkout(async dir => {
  await writeFile(path.join(dir, 'routes.json'), JSON.stringify([{ path: '/page', mustContain: ['expected'] }]));
  await server(async origin => {
    const result = await run(dir, ['--routes', 'routes.json', '--base-url', origin, '--report-only']);
    assert.equal(result.status, 2, result.output);
    assert.match(result.report.failures.join('\n'), /Input stability/);
    const response = result.report.inputs.find(input => input.inputKind === 'http-html');
    assert.equal(await readFile(path.join(dir, response.file), 'utf8'), '<section>expected</section>');
  }, async (request, response) => {
    assert.equal(request.url, '/page');
    await writeFile(path.join(dir, 'src/A.astro'), '<section>changed</section>');
    response.setHeader('Content-Type', 'text/html'); response.end('<section>expected</section>');
  });
}));

test('raw HTML tokenizer failure invalidates report-only completeness', async () => checkout(async dir => {
  await mkdir(path.join(dir, 'built'));
  await writeFile(path.join(dir, 'built/broken.html'), '<div title="unfinished</div>');
  const result = await run(dir, ['--html-dir', 'built', '--report-only']);
  assert.equal(result.status, 2, result.output);
  assert.ok(result.report.findings.some(finding => finding.category === 'INPUT_PARSE_ERROR' && finding.parseIncomplete));
  assert.equal(result.report.coverage.renderedStatus, 'INCOMPLETE');
}));
test('minified output excerpts are bounded around the actual diagnostic column', () => {
  const source = 'a'.repeat(2000) + '<div>' + 'b'.repeat(2000);
  const [finding] = normalizeMessages([{ filePath: 'built/page.html', source, messages: [{ line: 1, column: 2001, ruleId: 'close-order', message: 'Unclosed div', severity: 2 }] }], 'generated-html');
  assert.ok(finding.excerpt.length <= 282);
  assert.match(finding.excerpt, /<div>/);
  assert.equal(finding.column, 2001);
});

test('requested output symlinks cannot extend the scan beyond repository boundaries', async () => checkout(async dir => {
  await symlink(path.join(dir, 'public'), path.join(dir, 'linked-output'), 'dir');
  const result = await run(dir, ['--html-dir', 'linked-output', '--report-only']);
  assert.equal(result.status, 2, result.output);
  assert.match(result.report.failures.join('\n'), /symbolic link/);
}));

test('a tag containing ignored is an ordinary closure finding, not skipped coverage', async () => checkout(async dir => {
  await writeFile(path.join(dir, 'src/A.astro'), '<IgnoredCard><div>content</div>');
  const result = await run(dir);
  assert.equal(result.status, 1, result.output);
  assert.equal(result.report.failures.length, 0);
  assert.equal(result.report.coverage.sourceAstro, 2);
  assert.match(result.report.findings[0].message, /IgnoredCard/);
}));

test('a symlinked output ancestor cannot reach another repository', async () => checkout(async dir => {
  const outside = await mkdtemp(path.join(root, 'artifacts/markup-tests/output-'));
  try {
    await mkdir(path.join(outside, 'nested'));
    await writeFile(path.join(outside, 'nested/page.html'), '<main>outside</main>');
    await symlink(outside, path.join(dir, 'linked-output'), 'dir');
    const result = await run(dir, ['--html-dir', 'linked-output/nested', '--report-only']);
    assert.equal(result.status, 2, result.output);
    assert.equal(result.report.coverage.generatedHtml, 0);
    assert.match(result.report.failures.join('\n'), /outside repository/);
  } finally { await rm(outside, { recursive: true, force: true }); }
}));

test('malformed worker reports become incomplete instead of crashing the parent', async () => checkout(async dir => {
  for (const report of [[], {}, { exitCode: 0, findings: [{}], failures: [], coverage: {}, versions: {} },
    { exitCode: 0, findings: [], failures: [], coverage: { sourceAstro: 2, sourceHtml: 0, generatedHtml: 0, httpResponses: 0 }, versions: { node: 'fixture' } },
    { exitCode: 0, findings: [], failures: ['failed analysis'], coverage: { sourceAstro: 0, sourceHtml: 0, generatedHtml: 0, httpResponses: 0 }, versions: { node: 'fixture' } }]) {
    await writeFile(path.join(dir, 'scripts/markup/worker.mjs'), `import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const report = ${JSON.stringify(report)};
Object.assign(report, { timestamp: new Date().toISOString(), evidenceDir: path.relative(process.cwd(), process.env.BIJUX_MARKUP_EVIDENCE_DIR) });
await writeFile(path.join(process.env.BIJUX_MARKUP_EVIDENCE_DIR, 'report.json'), JSON.stringify(report));
`);
    const result = await run(dir, [], path.join(dir, 'scripts/markup/audit.mjs'));
    assert.equal(result.status, 2, result.output);
    assert.match(result.report.failures.join('\n'), /Malformed worker report/);
    assert.ok((await readFile(path.join(dir, result.report.evidenceDir, 'invalid-worker-report.txt'), 'utf8')).length);
  }
}));

test('uppercase authored HTML is validated rather than silently omitted', async () => checkout(async dir => {
  await writeFile(path.join(dir, 'public/broken.HTML'), '<section>unfinished');
  const result = await run(dir);
  assert.equal(result.status, 1, result.output);
  assert.equal(result.report.coverage.sourceHtml, 1);
  assert.ok(result.report.findings.some(finding => finding.file.endsWith('broken.HTML')));
}));

test('provenance enforces the input size limit before hashing large files', async () => checkout(async dir => {
  const filename = path.join(dir, 'src/oversized.astro');
  await writeFile(filename, ' '.repeat(MAX_INPUT_BYTES + 1));
  await assert.rejects(captureProvenance(dir, [filename]), /Input exceeds/);
  const result = await run(dir, ['--report-only']);
  assert.equal(result.status, 2, result.output);
  assert.match(result.report.failures.join('\n'), /Input provenance: Input exceeds/);
}));

test('artifact write failures return incomplete status with an actionable error', async () => checkout(async dir => {
  await writeFile(path.join(dir, 'artifacts'), 'not a directory');
  const result = spawnSync(process.execPath, [runner], { cwd: dir, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /Markup audit could not finish/);
  assert.match(result.stderr, /ENOTDIR/);
}));

test('selected generated output includes route directories named like source exclusions', async () => checkout(async dir => {
  await mkdir(path.join(dir, 'built'));
  await writeFile(path.join(dir, 'built/index.html'), '<main>home</main>');
  for (const name of ['artifacts', 'coverage', 'dist', 'node_modules']) {
    await mkdir(path.join(dir, 'built', name));
    await writeFile(path.join(dir, 'built', name, 'index.html'), '<section>unfinished');
  }
  const result = await run(dir, ['--html-dir', 'built']);
  assert.equal(result.status, 1, result.output);
  assert.equal(result.report.coverage.generatedHtml, 5);
  for (const name of ['artifacts', 'coverage', 'dist', 'node_modules']) {
    assert.ok(result.report.findings.some(finding => finding.file === `built/${name}/index.html`));
  }
}));

test('rejected streaming HTTP bodies are cancelled without consuming the worker deadline', async () => checkout(async dir => {
  await writeFile(path.join(dir, 'routes.json'), JSON.stringify([{ path: '/unavailable' }, { path: '/not-html' }, { path: '/page' }]));
  const rejected = [];
  const disconnected = [];
  await server(async origin => {
    const result = await run(dir, ['--routes', 'routes.json', '--base-url', origin, '--report-only', '--timeout-ms', '20000']);
    assert.equal(result.status, 2, result.output);
    assert.equal(result.report.execution.timedOut, false, result.output);
    assert.equal(result.report.coverage.httpResponses, 1);
    assert.match(result.report.failures.join('\n'), /HTTP 503/);
    assert.match(result.report.failures.join('\n'), /not text\/html/);
    assert.deepEqual(rejected.sort(), ['/not-html', '/unavailable']);
    assert.deepEqual(disconnected.sort(), rejected);
  }, (request, response) => {
    if (request.url === '/page') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<main>page</main>');
      return;
    }
    rejected.push(request.url);
    response.writeHead(request.url === '/unavailable' ? 503 : 200, { 'Content-Type': 'application/json' });
    response.write('streaming error body');
    const interval = setInterval(() => response.write('more error body'), 50);
    response.on('close', () => { clearInterval(interval); disconnected.push(request.url); });
  });
}));

test('invalid route-manifest provenance prevents HTTP requests', async () => checkout(async dir => {
  const outside = await mkdtemp(path.join(root, 'artifacts/markup-tests/routes-'));
  let requests = 0;
  try {
    const manifest = path.join(outside, 'routes.json');
    await writeFile(manifest, JSON.stringify([{ path: '/page' }]));
    await server(async origin => {
      const result = await run(dir, ['--routes', manifest, '--base-url', origin, '--report-only']);
      assert.equal(result.status, 2, result.output);
      assert.match(result.report.failures.join('\n'), /Input provenance: Input outside repository/);
      assert.equal(requests, 0, 'A rejected manifest must not drive HTTP requests');
      assert.equal(result.report.coverage.httpResponses, 0);
    }, (request, response) => {
      requests++;
      response.setHeader('Content-Type', 'text/html');
      response.end('<main>page</main>');
    });
  } finally { await rm(outside, { recursive: true, force: true }); }
}));

test('product source directories are not mistaken for root build and report outputs', async () => checkout(async dir => {
  for (const name of ['artifacts', 'coverage', 'dist', '.netlify']) {
    const folder = path.join(dir, 'src/nested', name);
    await mkdir(folder);
    await writeFile(path.join(folder, 'Page.astro'), '<section>unfinished');
  }
  const result = await run(dir);
  assert.equal(result.status, 1, result.output);
  assert.equal(result.report.coverage.sourceAstro, 6);
  assert.equal(result.report.failures.length, 0);
  for (const name of ['artifacts', 'coverage', 'dist', '.netlify']) {
    assert.ok(result.report.findings.some(finding => finding.file === `src/nested/${name}/Page.astro`));
  }
}));

#!/usr/bin/env node
/** Read-only application audit. Writes reports only under artifacts/. */
import { readFile, writeFile, mkdir, readdir, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { normalizeMessages, renderLog, auditExitCode, sha256, isIgnoredMessage } from './report.mjs';
import { probeAstro, probeHtml } from './probes.mjs';
import { captureProvenance, inputsChanged, MAX_INPUT_BYTES } from './provenance.mjs';

const root = process.cwd();
const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const evidenceDir = process.env.BIJUX_MARKUP_EVIDENCE_DIR || path.join(root, 'artifacts', 'markup', id);
const report = {
  timestamp: new Date().toISOString(), gitHead: null, versions: { node: process.version },
  evidenceDir: path.relative(root, evidenceDir),
  coverage: { sourceAstro: 0, sourceHtml: 0, generatedHtml: 0, httpResponses: 0,
    renderedRequested: false, renderedStatus: 'NOT_REQUESTED', excluded: [], otherSourceExtensions: {} },
  inputs: [], findings: [], failures: [], probes: {}, exitCode: 2,
};
const SOURCE_SKIP = new Set(['node_modules', '.git']);
const MAX_BYTES = MAX_INPUT_BYTES;
let options = {};
let sourceFiles = [];
let generatedFiles = [];
let provenanceFiles = [];
const relative = filename => path.relative(root, filename).split(path.sep).join('/');

function argumentsFor(argv) {
  const options = { htmlDir: null, routes: null, baseUrl: null, allowRemote: false, reportOnly: false, help: false };
  const values = { '--html-dir': 'htmlDir', '--routes': 'routes', '--base-url': 'baseUrl' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (Object.hasOwn(values, arg)) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[values[arg]] = argv[++i];
    } else if (arg === '--allow-remote') options.allowRemote = true;
    else if (arg === '--report-only') options.reportOnly = true;
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (Boolean(options.routes) !== Boolean(options.baseUrl)) throw new Error('--routes and --base-url must be supplied together.');
  return options;
}

async function save(name, value) {
  await writeFile(path.join(evidenceDir, name), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}

async function walk(directory, generated = false, recordCoverage = true) {
  if ((await lstat(directory)).isSymbolicLink()) throw new Error(`Scope directory is a symbolic link: ${relative(directory)}`);
  const physical = path.relative(await realpath(root), await realpath(directory));
  if (physical === '..' || physical.startsWith(`..${path.sep}`) || path.isAbsolute(physical)) {
    throw new Error(`Scope directory resolves outside repository: ${relative(directory)}`);
  }
  const out = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      if (recordCoverage) report.coverage.excluded.push(`${relative(file)} (symbolic link not followed)`);
    } else if (entry.isDirectory()) {
      // Source/output routes can share names with repository-root run directories.
      if (!generated && SOURCE_SKIP.has(entry.name)) {
        if (recordCoverage) report.coverage.excluded.push(`${relative(file)}/ (excluded directory)`);
      } else {
        out.push(...await walk(file, generated, recordCoverage));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.html' || (!generated && ext === '.astro')) out.push(file);
      else if (!generated && recordCoverage) report.coverage.otherSourceExtensions[ext || '[none]'] = (report.coverage.otherSourceExtensions[ext || '[none]'] ?? 0) + 1;
    }
  }
  return out;
}

async function readInput(file, inputKind) {
  const stat = await lstat(file);
  if (stat.size > MAX_BYTES) throw new Error(`Input exceeds ${MAX_BYTES} bytes: ${relative(file)}`);
  const data = await readFile(file, 'utf8');
  report.inputs.push({ file: relative(file), inputKind, sha256: sha256(data), bytes: stat.size, mtime: stat.mtime.toISOString() });
  return data;
}

async function moduleFromProject(require, name) {
  // Require tools installed for this project, not an incidental ancestor checkout.
  await lstat(path.join(root, 'node_modules', name));
  const module = await import(pathToFileURL(require.resolve(name)).href);
  report.versions[name] = JSON.parse(await readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
  return module;
}

async function responseText(response) {
  if (!response.body) throw new Error('Empty HTTP response body');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new Error(`HTTP response exceeds ${MAX_BYTES} bytes`);
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  options = argumentsFor(process.argv.slice(2));
  if (options.help) {
    console.log('npm run audit:markup -- [--html-dir DIR] [--routes JSON --base-url ORIGIN] [--allow-remote] [--report-only]');
    return;
  }
  report.coverage.renderedRequested = Boolean(options.htmlDir || options.routes);
  report.coverage.renderedStatus = report.coverage.renderedRequested ? 'REQUESTED' : 'NOT_REQUESTED';
  try { report.gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { /* Archive checkouts can be audited, but no commit provenance can be claimed. */ }
  try { report.gitStatus = execFileSync('git', ['status', '--short', '--untracked-files=no'], { cwd: root, encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { report.gitStatus = 'unavailable'; }

  const require = createRequire(path.join(root, 'package.json'));
  for (const [dir, required] of [['src', true], ['public', false]]) {
    try { sourceFiles.push(...await walk(path.join(root, dir))); }
    catch (e) { if (required || e.code !== 'ENOENT') report.failures.push(`Cannot enumerate ${dir}: ${e.message}`); }
  }
  if (!sourceFiles.some(f => path.extname(f).toLowerCase() === '.astro')) report.failures.push('No Astro source files found in src/ or public/. Check the working directory and configured scope.');
  if (options.htmlDir) {
    try {
      const folder = path.resolve(root, options.htmlDir);
      if (path.relative(root, folder) === '..' || path.relative(root, folder).startsWith(`..${path.sep}`)) throw new Error('Generated HTML directory must be inside the repository');
      generatedFiles = await walk(folder, true);
      if (!generatedFiles.length) throw new Error('No generated .html files found; this is not a successful rendered-HTML scan.');
    } catch (error) { report.failures.push(`Generated HTML: ${error.message}`); }
  }
  report.inventory = {
    'astro-source': sourceFiles.filter(f => path.extname(f).toLowerCase() === '.astro').map(relative),
    'authored-html': sourceFiles.filter(f => path.extname(f).toLowerCase() === '.html').map(relative),
    'generated-html': generatedFiles.map(relative),
  };
  provenanceFiles = [
    ...sourceFiles, ...generatedFiles,
    ...['package.json', 'package-lock.json', 'configs/quality/eslint.markup.config.mjs', 'configs/quality/htmlvalidate.markup.json',
      'scripts/markup/audit.mjs', 'scripts/markup/worker.mjs', 'scripts/markup/provenance.mjs',
      'scripts/markup/report.mjs', 'scripts/markup/probes.mjs', 'scripts/markup/explicit-closing-tags.mjs'].map(name => path.join(root, name)),
    ...(options.routes ? [path.resolve(root, options.routes)] : []),
  ];
  try { report.provenanceBefore = await captureProvenance(root, provenanceFiles); }
  catch (error) { report.failures.push(`Input provenance: ${error.message}`); }
  const rawEslint = [];
  try {
    const module = await moduleFromProject(require, 'eslint');
    const ESLint = module.ESLint ?? module.default?.ESLint;
    const eslint = new ESLint({
      cwd: root, overrideConfigFile: path.join(root, 'configs/quality/eslint.markup.config.mjs'),
      fix: false, allowInlineConfig: false,
    });
    report.probes.astro = await probeAstro(eslint, path.join(root, 'src', '__markup_probe__.astro'));
    if (report.probes.astro.some(p => !p.passed)) throw new Error('Astro integration probes failed; see probes.json. Do not disable the failing cases.');
    for (const file of sourceFiles.filter(f => path.extname(f).toLowerCase() === '.astro')) {
      try {
        const data = await readInput(file, 'astro-source');
        const results = await eslint.lintText(data, { filePath: file, warnIgnored: true });
        if (results.length !== 1 || results.some(r => r.messages.some(isIgnoredMessage))) {
          throw new Error('File was ignored or did not receive the expected Astro analysis');
        }
        results.forEach(r => { r.filePath = relative(file); });
        rawEslint.push(...results);
        report.findings.push(...normalizeMessages(results, 'astro-source'));
        report.coverage.sourceAstro++;
      } catch (e) { report.failures.push(`${relative(file)}: ${e.message}`); }
    }
    for (const name of ['eslint-plugin-astro', 'astro-eslint-parser', 'typescript-eslint', 'astro', '@astrojs/compiler']) {
      try {
        const resolver = name === 'astro-eslint-parser' ? createRequire(require.resolve('eslint-plugin-astro')) : require;
        report.versions[name] = JSON.parse(await readFile(resolver.resolve(`${name}/package.json`), 'utf8')).version;
      } catch (error) { report.failures.push(`Tool version ${name}: ${error.message}`); }
    }
  } catch (e) { report.failures.push(`Astro analyzer: ${e.message}`); }
  await save('eslint.json', rawEslint);

  const rawHtml = [];
  try {
    const module = await moduleFromProject(require, 'html-validate');
    const HtmlValidate = module.HtmlValidate ?? module.default?.HtmlValidate;
    const configFile = path.join(root, 'configs/quality/htmlvalidate.markup.json');
    const configText = await readFile(configFile, 'utf8');
    report.htmlConfigSha256 = sha256(configText);
    const config = JSON.parse(configText);
    const rendered = new HtmlValidate(config);
    const authored = new HtmlValidate({ ...config, rules: { ...config.rules, 'no-implicit-close': 'error' } });
    report.probes.html = await probeHtml(rendered);
    const optional = await authored.validateString('<ul><li>one<li>two</ul>', '__authored_probe__.html');
    report.probes.html.push({ name: 'authored optional endings policy', passed: !optional.valid });
    if (report.probes.html.some(p => !p.passed)) throw new Error('HTML integration probes failed; see probes.json.');

    async function validate(data, displayPath, inputKind, validator) {
      const result = await validator.validateString(data, displayPath);
      rawHtml.push({ inputKind, ...result });
      report.findings.push(...normalizeMessages(result.results, inputKind));
      if (data.includes('html-validate-disable')) report.findings.push({
        file: displayPath, inputKind, line: null, column: null, severity: 1,
        rule: 'suppression-review', category: 'SUPPRESSION_REVIEW',
        message: 'Contains html-validate-disable text. Review any actual inline suppression directives before claiming full configured-rule coverage.',
      });
    }
    for (const file of sourceFiles.filter(f => path.extname(f).toLowerCase() === '.html')) {
      try { await validate(await readInput(file, 'authored-html'), relative(file), 'authored-html', authored); report.coverage.sourceHtml++; }
      catch (e) { report.failures.push(`${relative(file)}: ${e.message}`); }
    }
    if (options.htmlDir) {
      try {
        for (const file of generatedFiles) {
          try { await validate(await readInput(file, 'generated-html'), relative(file), 'generated-html', rendered); report.coverage.generatedHtml++; }
          catch (e) { report.failures.push(`${relative(file)}: ${e.message}`); }
        }
      } catch (e) { report.failures.push(`Generated HTML: ${e.message}`); }
    }
    if (options.routes) {
      try {
        const origin = new URL(options.baseUrl);
        if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
          throw new Error('--base-url must be an HTTP(S) origin without credentials, path, query, or fragment.');
        }
        if (!options.allowRemote && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error('Remote origin requires explicit --allow-remote. Prefer a local built server.');
        const routeFile = path.resolve(root, options.routes);
        const routeHash = report.provenanceBefore?.inputHashes[relative(routeFile)];
        if (!routeHash) throw new Error('Route manifest requires valid repository input provenance before HTTP requests');
        const routeText = await readFile(routeFile, 'utf8');
        report.routesSha256 = sha256(routeText);
        if (report.routesSha256 !== routeHash) throw new Error('Route manifest changed after input provenance was recorded');
        const routes = JSON.parse(routeText);
        if (!Array.isArray(routes) || !routes.length) throw new Error('Route manifest must be a nonempty array.');
        for (const [i, route] of routes.entries()) {
          try {
            if (typeof route?.path !== 'string' || !route.path.startsWith('/') || route.path.startsWith('//') || !Array.isArray(route.mustContain ?? []) || !(route.mustContain ?? []).every(s => typeof s === 'string')) throw new Error(`Invalid route at index ${i}`);
            const url = new URL(route.path, origin);
            if (url.origin !== origin.origin || url.hash || url.username || url.password) throw new Error('Route must remain on the requested origin with no fragment or credentials');
            const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { Accept: 'text/html' } });
            let text;
            try {
              if (response.status !== 200) throw new Error(`HTTP ${response.status}; expected 200 (redirects are not silently followed)`);
              if (!/^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error('Response is not text/html');
              text = await responseText(response);
            } finally {
              // Rejected bodies must not keep sockets and the worker alive.
              if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
            }
            const filename = `response-${String(i + 1).padStart(3, '0')}.html`;
            await save(filename, text);
            report.inputs.push({ inputKind: 'http-html', file: path.join(report.evidenceDir, filename), url: url.href, sha256: sha256(text), bytes: Buffer.byteLength(text), retrieved: new Date().toISOString() });
            if (!text.trim()) throw new Error('Empty HTTP response body');
            await validate(text, path.join(report.evidenceDir, filename), 'http-html', rendered);
            for (const expected of route.mustContain ?? []) if (!text.includes(expected)) throw new Error(`Expected response marker missing: ${JSON.stringify(expected)}`);
            report.coverage.httpResponses++;
          } catch (e) { report.failures.push(`Route ${route?.path ?? i}: ${e.message}`); }
        }
      } catch (e) { report.failures.push(`Route audit: ${e.message}`); }
    }
  } catch (e) { report.failures.push(`HTML analyzer: ${e.message}`); }
  await save('htmlvalidate.json', rawHtml);
  await save('probes.json', report.probes);
  if (report.coverage.renderedRequested) report.coverage.renderedStatus = report.failures.length ? 'INCOMPLETE_OR_OTHER_STAGE_FAILED' : 'CONFIGURED_INPUTS_CHECKED';
}

await mkdir(evidenceDir, { recursive: true });
await writeFile(path.join(root, 'artifacts', 'markup-issues.log'), `BIA-astro markup audit\nStatus: IN_PROGRESS\nTimestamp: ${report.timestamp}\nEvidence: ${report.evidenceDir}\nThis is not a completed report.\n`);
try { await main(); }
catch (e) { report.failures.push(`Audit: ${e.stack ?? e.message}`); }
finally {
  if (!options.help) {
    if (report.provenanceBefore) {
      try {
        const sourcesAfter = [];
        for (const directory of ['src', 'public']) {
          try { sourcesAfter.push(...await walk(path.join(root, directory), false, false)); }
          catch (error) { if (directory === 'src' || error.code !== 'ENOENT') throw error; }
        }
        const generatedAfter = options.htmlDir ? await walk(path.resolve(root, options.htmlDir), true, false) : [];
        if (JSON.stringify(sourcesAfter) !== JSON.stringify(sourceFiles) || JSON.stringify(generatedAfter) !== JSON.stringify(generatedFiles)) {
          throw new Error('The configured source/output file inventory changed during analysis');
        }
        report.provenanceAfter = await captureProvenance(root, provenanceFiles);
        if (inputsChanged(report.provenanceBefore, report.provenanceAfter)) throw new Error('Audited inputs, HEAD or tracked status changed during analysis');
      } catch (error) { report.failures.push(`Input stability: ${error.message}`); }
    }
    for (const file of ['package-lock.json', 'configs/quality/eslint.markup.config.mjs', 'scripts/markup/explicit-closing-tags.mjs']) {
      try { (report.configurationHashes ??= {})[file] = sha256(await readFile(path.join(root, file))); }
      catch { /* Missing required configuration is reported by the relevant analyzer. */ }
    }
    report.coverage.sourceParseFailures = report.findings.filter(f => f.parseIncomplete && ['astro-source', 'authored-html'].includes(f.inputKind)).length;
    report.coverage.renderedParseFailures = report.findings.filter(f => f.parseIncomplete && ['generated-html', 'http-html'].includes(f.inputKind)).length;
    if (report.coverage.renderedRequested && (report.failures.length || report.coverage.renderedParseFailures)) {
      report.coverage.renderedStatus = 'INCOMPLETE';
    }
    report.exitCode = auditExitCode(report, options.reportOnly);
    report.finished = new Date().toISOString();
    await save('report.json', report);
    const log = renderLog(report);
    await save('markup-issues.log', log);
    await writeFile(path.join(root, 'artifacts', 'markup-issues.log'), log);
    console.log(`artifacts/markup-issues.log\nEvidence: ${report.evidenceDir}\nExit: ${report.exitCode}`);
    process.exitCode = report.exitCode;
  }
}

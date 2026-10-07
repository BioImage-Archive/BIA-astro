#!/usr/bin/env node
// Read-only source audit. Writes only artifacts; never runs --fix or installs packages.
// Knip/Astro may evaluate project configuration; optional astro check can generate .astro/ files.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { eslintFindings, knipFindings, renderFindings, reportExitCode, sortFindings } from './report.mjs';

const args = new Set(process.argv.slice(2));
const allowed = new Set(['--report-only', '--with-astro-check']);
for (const arg of args) {
  if (!allowed.has(arg)) {
    console.error(`Unknown argument: ${arg}`);
    process.exit(2);
  }
}
const root = process.cwd();
if (!existsSync(path.join(root, 'package.json')) || !existsSync(path.join(root, 'src'))) {
  console.error('Run this command from the BIA-astro repository root.');
  process.exit(2);
}
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const evidencePath = `artifacts/dead-code/${runId}`;
const out = path.join(root, evidencePath);
mkdirSync(out, { recursive: true });
const require = createRequire(path.join(root, 'package.json'));
const env = { ...process.env, NO_COLOR: '1', CI: 'true', ASTRO_TELEMETRY_DISABLED: '1' };
delete env.FORCE_COLOR;
const stages = [];
const findings = [];
const notes = [];
const started = new Date().toISOString();

function execute(command, parameters, timeout = 180_000) {
  const result = spawnSync(command, parameters, {
    cwd: root, env, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024,
  });
  return {
    command: [command, ...parameters], exitCode: result.status, signal: result.signal,
    stdout: result.stdout ?? '', stderr: result.stderr ?? '',
    error: result.error?.message ?? null,
  };
}
function read(file) {
  const target = path.resolve(root, file);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  try { return readFileSync(target, 'utf8'); } catch { return null; }
}
function digest(file) {
  const target = path.resolve(root, file);
  if (!target.startsWith(root + path.sep)) throw new Error(`Input outside repository: ${file}`);
  return createHash('sha256').update(readFileSync(target)).digest('hex');
}
function packageInfo(name) {
  // Resolve local packages, never execute npx or fetch anything.
  const file = require.resolve(`${name}/package.json`);
  return { folder: path.dirname(file), data: JSON.parse(readFileSync(file, 'utf8')) };
}
const requiredInputs = [
  'package-lock.json', 'configs/quality/eslint.config.mjs', 'configs/quality/knip.json',
  'configs/quality/tsconfig.dead-code.json',
];
function captureProvenance(name) {
  const begin = Date.now();
  const stage = { name, state: 'FAILED', exitCode: null, error: null, commands: [] };
  const snapshot = { gitHead: null, trackedStatus: null, inputHashes: null, hashes: null };
  stages.push(stage);
  function git(label, parameters) {
    const result = execute('git', parameters);
    stage.commands.push({ label, command: result.command, exitCode: result.exitCode,
      signal: result.signal, error: result.error });
    writeFileSync(path.join(out, `${name}.${label}.stdout.log`), result.stdout);
    writeFileSync(path.join(out, `${name}.${label}.stderr.log`), result.stderr);
    if (result.error || result.signal || result.exitCode !== 0) {
      throw new Error(`Git ${label} failed: ${result.error ?? `exit=${result.exitCode}, signal=${result.signal}`}`);
    }
    return result.stdout;
  }
  try {
    const gitRoot = git('root', ['rev-parse', '--show-toplevel']).trim();
    if (realpathSync(gitRoot) !== realpathSync(root)) {
      throw new Error('Working directory is not the Git repository root');
    }
    snapshot.gitHead = git('head', ['rev-parse', 'HEAD']).trim();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(snapshot.gitHead)) {
      throw new Error('Git HEAD is not a complete commit hash');
    }
    snapshot.trackedStatus = git('status', ['status', '--porcelain=v1', '--untracked-files=no']);
    const files = git('inputs', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
    const inputs = [...new Set(files.split('\0').filter(file =>
      file && (file === 'Makefile' || /\.(?:astro|mdx|[cm]?[jt]sx?|json|ya?ml|mk)$/.test(file)) &&
      !file.startsWith('artifacts/')))].sort();
    if (inputs.length === 0) throw new Error('Git enumerated zero audit inputs');
    // Unreadable inputs cannot establish stability; retain their read error as a failed stage.
    snapshot.inputHashes = Object.fromEntries(inputs.map(file => [file, digest(file)]));
    snapshot.hashes = Object.fromEntries(requiredInputs.map(file => [file, digest(file)]));
    stage.state = 'COMPLETED';
    stage.exitCode = 0;
  } catch (error) {
    stage.error = error.message;
    stage.exitCode = 2;
    writeFileSync(path.join(out, `${name}.failure.log`), `${error.stack ?? error}\n`);
  } finally {
    stage.durationMs = Date.now() - begin;
  }
  return snapshot;
}
function runTool(name, parameters, parse = null) {
  const begin = Date.now();
  const stage = { name, state: 'FAILED', exitCode: null, error: null };
  stages.push(stage);
  try {
    let result;
    if (name === 'astro-probe') {
      result = execute(process.execPath, ['scripts/dead-code/verify-tools.mjs']);
    } else {
      const packageName = name === 'astro-check' ? 'astro' : name;
      const info = packageInfo(packageName);
      const executable = typeof info.data.bin === 'string' ? info.data.bin : info.data.bin?.[packageName];
      if (!executable) throw new Error(`No CLI executable in ${packageName}/package.json`);
      stage.version = info.data.version;
      result = execute(process.execPath, [path.join(info.folder, executable), ...parameters]);
    }
    Object.assign(stage, { exitCode: result.exitCode, signal: result.signal, command: result.command });
    writeFileSync(path.join(out, `${name}.stdout.log`), result.stdout);
    writeFileSync(path.join(out, `${name}.stderr.log`), result.stderr);
    if (result.error || result.signal || ![0, 1].includes(result.exitCode)) {
      throw new Error(result.error ?? `Process failed: exit=${result.exitCode}, signal=${result.signal}`);
    }
    if (name === 'astro-probe' && result.exitCode !== 0) throw new Error('Astro parser integration probe failed');
    if (parse) {
      const data = JSON.parse(result.stdout);
      const extracted = parse(data, root);
      findings.push(...extracted);
      writeFileSync(path.join(out, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
      if (name === 'eslint' && data.length === 0) throw new Error('ESLint checked zero files');
      if (name === 'eslint') {
        stage.filesWithResults = data.length;
        stage.fatalDiagnostics = extracted.filter(finding => finding.fatal).length;
      }
      if (extracted.some(finding => finding.fatal)) throw new Error('Analyzer returned a parsing or rule-configuration failure');
      if (result.exitCode === 1 && !extracted.some(finding => finding.status !== 'SUPPRESSED_REVIEW')) {
        throw new Error('Analyzer exited nonzero without active normalized findings; inspect raw logs for configuration hints');
      }
    }
    if (name === 'astro-check' && result.exitCode !== 0) {
      throw new Error('Astro check exited nonzero; inspect raw output for type errors OR setup/configuration failures');
    }
    stage.state = 'COMPLETED';
  } catch (error) {
    stage.error = error.message;
    writeFileSync(path.join(out, `${name}.failure.log`), `${error.stack ?? error}\n`);
  } finally {
    stage.durationMs = Date.now() - begin;
  }
}

const before = captureProvenance('provenance-before');
const versions = {};
for (const name of ['eslint', 'eslint-plugin-astro', 'typescript-eslint', 'knip', 'astro', '@astrojs/compiler', '@astrojs/check', 'typescript']) {
  try { versions[name] = packageInfo(name).data.version; } catch { versions[name] = 'NOT INSTALLED / NOT RESOLVED'; }
}

runTool('astro-probe', []);
runTool('eslint', ['--config', 'configs/quality/eslint.config.mjs', '--format', 'json', '.'], eslintFindings);
runTool('knip', ['--config', 'configs/quality/knip.json', '--reporter', 'json'], knipFindings);
if (args.has('--with-astro-check')) {
  runTool('astro-check', ['check', '--tsconfig', 'configs/quality/tsconfig.dead-code.json']);
} else {
  notes.push('Optional Astro/type-check stage not run. Use --with-astro-check after checking installed CLI support.');
}
notes.push(
  'Findings are review candidates, not authorization to delete source, imports, parameters, assets or dependencies.',
  'ESLint scope: matching JS/TS/Astro files, including browser scripts in .astro through the processor.',
  'Existing inline ESLint suppressions are honored; suppressed diagnostics are listed where the tool returns them.',
  'Knip scope: source/config/scripts/tests graph, Astro route entries, verified script-src browser entries and Markdown/MDX frontmatter layouts.',
  'Knip default Astro/MDX extraction is import-oriented: no complete export or embedded-expression analysis.',
  'Whole files and dependencies can lack a line number. No synthetic line 1 is invented.',
  'Knip source locations in compiled file types must be verified against the original source.',
  'Public URL assets, external CSS, data-driven references, plain Markdown and MDX inline expressions are NOT fully audited.',
  'Local unused CSS selectors are candidates only; dynamic classes, children, slots and browser states need review.',
  'Imports and unused variable initializers may have side effects; browser globals and route contracts also require review.',
  'No browser coverage, page build, runtime smoke tests, API availability checks or source deletion is performed.',
  'ESLint rule directives that turn a rule off can prevent diagnostics entirely; review source suppressions separately.',
);
if (before.trackedStatus?.trim()) {
  notes.push('Tracked working tree changes were present before this scan; HEAD alone does not describe the input.');
}
const after = captureProvenance('provenance-after');
const inputsChanged = before.gitHead !== after.gitHead || before.trackedStatus !== after.trackedStatus ||
  JSON.stringify(before.inputHashes) !== JSON.stringify(after.inputHashes) ||
  JSON.stringify(before.hashes) !== JSON.stringify(after.hashes);
if (inputsChanged) notes.push('Audited inputs or HEAD changed during the scan; rerun on stable inputs before trusting this report.');
const exitCode = inputsChanged ? 2 : reportExitCode(findings, stages, args.has('--report-only'));
const report = {
  started, finished: new Date().toISOString(), root, evidencePath, gitHead: before.gitHead, gitHeadAfter: after.gitHead,
  trackedStatusBefore: before.trackedStatus, trackedStatusAfter: after.trackedStatus,
  inputHashesBefore: before.inputHashes, inputHashesAfter: after.inputHashes,
  node: process.version, versions, hashes: before.hashes, hashesAfter: after.hashes, stages, notes, findings: sortFindings(findings), exitCode,
  completeness: exitCode === 2 ? 'INCOMPLETE' : 'CONFIGURED_STATIC_SCAN_COMPLETED_NOT_PROOF_OF_ALL_DEAD_CODE',
};
writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const candidates = findings.filter(item => item.status === 'REVIEW_CANDIDATE').length;
const diagnostics = findings.filter(item => item.status === 'ANALYSIS_DIAGNOSTIC').length;
const suppressed = findings.filter(item => item.status === 'SUPPRESSED_REVIEW').length;
const text = [
  'BIA-ASTRO DEAD-CODE CANDIDATE AUDIT',
  `Started: ${started}`, `Finished: ${report.finished}`, `Repository: ${root}`,
  `HEAD: ${report.gitHead ?? 'unknown'}`, `Node: ${process.version}`,
  `Status: ${report.completeness}`,
  `Candidates: ${candidates}; analysis diagnostics: ${diagnostics}; suppressed findings: ${suppressed}`,
  `Versions: ${JSON.stringify(versions)}`, `Input hashes: ${JSON.stringify(report.hashes)}`,
  '', 'TOOL EXECUTION',
  ...stages.map(stage => `${stage.name}: ${stage.state}; exit=${stage.exitCode}; ${stage.error ?? 'no execution error'}`),
  '', 'SCOPE / LIMITATIONS', ...notes.map(note => `- ${note}`),
  '', 'FINDINGS GROUPED BY SOURCE FILE',
  findings.length ? renderFindings(findings, read) : 'No normalized findings. Consult execution status; this is not proof of no dead code.',
  '', 'RAW EVIDENCE', `See ${evidencePath}/ for this run's raw JSON, logs and report.json.`,
  'Optional astro-check diagnostics are in astro-check.stdout.log / astro-check.stderr.log, not classified as dead code.',
  '', `Exit code: ${exitCode} (0=completed/no active findings or report-only; 1=findings; 2=incomplete/failure)`, '',
].join('\n');
writeFileSync(path.join(root, 'artifacts', 'dead-codes.log'), text);
console.log(`Wrote artifacts/dead-codes.log (${candidates} candidates, ${diagnostics} diagnostics; ${report.completeness})`);
process.exitCode = exitCode;

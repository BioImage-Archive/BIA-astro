#!/usr/bin/env node
// Bound analyzer execution outside the worker so synchronous parser stalls can be stopped.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderLog, isWorkerReport, auditExitCode } from './report.mjs';

async function main() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  let timeoutMs = 300_000;
  let argumentError = null;
  const timeoutIndex = args.indexOf('--timeout-ms');
  if (timeoutIndex >= 0) {
    timeoutMs = Number(args[timeoutIndex + 1]);
    args.splice(timeoutIndex, 2);
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000) {
    argumentError = '--timeout-ms must be an integer between 1 and 3600000.';
  }
  if (args.includes('--help') && !argumentError) {
    console.log('npm run audit:markup -- [--html-dir DIR] [--routes JSON --base-url ORIGIN] [--allow-remote] [--report-only] [--timeout-ms N]');
    process.exit(0);
  }
  const evidenceDir = path.join(root, 'artifacts', 'markup', `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
  await mkdir(evidenceDir, { recursive: true });
  const latest = path.join(root, 'artifacts', 'markup-issues.log');
  await writeFile(latest, `BIA-astro markup audit\nStatus: IN_PROGRESS\nEvidence: ${path.relative(root, evidenceDir)}\n`);
  if (argumentError) {
    const report = { timestamp: new Date().toISOString(), findings: [], failures: [argumentError], versions: { node: process.version }, coverage: {}, evidenceDir: path.relative(root, evidenceDir), exitCode: 2 };
    const log = renderLog(report);
    await writeFile(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(path.join(evidenceDir, 'markup-issues.log'), log);
    await writeFile(latest, log);
    console.error(argumentError);
    process.exit(2);
  }
  const stdout = openSync(path.join(evidenceDir, 'worker.stdout.log'), 'w');
  const stderr = openSync(path.join(evidenceDir, 'worker.stderr.log'), 'w');
  let timedOut = false;
  let spawnError = null;
  const child = spawn(process.execPath, [fileURLToPath(new URL('./worker.mjs', import.meta.url)), ...args], {
    cwd: root,
    env: { ...process.env, BIJUX_MARKUP_EVIDENCE_DIR: evidenceDir },
    stdio: ['ignore', stdout, stderr],
  });
  let forceTimer;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    forceTimer = setTimeout(() => child.kill('SIGKILL'), 2000);
  }, timeoutMs);
  child.on('error', error => { spawnError = error.message; });
  const { code, signal } = await new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal })));
  clearTimeout(timer);
  clearTimeout(forceTimer);
  closeSync(stdout);
  closeSync(stderr);
  let report;
  let reportError = null;
  let workerOutput;
  try {
    workerOutput = await readFile(path.join(evidenceDir, 'report.json'), 'utf8');
    const candidate = JSON.parse(workerOutput);
    if (!isWorkerReport(candidate) || candidate.evidenceDir !== path.relative(root, evidenceDir)
      || candidate.exitCode !== auditExitCode(candidate, args.includes('--report-only'))) {
      throw new Error('Malformed worker report');
    }
    report = candidate;
  } catch (error) {
    reportError = error.message;
    if (workerOutput !== undefined) await writeFile(path.join(evidenceDir, 'invalid-worker-report.txt'), workerOutput);
  }
  if (timedOut || spawnError || signal || !report || ![0, 1, 2].includes(code) || report.exitCode !== code) {
    report ??= { timestamp: new Date().toISOString(), findings: [], failures: [], versions: { node: process.version }, coverage: {}, evidenceDir: path.relative(root, evidenceDir) };
    report.failures.push(timedOut ? `Analyzer worker exceeded ${timeoutMs} ms` : `Analyzer worker failed: ${spawnError ?? reportError ?? `exit=${code}; signal=${signal}`}`);
    report.exitCode = 2;
  }
  report.execution = { timeoutMs, timedOut, exitCode: code, signal, error: spawnError };
  await writeFile(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const log = renderLog(report);
  await writeFile(path.join(evidenceDir, 'markup-issues.log'), log);
  await writeFile(latest, log);
  console.log(`artifacts/markup-issues.log\nEvidence: ${path.relative(root, evidenceDir)}\nExit: ${report.exitCode}`);
  process.exitCode = report.exitCode;
}

try { await main(); }
catch (error) {
  console.error(`Markup audit could not finish: ${error.message}`);
  process.exitCode = 2;
}

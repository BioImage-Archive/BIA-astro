// Report normalization only. Does not load ESLint/Knip or change source files.
import path from 'node:path';

const KNIP_CANDIDATES = new Set([
  'dependencies', 'devDependencies', 'optionalPeerDependencies', 'exports', 'types',
  'nsExports', 'nsTypes', 'enumMembers', 'classMembers', 'catalog',
]);
const KNIP_DIAGNOSTICS = new Set(['unlisted', 'binaries', 'unresolved', 'duplicates']);

function relativePath(file, root) {
  if (typeof file !== 'string' || !file) throw new Error('Missing finding file path');
  return path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
}

export function eslintFindings(data, root) {
  if (!Array.isArray(data)) throw new Error('Unexpected ESLint JSON: expected an array');
  const findings = [];
  for (const file of data) {
    if (!Array.isArray(file.messages)) throw new Error('ESLint result has no messages array');
    for (const [items, suppressed] of [[file.messages, false], [file.suppressedMessages ?? [], true]]) {
      for (const message of items) {
        if (typeof message.message !== 'string') throw new Error('ESLint diagnostic has no message');
        const rule = message.ruleId ?? 'parse-or-configuration';
        const configurationFailure = /^Definition for rule .+ was not found\./.test(message.message);
        const diagnostic = Boolean(message.fatal || message.ruleId == null || configurationFailure);
        findings.push({
          tool: 'eslint', file: relativePath(file.filePath, root),
          line: message.line ?? null, column: message.column ?? null,
          endLine: message.endLine ?? message.line ?? null,
          kind: rule,
          status: suppressed ? 'SUPPRESSED_REVIEW' : diagnostic ? 'ANALYSIS_DIAGNOSTIC' : 'REVIEW_CANDIDATE',
          message: message.message,
          fatal: Boolean(message.fatal || configurationFailure),
          suppressions: suppressed ? message.suppressions ?? [] : [],
        });
      }
    }
  }
  return findings;
}

export function knipFindings(data, root) {
  if (!data || !Array.isArray(data.files) || !Array.isArray(data.issues)) {
    throw new Error('Unexpected Knip JSON: expected files[] and issues[]');
  }
  const findings = data.files.map(file => ({
    tool: 'knip', file: relativePath(file, root), line: null, column: null, endLine: null,
    kind: 'files', status: 'REVIEW_CANDIDATE',
    message: 'File not reachable from configured entry points; verify routes, URL use and dynamic loading.',
  }));
  for (const row of data.issues) {
    const file = relativePath(row.file, root);
    for (const [kind, value] of Object.entries(row)) {
      if (kind === 'file' || kind === 'owners') continue;
      if (!KNIP_CANDIDATES.has(kind) && !KNIP_DIAGNOSTICS.has(kind)) {
        throw new Error(`Unrecognized Knip issue category: ${kind}; raw JSON preserved`);
      }
      let items;
      if (kind === 'enumMembers' || kind === 'classMembers') {
        items = Object.entries(value).flatMap(([parent, children]) => children.map(item => ({
          ...item, name: `${parent}.${item.name}`,
        })));
      } else if (kind === 'duplicates') {
        items = value.flat();
      } else {
        items = value;
      }
      if (!Array.isArray(items)) throw new Error(`Unexpected Knip category data: ${kind}`);
      for (const item of items) {
        findings.push({
          tool: 'knip', file, line: item.line ?? null, column: item.col ?? null,
          endLine: item.line ?? null, kind,
          status: KNIP_CANDIDATES.has(kind) ? 'REVIEW_CANDIDATE' : 'ANALYSIS_DIAGNOSTIC',
          message: `${kind}: ${item.name ?? '(unnamed)'}`,
        });
      }
    }
  }
  return findings;
}

export function sortFindings(findings) {
  return [...findings].sort((a, b) =>
    a.file.localeCompare(b.file, 'en') || (a.line ?? 0) - (b.line ?? 0) ||
    (a.column ?? 0) - (b.column ?? 0) || a.kind.localeCompare(b.kind, 'en') ||
    a.message.localeCompare(b.message, 'en'));
}

export function renderFindings(findings, readSource) {
  const lines = [];
  let previousFile;
  for (const finding of sortFindings(findings)) {
    if (previousFile !== finding.file) {
      lines.push('', `FILE: ${finding.file}`);
      previousFile = finding.file;
    }
    const location = finding.line == null ? '(file level; line not supplied)' :
      `${finding.line}:${finding.column ?? '?'}`;
    lines.push(`  ${location} [${finding.status}] ${finding.tool}/${finding.kind}`);
    lines.push(`    ${finding.message}`);
    if (finding.line != null) {
      const source = readSource(finding.file);
      if (source != null) {
        const sourceLines = source.split(/\r?\n/);
        const end = Math.min(finding.endLine ?? finding.line, finding.line + 2);
        for (let n = finding.line; n <= end; n++) {
          if (sourceLines[n - 1] !== undefined) lines.push(`    ${n} | ${sourceLines[n - 1].slice(0, 400)}`);
        }
      }
    }
    if (finding.suppressions?.length) lines.push(`    Suppressions: ${JSON.stringify(finding.suppressions)}`);
  }
  return lines.join('\n');
}

export function reportExitCode(findings, stages, reportOnly = false) {
  const incomplete = stages.some(stage => stage.state === 'FAILED') || findings.some(finding =>
    finding.fatal || finding.kind === 'unresolved');
  if (incomplete) return 2;
  const actionable = findings.some(finding => finding.status !== 'SUPPRESSED_REVIEW');
  return actionable && !reportOnly ? 1 : 0;
}

// Report normalization only. Does not load ESLint/Knip or change source files.
import path from 'node:path';

const KNIP_CANDIDATES = new Set([
  'dependencies', 'devDependencies', 'optionalPeerDependencies', 'exports', 'types',
  'nsExports', 'nsTypes', 'enumMembers', 'classMembers', 'catalog',
]);
const KNIP_DIAGNOSTICS = new Set(['unlisted', 'binaries', 'unresolved', 'duplicates']);

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Unexpected ${label}: expected an object`);
  }
}

function nonemptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing or invalid ${label}`);
}

function position(value, label, minimum = 1) {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < minimum)) {
    throw new Error(`Invalid ${label}: expected an integer >= ${minimum}`);
  }
}

function knipItem(item, kind) {
  record(item, `Knip ${kind} issue`);
  nonemptyString(item.name, `Knip ${kind} issue name`);
  for (const key of Object.keys(item)) {
    if (!['name', 'line', 'col', 'pos'].includes(key)) throw new Error(`Unrecognized Knip issue field: ${key}`);
  }
  position(item.line, 'Knip line');
  position(item.col, 'Knip column');
  position(item.pos, 'Knip offset', 0);
  return item;
}

function knipItems(value, kind) {
  if (!Array.isArray(value)) throw new Error(`Unexpected Knip category data: ${kind}`);
  return value.map(item => knipItem(item, kind));
}

function relativePath(file, root) {
  nonemptyString(file, 'finding file path');
  return path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
}

export function eslintFindings(data, root) {
  if (!Array.isArray(data)) throw new Error('Unexpected ESLint JSON: expected an array');
  const findings = [];
  for (const file of data) {
    record(file, 'ESLint file result');
    const filePath = relativePath(file.filePath, root);
    if (!Array.isArray(file.messages)) throw new Error('ESLint result has no messages array');
    if (file.suppressedMessages !== undefined && !Array.isArray(file.suppressedMessages)) {
      throw new Error('ESLint result has invalid suppressed messages');
    }
    for (const [items, suppressed] of [[file.messages, false], [file.suppressedMessages ?? [], true]]) {
      for (const message of items) {
        record(message, 'ESLint diagnostic');
        if (typeof message.message !== 'string') throw new Error('ESLint diagnostic has no message');
        if (message.ruleId != null) nonemptyString(message.ruleId, 'ESLint rule ID');
        for (const key of ['line', 'endLine']) position(message[key], `ESLint ${key}`);
        // The pinned Astro parser returns column 0 for some fatal diagnostics; preserve its location.
        for (const key of ['column', 'endColumn']) {
          position(message[key], `ESLint ${key}`, message.fatal === true ? 0 : 1);
        }
        if (message.fatal !== undefined && typeof message.fatal !== 'boolean') {
          throw new Error('ESLint diagnostic has invalid fatal status');
        }
        const rule = message.ruleId ?? 'parse-or-configuration';
        const configurationFailure = /^Definition for rule .+ was not found\./.test(message.message);
        const diagnostic = Boolean(message.fatal || message.ruleId == null || configurationFailure);
        findings.push({
          tool: 'eslint', file: filePath,
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
  record(data, 'Knip report');
  if (!data || !Array.isArray(data.files) || !Array.isArray(data.issues)) {
    throw new Error('Unexpected Knip JSON: expected files[] and issues[]');
  }
  for (const key of Object.keys(data)) {
    if (!['files', 'issues'].includes(key)) throw new Error(`Unrecognized Knip report field: ${key}`);
  }
  const findings = data.files.map(file => ({
    tool: 'knip', file: relativePath(file, root), line: null, column: null, endLine: null,
    kind: 'files', status: 'REVIEW_CANDIDATE',
    message: 'File not reachable from configured entry points; verify routes, URL use and dynamic loading.',
  }));
  for (const row of data.issues) {
    record(row, 'Knip file result');
    const file = relativePath(row.file, root);
    if (row.owners !== undefined) {
      if (!Array.isArray(row.owners)) throw new Error('Unexpected Knip owners: expected an array');
      for (const owner of row.owners) {
        record(owner, 'Knip owner');
        nonemptyString(owner.name, 'Knip owner name');
      }
    }
    for (const [kind, value] of Object.entries(row)) {
      if (kind === 'file' || kind === 'owners') continue;
      if (!KNIP_CANDIDATES.has(kind) && !KNIP_DIAGNOSTICS.has(kind)) {
        throw new Error(`Unrecognized Knip issue category: ${kind}; raw JSON preserved`);
      }
      let items;
      if (kind === 'enumMembers' || kind === 'classMembers') {
        record(value, `Knip ${kind} members`);
        items = Object.entries(value).flatMap(([parent, children]) => {
          nonemptyString(parent, `Knip ${kind} parent`);
          return knipItems(children, kind).map(item => ({ ...item, name: `${parent}.${item.name}` }));
        });
      } else if (kind === 'duplicates') {
        if (!Array.isArray(value)) throw new Error('Unexpected Knip duplicate groups');
        items = value.flatMap(group => knipItems(group, kind));
      } else {
        items = knipItems(value, kind);
      }
      for (const item of items) {
        findings.push({
          tool: 'knip', file, line: item.line ?? null, column: item.col ?? null,
          endLine: item.line ?? null, kind,
          status: KNIP_CANDIDATES.has(kind) ? 'REVIEW_CANDIDATE' : 'ANALYSIS_DIAGNOSTIC',
          message: `${kind}: ${item.name}`,
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

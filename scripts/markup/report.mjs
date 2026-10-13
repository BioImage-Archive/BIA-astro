import { createHash } from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function isIgnoredMessage(message) {
  return message.ruleId == null && message.severity === 1 && !message.fatal
    && /^File ignored\b/i.test(message.message);
}

// Worker evidence is an IPC boundary; malformed JSON shapes must not crash reporting.
export function isWorkerReport(value) {
  const record = item => item !== null && typeof item === 'object' && !Array.isArray(item);
  const location = item => item == null || (Number.isInteger(item) && item >= 0);
  const valid = record(value) && typeof value.timestamp === 'string' && typeof value.evidenceDir === 'string'
    && [0, 1, 2].includes(value.exitCode)
    && record(value.versions) && Object.values(value.versions).every(item => typeof item === 'string')
    && record(value.coverage)
    && ['sourceAstro', 'sourceHtml', 'generatedHtml', 'httpResponses'].every(key => Number.isInteger(value.coverage[key]) && value.coverage[key] >= 0)
    && Array.isArray(value.failures) && value.failures.every(item => typeof item === 'string')
    && Array.isArray(value.findings) && value.findings.every(item => record(item)
      && ['file', 'inputKind', 'category', 'rule', 'message'].every(key => typeof item[key] === 'string')
      && [1, 2].includes(item.severity) && location(item.line) && location(item.column)
      && (item.parseIncomplete == null || typeof item.parseIncomplete === 'boolean')
      && (item.excerpt == null || typeof item.excerpt === 'string'));
  if (!valid) return false;
  if (value.findings.some(item => (item.rule === 'parser-error'
    || ['SOURCE_PARSE_ERROR', 'INPUT_PARSE_ERROR'].includes(item.category)) && !item.parseIncomplete)) return false;
  // Partial evidence is useful for failed runs, but cannot establish completion.
  if (auditExitCode(value, true) === 2) return true;
  const hash = item => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item);
  const provenance = item => record(item) && typeof item.head === 'string'
    && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(item.head)
    && typeof item.trackedStatus === 'string' && record(item.inputHashes)
    && Object.keys(item.inputHashes).length > 0 && Object.values(item.inputHashes).every(hash);
  const kinds = { 'astro-source': 'sourceAstro', 'authored-html': 'sourceHtml',
    'generated-html': 'generatedHtml', 'http-html': 'httpResponses' };
  return typeof value.finished === 'string' && Number.isFinite(Date.parse(value.finished))
    && provenance(value.provenanceBefore) && provenance(value.provenanceAfter)
    && value.gitHead === value.provenanceBefore.head
    && JSON.stringify(value.provenanceBefore) === JSON.stringify(value.provenanceAfter)
    && value.coverage.sourceAstro > 0
    && value.coverage.sourceParseFailures === 0 && value.coverage.renderedParseFailures === 0
    && typeof value.coverage.renderedRequested === 'boolean'
    && value.coverage.renderedStatus === (value.coverage.renderedRequested ? 'CONFIGURED_INPUTS_CHECKED' : 'NOT_REQUESTED')
    && (!value.coverage.renderedRequested || value.coverage.generatedHtml + value.coverage.httpResponses > 0)
    && record(value.probes) && ['astro', 'html'].every(key => Array.isArray(value.probes[key])
      && value.probes[key].length > 0 && value.probes[key].every(item => record(item) && item.passed === true))
    && Array.isArray(value.inputs) && value.inputs.every(item => record(item)
      && typeof item.file === 'string' && Object.hasOwn(kinds, item.inputKind)
      && hash(item.sha256) && Number.isSafeInteger(item.bytes) && item.bytes >= 0
      && (item.inputKind === 'http-html' || value.provenanceBefore.inputHashes[item.file] === item.sha256))
    // Counting only analyzed inputs cannot reveal a skipped selected file.
    && record(value.inventory) && ['astro-source', 'authored-html', 'generated-html'].every(kind => {
      const expected = value.inventory[kind];
      const observed = value.inputs.filter(item => item.inputKind === kind).map(item => item.file);
      return Array.isArray(expected) && expected.every(file => typeof file === 'string')
        && new Set(expected).size === expected.length && new Set(observed).size === observed.length
        && JSON.stringify([...expected].sort()) === JSON.stringify(observed.sort());
    })
    && Object.entries(kinds).every(([kind, key]) => value.inputs.filter(item => item.inputKind === kind).length === value.coverage[key]);
}

export function normalizeMessages(reports, inputKind) {
  if (!Array.isArray(reports)) throw new Error('Analyzer results must be an array');
  for (const report of reports) {
    if (!report || typeof report.filePath !== 'string' || !Array.isArray(report.messages)) {
      throw new Error('Malformed analyzer file report');
    }
    for (const message of report.messages) {
      if (!message || typeof message.message !== 'string' || ![1, 2].includes(message.severity)
        || (message.ruleId != null && typeof message.ruleId !== 'string')
        || (message.fatal != null && typeof message.fatal !== 'boolean')
        || ['line', 'column'].some(key => message[key] != null && (!Number.isInteger(message[key]) || message[key] < 0))) {
        throw new Error('Malformed analyzer message');
      }
    }
  }
  return reports.flatMap(report => {
    const lines = typeof report.source === 'string' ? report.source.split(/\r?\n/) : [];
    return report.messages.map(message => {
      const parseIncomplete = Boolean(message.fatal || message.ruleId === 'parser-error');
      const line = lines[message.line - 1];
      const offset = Math.max(0, (message.column ?? 1) - 1);
      const start = Math.max(0, offset - 100);
      const end = offset + 180;
      return {
        inputKind, file: report.filePath,
        line: message.line ?? null, column: message.column ?? null,
        severity: message.severity,
        rule: message.ruleId ?? (message.fatal ? 'parser-error' : 'diagnostic'),
        category: parseIncomplete ? (inputKind === 'astro-source' ? 'SOURCE_PARSE_ERROR' : 'INPUT_PARSE_ERROR')
          : /explicit-closing-tags/.test(message.ruleId ?? '') && message.messageId === 'optionalEnd'
            ? 'READABILITY_POLICY' : 'MARKUP_DIAGNOSTIC',
        message: message.message, parseIncomplete,
        excerpt: line === undefined ? null : `${start > 0 ? '…' : ''}${line.slice(start, end)}${line.length > end ? '…' : ''}`,
      };
    });
  });
}

export function auditExitCode(report, reportOnly = false) {
  if (report.failures.length) return 2;
  if (report.findings.some(f => f.parseIncomplete)) return 2;
  if (report.findings.some(f => f.severity === 2)) return reportOnly ? 0 : 1;
  return 0;
}

export function renderLog(report) {
  const lines = [
    'BIA-astro markup audit',
    `Timestamp: ${report.timestamp}`,
    `Status: ${report.failures.length || report.findings.some(f => f.parseIncomplete) ? 'INCOMPLETE' : 'CONFIGURED INPUTS CHECKED'}`,
    `Exit code: ${report.exitCode}`,
    `Commit: ${report.gitHead ?? 'unavailable'}`,
    `Evidence: ${report.evidenceDir}`,
    `Versions: ${JSON.stringify(report.versions)}`,
    `Coverage: ${JSON.stringify(report.coverage)}`,
    'Analyzer coordinates are retained (usually 1-based; some parser diagnostics use 0). Generated/HTTP coordinates are NOT Astro source lines.',
    'No claim of all routes, runtime states, injected strings, or hidden browser DOM being checked.',
    '',
  ];
  for (const failure of report.failures) lines.push(`INCOMPLETE: ${failure}`);
  const groups = new Map();
  for (const f of [...report.findings].sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0))) {
    const key = `${f.inputKind} | ${f.file}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  for (const [key, findings] of groups) {
    lines.push('', `FILE: ${key}`);
    for (const f of findings) {
      lines.push(`  ${f.line ?? '-'}:${f.column ?? '-'} [${f.category}] ${f.rule}`,
        `    ${f.message}`);
      if (f.excerpt) lines.push(`    Source: ${f.excerpt}`);
      if (f.parseIncomplete) lines.push('    Remaining checks inside this file may be incomplete until the parse error is fixed.');
    }
  }
  if (!report.findings.length) lines.push('', 'No findings were recorded. Inspect Status and Coverage before interpreting this as a pass.');
  return `${lines.join('\n')}\n`;
}

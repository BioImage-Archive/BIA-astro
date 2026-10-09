// In-memory integration probe: creates no source files and does not build the site.
import assert from 'node:assert/strict';
import path from 'node:path';
import { ESLint } from 'eslint';

const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfigFile: path.resolve('configs/quality/eslint.config.mjs'),
  fix: false,
});

const source = `---
import VisibleProbe from './VisibleProbe.astro';
import UnusedImportProbe from './UnusedImportProbe.astro';
import './side-effect-probe.js';
const visibleProbeValue = 'hello';
const unusedFrontmatterProbe = 1;
const usedStyleProbe = 'blue';
const unusedStyleProbe = 'red';
---
<VisibleProbe />
<p class="presentProbe">{visibleProbeValue}</p>
<script>
  const unusedClientProbe = 1;
  console.log('script probe');
</script>
<style define:vars={{ usedStyleProbe, unusedStyleProbe }}>
  .presentProbe { color: var(--usedStyleProbe); }
  .unusedCssProbe { color: red; }
</style>
`;

const results = await eslint.lintText(source, {
  filePath: path.resolve('src/__dead_code_audit_probe__.astro'),
});
const messages = results.flatMap(result => result.messages);
assert(!messages.some(message => message.fatal), JSON.stringify(messages));
const unused = messages.filter(message => message.ruleId === '@typescript-eslint/no-unused-vars');
for (const name of ['UnusedImportProbe', 'unusedFrontmatterProbe', 'unusedClientProbe']) {
  assert(unused.some(message => message.message.includes(name)), `Probe did not detect ${name}`);
}
for (const name of ['VisibleProbe', 'visibleProbeValue']) {
  assert(!unused.some(message => message.message.includes(`'${name}'`)), `Template-use false positive: ${name}`);
}
assert(messages.some(message => message.ruleId === 'astro/no-unused-css-selector'), 'CSS rule probe missing');
assert(!messages.some(message => message.ruleId === 'astro/no-unused-css-selector' &&
  message.message.includes('presentProbe')), 'Used CSS selector incorrectly reported');
assert(messages.some(message => message.ruleId === 'astro/no-unused-define-vars-in-style' &&
  message.message.includes('unusedStyleProbe')), 'Unused style variable probe missing');
const invalid = await eslint.lintText('---\nconst = ;\n---\n<p>bad</p>', {
  filePath: path.resolve('src/__dead_code_invalid_probe__.astro'),
});
assert(invalid.some(result => result.messages.some(message => message.fatal)), 'Parse failure not detected');
const inline = await eslint.lintText('<script is:inline>const unusedInlineProbe = 1;</script>', {
  filePath: path.resolve('src/__dead_code_inline_probe__.astro'),
});
assert(!inline.some(result => result.messages.some(message => message.fatal)), 'Inline script parse failure');
assert(inline.some(result => result.messages.some(message =>
  message.ruleId === '@typescript-eslint/no-unused-vars' && message.message.includes('unusedInlineProbe'))),
'Inline browser script probe missing');
console.log('PASS: Astro frontmatter, template references, client scripts, local CSS, style variables, parse failures.');

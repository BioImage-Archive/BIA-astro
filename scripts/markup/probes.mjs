import { isIgnoredMessage } from './report.mjs';

// Executed against the installed analyzers before trusting any project report.
// Pure helper tests are separate; these are actual parser/validator integration tests.
export const astroFixtures = [
  ['closed containers', '<section><div>OK</div></section>', false],
  ['void elements', '<section><img src="x" alt="x"><br><input></section>', false],
  ['self-closed components and slot', '<Layout><Card /><slot /></Layout>', false],
  ['paired component', '<Card><span>OK</span></Card>', false],
  ['paired member component', '<UI.Card><p>OK</p></UI.Card>', false],
  ['missing member component close', '<UI.Card><p>OK</p>', true],
  ['paired namespaced element', '<svg><svg:path></svg:path></svg>', false],
  ['missing namespaced element close', '<svg><svg:path></svg>', true],
  ['Astro self-closed native element', '<div />', false],
  ['SVG self-closing', '<svg><path d="M0 0" /></svg>', false],
  ['fragments and map', '---\nconst rows = [1, 2];\n---\n<>{rows.map(x => <div>{x}</div>)}</>', false],
  ['conditional markup', '---\nconst show = true;\n---\n<section>{show && <div>OK</div>}</section>', false],
  ['comments are not tags', '<!-- <section><div> --><div>OK</div>', false],
  ['frontmatter strings are not tags', '---\nconst example = "<div><section>";\n---\n<pre>{example}</pre>', false],
  ['script strings are not tags', '<script>const example = "<div>";</script>', false],
  ['typed client script', '<script>const value: string = "<div>";</script>', false],
  ['set html boundary', '<div set:html={"<span>text</span>"} />', false],
  ['attribute angle bracket', '<div title={1 > 0 ? ">" : "<"}></div>', false],
  ['missing outer section', '<section><div>text</div>', true],
  ['missing nested div', '<section><div>text</section>', true],
  ['crossed tags', '<div><section></div></section>', true],
  ['stray closing tag', '<div></div></section>', true],
  ['missing ignored-named component close', '<IgnoredCard><div>text</div>', true],
  ['missing component close', '<Layout><div>OK</div>', true],
  ['optional li policy', '<ul><li>one<li>two</ul>', true],
  ['optional p policy', '<p>one<p>two', true],
];

export const htmlFixtures = [
  ['closed fragment', '<section><div>OK</div></section>', false],
  ['missing section', '<section><div>OK</div>', true],
  ['crossed elements', '<div><section></div></section>', true],
  ['stray close', '<div></div></section>', true],
  ['bad document nesting', '<html><head><title>T</title></head><header>Bad</header><body></body></html>', true],
  ['nested anchors', '<a href="a"><a href="b">B</a></a>', true],
  ['nested buttons', '<button><button>Bad</button></button>', true],
  ['duplicate IDs', '<div id="x"></div><section id="x"></section>', true],
  ['tokenizer failure', '<div title="unfinished</div>', true],
  ['duplicate attributes', '<div class="a" class="b"></div>', true],
  ['void closing tag', '<img src="x" alt="x"></img>', true],
  ['raw HTML nonvoid slash', '<div/>', true],
  ['rendered optional endings allowed', '<ul><li>one<li>two</ul>', false],
  ['valid void and foreign markup', '<section><img src="x" alt="x"><svg><path d="M0 0" /></svg></section>', false],
];

export async function probeAstro(eslint, filepath) {
  const results = [];
  for (const [name, code, bad] of astroFixtures) {
    const reports = await eslint.lintText(code, { filePath: filepath, warnIgnored: true });
    const messages = reports.flatMap(r => r.messages);
    const ignored = messages.some(isIgnoredMessage);
    const observedBad = messages.some(m => m.severity === 2);
    const passed = reports.length === 1 && !ignored && observedBad === bad;
    results.push({ name, expectedError: bad, passed, messages });
  }
  return results;
}

export async function probeHtml(validator) {
  const results = [];
  for (const [name, code, bad] of htmlFixtures) {
    const report = await validator.validateString(code, '__markup_probe__.html');
    results.push({ name, expectedError: bad, passed: (!report.valid) === bad, results: report.results });
  }
  return results;
}

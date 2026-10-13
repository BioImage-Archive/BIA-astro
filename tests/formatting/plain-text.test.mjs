import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HtmlValidate } from 'html-validate';
import { escapeHtmlText, multilineTextRender } from '../../src/components/formatting/plain-text.js';

const validator = new HtmlValidate({ extends: [], rules: { 'close-order': 'error' } });
const comparisons = [
    ['S-BIAD1013', 'nuclear area <50μm2'],
    ['S-BIAD1419', '<1 mm parasagittal cerebellar tissue'],
    ['S-BIAD1763', 'read noise of <1.'],
    ['S-BIAD1879', 'precision of<1 µm.'],
    ['S-BIAD1900', 'subcellular resolution (<=2um)'],
    ['S-BIAD1977', 'sieving series (5, 10, and <230 meshes)'],
    ['S-BIAD2252', 'cytoplasm higher than nucleus (N<C)'],
    ['S-BIAD2259', 'vesicles at <45 nm from the PM'],
    ['S-BIAD2485', 'enlarged somas (P<0.001)'],
    ['S-BIAD29', 'IC50 <20 μM, including IC50 < 1 μM'],
    ['S-BIAD3103', 'small fraction of cells (typically <1%)'],
    ['S-BIAD545', 'n<10 cells, or <300 pixels'],
    ['S-BIAD651', 'maintained on the slide for <5 min'],
    ['S-BIAD657', 'stored (preferably for <48 hours)'],
    ['S-BIAD922', 'dextran (35 mg/kg; <50 μL)'],
    ['S-BIAD961', 'weighted mfD values <0 were set to 0'],
];

for (const [study, text] of comparisons) {
    test(`${study}: scientific comparison remains text and tokenizes completely`, async () => {
        const html = multilineTextRender(text);
        assert.equal(html, text.replaceAll('<', '&lt;'));
        const report = await validator.validateString(`<div>${html}</div>`);
        assert.equal(report.valid, true, JSON.stringify(report.results));
    });
}

test('escape text before adding paragraph markup, preserving scientific and Unicode characters', () => {
    assert.equal(multilineTextRender('  N<C & P>0.05\r\n\r\n≤1 µm\nnext\rfinal  '),
        'N&lt;C &amp; P&gt;0.05<br/><br/>≤1 µm<br/><br/>next<br/><br/>final');
});

test('literal metadata markup cannot become elements, attributes or closing boundaries', async () => {
    const text = '</div><img src=x onerror="alert(1)"><script>alert(1)</script>';
    const html = multilineTextRender(text);
    assert.ok(!html.includes('<'));
    assert.equal((await validator.validateString(`<div>${html}</div>`)).valid, true);
});

test('metadata entities are literal text, without recursive interpretation', () => {
    assert.equal(escapeHtmlText('&lt;1 &amp; <1'), '&amp;lt;1 &amp;amp; &lt;1');
});

test('literal pipes are preserved rather than converted into paragraph breaks', () => {
    assert.equal(multilineTextRender('A|B\nC'), 'A|B<br/><br/>C');
});

test('ordinary text, quotes, empty text and numeric values keep their text representation', () => {
    assert.equal(multilineTextRender('  "brain" tissue  '), '"brain" tissue');
    assert.equal(multilineTextRender(''), '');
    assert.equal(multilineTextRender(0), '0');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMetadataValue } from '../../src/components/formatting/metadata-values.js';

const render = (key, value, preserve = false) => renderMetadataValue(key, value, '/external.png', preserve);

test('plain acquisition values escape markup and preserve literal pipes', () => {
    assert.equal(render('protocol_description', '<script>bad</script> | valid'), '&lt;script&gt;bad&lt;/script&gt; | valid');
    assert.equal(render('protocol_description', 'line one\nline two'), 'line one, line two');
    assert.equal(render('protocol_description', 'line one\nline two', true), 'line one\nline two');
    assert.equal(render('protocol_description', 0), '0');
    assert.equal(render('protocol_description', false), 'false');
});

test('taxon identifiers remain one encoded query value with escaped labels', () => {
    const identifier = '9606&name=<img src=x>';
    const html = render('organism_classification', [{ scientific_name: '<em>human</em>', ncbi_id: identifier }]);
    const target = html.match(/href="([^"]+)"/)[1];
    assert.equal(new URL(target).searchParams.get('id'), identifier);
    assert.equal(new URL(target).searchParams.size, 1);
    assert.match(html, /&lt;em&gt;human&lt;\/em&gt;/);
    assert.doesNotMatch(html, /<em>|<img src=x>/);
});

test('partial taxa remain readable and absent malformed entries are omitted', () => {
    const input = Object.freeze([null, false, Object.freeze({ common_name: 'Mouse' }), Object.freeze({ ncbi_id: '9606' })]);
    const html = render('organism_classification', input);
    assert.equal((html.match(/<li\b/g) ?? []).length, 2);
    assert.doesNotMatch(html, /null|undefined/);
    assert.match(html, /Mouse/);
    assert.match(html, /id=9606/);
});

test('growth protocol text and ontology searches retain their own rendering contracts', () => {
    assert.equal(render('growth_protocol', { protocol_description: '<growth> | original' }), '&lt;growth&gt; | original');
    const html = render('fbbi_id', ['FBbi:00000639']);
    assert.match(html, /q=FBbi%3A00000639&amp;ontology=fbbi/);
    assert.doesNotMatch(html, /entities|classes/);
});

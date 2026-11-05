import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, mock, test } from 'node:test';
import { envField } from 'astro/config';
import { createComponentRenderer } from '../../../support/astro/render-component.mjs';

const response = JSON.parse(await readFile(new URL('../../../fixtures/api/study-s-biad3335-response.json', import.meta.url)));
const study = response.hits.hits.find(hit => hit._source.accession_id === 'S-BIAD3335')._source;
const taxon = study.dataset[0].biological_entity[0].organism_classification[0];
const base = { title: 'Partial dataset', acquisition_process: [{ imaging_method_name: ['Confocal', 'Confocal', 'TEM'] }] };
const description = 'Embryo <sample> & "intact"\nSecond line';
const missingEntities = { null: null, object: {}, text: 'invalid', empty: [] };
const missingMethods = { null: null, empty: [], partial: [null, {}, { imaging_method_name: null }] };
const cases = {
    'missing-omitted': { ...base },
    'no-method-omitted': { title: base.title, biological_entity: [{ organism_classification: [taxon] }] },
    ...Object.fromEntries(study.dataset.map((dataset, index) => ['captured-' + index, dataset])),
    ...Object.fromEntries(Object.entries(missingEntities).map(([name, biological_entity]) => ['missing-' + name, { ...base, biological_entity }])),
    description: { ...base, biological_entity: [{ biological_entity_description: description }, { organism_classification: [], biological_entity_description: 'Another sample' }] },
    mixed: { ...base, biological_entity: [null, { biological_entity_description: {} }, { organism_classification: [null, {}, [], 'invalid', taxon], biological_entity_description: description }],
        acquisition_process: [null, { imaging_method_name: [null, 'Confocal', 'Confocal', 0, 'TEM'] }, { imaging_method_name: null }] },
    ...Object.fromEntries(Object.entries(missingMethods).map(([name, acquisition_process]) => ['no-method-' + name, { title: base.title, acquisition_process, biological_entity: [{ organism_classification: [taxon] }] }])),
};
let renderer;
const results = {};
const api = 'https://fixture.invalid';
const originalApi = process.env.PUBLIC_SEARCH_API;
after(async () => {
    mock.restoreAll();
    if (originalApi === undefined) delete process.env.PUBLIC_SEARCH_API;
    else process.env.PUBLIC_SEARCH_API = originalApi;
    await renderer?.close();
});

before(async () => {
    process.env.PUBLIC_SEARCH_API = api;
    const fetch = mock.method(globalThis, 'fetch', async () => {
        return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
    });
    renderer = await createComponentRenderer({
        env: { schema: { PUBLIC_SEARCH_API: envField.string({ access: 'public', context: 'client' }) } },
    });
    for (const [name, dataset] of Object.entries(cases)) {
        const before = structuredClone(dataset);
        results[name] = { html: await renderer.render('src/components/ai-benchmarking/DatasetInfo.astro', {
            dataset, datasetAIInfo: { annotation_method_override: 'Annotation retained' }, studyAccessionID: 'S-BIAD3335',
        }) };
        assert.deepEqual(dataset, before, name + ': input must not be mutated');
    }
    assert.deepEqual(fetch.mock.calls.map(call => String(call.arguments[0])),
        Object.keys(cases).map(() => api + '/website/study?facet.accession_id=S-BIAD3335'));
});

function rendered(name) {
    assert.match(results[name].html, /<b>Annotation Method:<\/b> Annotation retained/, name);
    return results[name].html;
}

test('captured datasets retain their titles, organism names, descriptions and imaging methods', () => {
    for (const [index, dataset] of study.dataset.entries()) {
        const html = rendered('captured-' + index);
        assert(html.includes(dataset.title));
        assert.match(html, /<i>Mus musculus<\/i> \(Mouse\)/);
        assert(html.includes(dataset.biological_entity[0].biological_entity_description));
        assert(html.includes(dataset.acquisition_process[0].imaging_method_name[0]));
    }
});

test('missing or malformed biological records do not suppress independent imaging metadata', () => {
    for (const name of Object.keys(cases).filter(name => name.startsWith('missing-'))) {
        const html = rendered(name);
        assert.doesNotMatch(html, /<b>Organism:|<b>Biological Entity:/, name);
        assert.match(html, /<b>Imaging Method:<\/b> Confocal, TEM/, name);
    }
});

test('biological descriptions remain independent of taxonomy and null members retain valid neighbours', () => {
    for (const name of ['description', 'mixed']) {
        const html = rendered(name);
        assert.match(html, /Embryo &lt;sample&gt; &amp; &quot;intact&quot;\nSecond line/, name);
        assert.match(html, /<b>Imaging Method:<\/b> Confocal, TEM/, name);
        assert.doesNotMatch(html, /\bundefined\b|\bnull\b|\[object Object\]/, name);
    }
    assert.match(rendered('description'), /Second line, Another sample/);
    assert.doesNotMatch(rendered('description'), /<b>Organism:/);
    assert.match(rendered('mixed'), /<i>Mus musculus<\/i> \(Mouse\)/);
});

test('organisms remain visible when acquisition metadata is absent or contains null records', () => {
    for (const name of Object.keys(cases).filter(name => name.startsWith('no-method-'))) {
        const html = rendered(name);
        assert.match(html, /<i>Mus musculus<\/i> \(Mouse\)/, name);
        assert.doesNotMatch(html, /<b>Imaging Method:|<b>Biological Entity:/, name);
    }
});

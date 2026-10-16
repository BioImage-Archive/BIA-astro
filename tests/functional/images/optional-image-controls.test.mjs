import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { parse } from '@astrojs/compiler';
import ts from 'typescript';

const tableScript = await readFile(new URL('../../../src/components/ViewableImageTable.js', import.meta.url), 'utf8');
const imageSource = await readFile(new URL('../../../src/pages/image/[uuid].astro', import.meta.url), 'utf8');
const response = JSON.parse(await readFile(new URL('../../fixtures/api/browse-image-response.json', import.meta.url)));
const accessionID = response.hits.hits[0]._source.accession_id;
const { ast } = await parse(imageSource);
function scripts(node) {
    return [
        ...(node.type === 'element' && node.name === 'script' ? [node] : []),
        ...(node.children || []).flatMap(scripts),
    ];
}
const copyScripts = scripts(ast).map(node => node.children.map(child => child.value || '').join(''))
    .filter(script => script.includes('"CopyURLButton"'));
assert.equal(copyScripts.length, 1);
const copyScript = ts.transpileModule(copyScripts[0], { compilerOptions: { target: ts.ScriptTarget.ES2022, alwaysStrict: true } }).outputText;

test('an absent viewable-image table needs no jQuery and registers no handlers', () => {
    const events = [];
    vm.runInNewContext('"use strict";\n' + tableScript, {
        document: { querySelector: () => null, addEventListener: (...args) => events.push(args) },
    });
    assert.deepEqual(events, []);
});

test('a present table still initializes and delivers its requested image records', async () => {
    const events = new Map(), requests = [];
    let options;
    const element = { dataset: { studyAccessionId: accessionID, apiPath: '/search/v1' } };
    const jquery = () => ({ DataTable(config) { options = config; return { on() {} }; }, on() {} });
    jquery.fn = { DataTable: { isDataTable: () => false } };
    vm.runInNewContext('"use strict";\n' + tableScript, {
        document: {
            querySelector: selector => selector === '#viewable_images_table' ? element : null,
            addEventListener: (name, handler) => events.set(name, handler),
        },
        window: { addEventListener() {} }, history: { state: null },
        sessionStorage: { getItem: () => null }, $: jquery,
        async fetch(url) { requests.push(new URL(url, 'https://example.org')); return { json: async () => structuredClone(response) }; },
    });
    events.get('DOMContentLoaded')();
    let result;
    await options.ajax({ start: 0, length: 10, search: { value: 'brain tissue' }, draw: 7 }, value => { result = value; });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].pathname, '/search/v1/website/browse/image');
    assert.equal(requests[0].searchParams.get('facet.accession_id'), accessionID);
    assert.equal(requests[0].searchParams.get('query'), 'brain tissue');
    assert.equal(result.draw, 7);
    assert.equal(result.recordsTotal, response.hits.total.value);
    assert.equal(result.data[0].uuid, response.hits.hits[0]._source.uuid);
});

test('an absent image copy button needs no clipboard API', () => {
    vm.runInNewContext(copyScript, { document: { getElementById(id) { assert.equal(id, 'CopyURLButton'); return null; } } });
});

test('a present copy button copies its URI and restores its original label', async () => {
    const button = { innerText: 'Copy OME-Zarr URI', dataset: { url: 'https://example.org/image.ome.zarr?version=1&part=2' } };
    const copied = [], timers = [];
    vm.runInNewContext(copyScript, {
        document: { getElementById(id) { assert.equal(id, 'CopyURLButton'); return button; } },
        navigator: { clipboard: { writeText: async value => copied.push(value) } },
        setTimeout: callback => timers.push(callback),
    });
    await button.onclick();
    assert.deepEqual(copied, [button.dataset.url]);
    assert.equal(button.innerText, 'URI Copied');
    timers[0]();
    assert.equal(button.innerText, 'Copy OME-Zarr URI');
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { parse } from '@astrojs/compiler';
import ts from 'typescript';

const tableScript = await readFile(new URL('../../src/components/ViewableImageTable.js', import.meta.url), 'utf8');
const imageSource = await readFile(new URL('../../src/pages/image/[uuid].astro', import.meta.url), 'utf8');
const { ast } = await parse(imageSource);
function findScripts(node) {
    return [
        ...(node.type === 'element' && node.name === 'script' ? [node] : []),
        ...(node.children || []).flatMap(findScripts),
    ];
}
const copyScripts = findScripts(ast).map(node => node.children.map(child => child.value || '').join(''))
    .filter(script => script.includes('"CopyURLButton"'));
assert.equal(copyScripts.length, 1);
const copyScript = ts.transpileModule(copyScripts[0], {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

test('an absent viewable-image table registers no handlers and needs no jQuery', () => {
    const events = [];
    vm.runInNewContext(tableScript, {
        document: {
            querySelector: () => null,
            addEventListener: (...args) => events.push(args),
        },
    });
    assert.deepEqual(events, []);
});

test('a present table retains initialization, image destinations and its API request', async () => {
    const events = new Map();
    const calls = [];
    let options;
    const table = { on: (...args) => calls.push(args) };
    const element = { dataset: {
        studyAccessionId: 'S-BIAD3335', imagePageRoot: 'galleries/spatialomics/image',
        imageFallbackSrc: '/fallback.png', apiPath: '/search/v1',
    } };
    const jquery = () => ({
        DataTable: config => { options = config; return table; },
        on: (...args) => calls.push(args),
    });
    jquery.fn = { DataTable: { isDataTable: () => false } };
    const requests = [];
    const image = { uuid: 'image-id', dataset_title: 'Dataset A' };
    vm.runInNewContext(tableScript, {
        document: {
            querySelector: () => element,
            addEventListener: (name, handler) => events.set(name, handler),
        },
        window: { addEventListener: (name, handler) => events.set(name, handler) },
        history: { state: null }, sessionStorage: { getItem: () => null },
        $: jquery,
        fetch: async url => {
            requests.push(url);
            return { json: async () => ({ hits: { hits: [{ _source: image }], total: { value: 1 } } }) };
        },
    });
    events.get('DOMContentLoaded')();
    assert.equal(options.serverSide, true);
    assert.equal(options.pageLength, 10);
    assert.match(options.columns[5].render(null, null, image), /galleries\/spatialomics\/image\/image-id/);
    assert.match(options.columns[0].render(null, null, image), /src="\/fallback.png"/);
    let result;
    await options.ajax({ start: 0, length: 10, search: { value: 'brain tissue' }, draw: 7 }, value => { result = value; });
    assert.equal(requests[0], '/search/v1/website/browse/image?facet.accession_id=S-BIAD3335&query=brain%20tissue&pagination.page_size=10&pagination.page=1');
    assert.equal(result.draw, 7);
    assert.equal(result.recordsTotal, 1);
    assert.equal(result.data[0], image);
    assert(events.has('pagehide'));
    assert(calls.length > 0);
});

test('an image without an OME-Zarr copy button needs no clipboard API', () => {
    vm.runInNewContext(copyScript, { document: { getElementById: () => null } });
});

test('an image copy button copies its supplied URI and restores its label', async () => {
    const button = { innerText: 'Copy OME-Zarr URI', dataset: { url: 'https://example.org/image.ome.zarr' } };
    const copied = [];
    const timers = [];
    vm.runInNewContext(copyScript, {
        document: { getElementById: () => button },
        navigator: { clipboard: { writeText: async text => copied.push(text) } },
        setTimeout: (callback, duration) => timers.push({ callback, duration }),
    });
    await button.onclick();
    assert.deepEqual(copied, [button.dataset.url]);
    assert.equal(button.innerText, 'URI Copied');
    assert.equal(timers[0].duration, 700);
    timers[0].callback();
    assert.equal(button.innerText, 'Copy OME-Zarr URI');
});

for (const name of ['BaseLayout', 'EMPIARLayout', 'ProjectsLayout']) {
    test(`${name} loads blocking jQuery before dependent DataTables`, async () => {
        const source = await readFile(new URL(`../../src/layouts/${name}.astro`, import.meta.url), 'utf8');
        const { ast } = await parse(source);
        const scripts = findScripts(ast);
        const src = node => node.attributes.find(attribute => attribute.name === 'src')?.value;
        const jquery = scripts.findIndex(node => src(node)?.includes('code.jquery.com'));
        const datatables = scripts.findIndex(node => src(node)?.includes('cdn.datatables.net'));
        assert(jquery >= 0 && datatables > jquery);
        for (const script of [scripts[jquery], scripts[datatables]]) {
            assert(script.attributes.some(attribute => attribute.name === 'is:inline'));
            assert(!script.attributes.some(attribute => ['async', 'defer', 'type'].includes(attribute.name)));
        }
    });
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { parse } from '@astrojs/compiler';

const source = await readFile(new URL('../../src/pages/galleries/volumeem.astro', import.meta.url), 'utf8');
const { ast } = await parse(source);
const scripts = ast.children.filter(node => node.type === 'element' && node.name === 'script'
    && node.attributes.some(attribute => attribute.name === 'is:inline'));
assert.equal(scripts.length, 1);
const script = scripts[0].children.map(node => node.type === 'text' ? node.value : '').join('');

function loadGallery() {
    const events = new Map();
    const views = new Map(['card-view', 'table-view', 'grid-view'].map(id => [id, { style: {} }]));
    const search = { addEventListener: (name, handler) => events.set(`search:${name}`, handler) };
    const counts = { totalCount: {}, visibleCount: {} };
    const radioHandlers = [];
    const radios = ['card-view', 'table-view', 'grid-view'].map(() => ({
        addEventListener: (name, handler) => {
            assert.equal(name, 'change');
            radioHandlers.push(handler);
        },
    }));
    const grid = { style: {} };
    const sizeBar = { style: {} };
    const cube = { style: {} };
    let adjustments = 0;
    const tableCalls = [];
    const document = {
        addEventListener: (name, handler) => events.set(name, handler),
        getElementById: id => views.get(id) || counts[id] || (id === 'searchBox' ? search : null),
        querySelector: selector => selector === '.grid-inner' ? grid : null,
        querySelectorAll: selector => ({
            'input[name="view"]': radios,
            '.size-bar': [sizeBar],
            '.cube-wrapper': [cube],
            '.vf-card': [],
        })[selector] || [],
    };
    const sandbox = {
        document, URL, console,
        DataTable: class {
            constructor(selector, options) {
                tableCalls.push({ selector, options });
                this.columns = { adjust: () => { adjustments++; } };
            }
        },
    };
    sandbox.window = sandbox;
    vm.runInNewContext(script, sandbox, { filename: 'volumeem-inline-script.js' });
    return { events, views, radioHandlers, grid, sizeBar, cube, tableCalls, sandbox,
        adjustments: () => adjustments };
}

test('switching to the table uses the initialized table instance', () => {
    const gallery = loadGallery();
    gallery.events.get('DOMContentLoaded')();
    assert.equal(gallery.tableCalls.length, 1);
    assert.equal(gallery.tableCalls[0].selector, '.vf-table');
    assert.equal(gallery.tableCalls[0].options.pageLength, 25);
    gallery.radioHandlers[1]({ target: { checked: true, value: 'table-view' } });
    assert.equal(gallery.adjustments(), 1);
    assert.equal(gallery.views.get('table-view').style.display, 'block');
    assert.equal(gallery.views.get('card-view').style.display, 'none');
    assert.equal(gallery.views.get('grid-view').style.display, 'none');
});

test('grid and card switches do not adjust table columns', () => {
    const gallery = loadGallery();
    gallery.events.get('DOMContentLoaded')();
    for (const value of ['grid-view', 'card-view']) {
        gallery.radioHandlers[0]({ target: { checked: true, value } });
        assert.equal(gallery.views.get(value).style.display, 'block');
    }
    gallery.radioHandlers[0]({ target: { checked: false, value: 'table-view' } });
    assert.equal(gallery.adjustments(), 0);
});

test('changing grid density preserves the size-bar and cube visibility contract', () => {
    const gallery = loadGallery();
    gallery.events.get('DOMContentLoaded')();
    assert.equal(gallery.grid.style.gridTemplateColumns, 'repeat(4, 1fr)');
    gallery.sandbox.setGridColumns(5);
    assert.equal(gallery.sizeBar.style.display, 'none');
    assert.equal(gallery.cube.style.display, 'none');
    gallery.sandbox.setGridColumns(3);
    assert.equal(gallery.sizeBar.style.display, '');
    assert.equal(gallery.cube.style.display, '');
});

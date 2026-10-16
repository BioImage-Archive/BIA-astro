import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { parse } from '@astrojs/compiler';

const source = await readFile(new URL('../../../../src/pages/galleries/volumeem.astro', import.meta.url), 'utf8');
const { ast } = await parse(source);
function scripts(node) {
    return [
        ...(node.type === 'element' && node.name === 'script' ? [node] : []),
        ...(node.children || []).flatMap(scripts),
    ];
}
const viewScripts = scripts(ast).map(node => node.children.map(child => child.value || '').join(''))
    .filter(script => script.includes('function toggleView('));
assert.equal(viewScripts.length, 1);

function gallery() {
    const views = ['card-view', 'table-view', 'grid-view'];
    const elements = new Map(views.map(id => [id, { style: { display: id === 'card-view' ? 'block' : 'none' } }]));
    const changes = new Map();
    const grid = { style: {} };
    let ready, instances = 0, adjustments = 0;
    elements.set('searchBox', { addEventListener() {} });
    elements.set('totalCount', { textContent: '' });
    const context = {
        document: {
            getElementById(id) { assert(elements.has(id), id); return elements.get(id); },
            querySelector(selector) { assert.equal(selector, '.grid-inner'); return grid; },
            querySelectorAll(selector) {
                if (selector === '.vf-card') return [{}, {}];
                if (selector === 'input[name="view"]') return views.map(value => ({
                    addEventListener(event, handler) { assert.equal(event, 'change'); changes.set(value, handler); },
                }));
                assert(['.size-bar', '.cube-wrapper'].includes(selector), selector);
                return [];
            },
            addEventListener(event, handler) { assert.equal(event, 'DOMContentLoaded'); ready = handler; },
        },
        DataTable: class {
            constructor(selector) {
                assert.equal(selector, '.vf-table');
                instances++;
                this.columns = { adjust() {
                    assert.equal(elements.get('table-view').style.display, 'block');
                    adjustments++;
                } };
            }
        },
    };
    context.window = context;
    vm.runInNewContext('"use strict";\n' + viewScripts[0], context);
    return {
        context, ready,
        select(value, checked = true) { changes.get(value)({ target: { value, checked } }); },
        display: () => views.map(id => elements.get(id).style.display),
        instances: () => instances,
        adjustments: () => adjustments,
    };
}

test('gallery radios reuse the initialized table and adjust it only after showing Table view', () => {
    const page = gallery();
    page.ready();
    for (const [view, visible, adjustments] of [
        ['table-view', ['none', 'block', 'none'], 1],
        ['grid-view', ['none', 'none', 'block'], 1],
        ['card-view', ['block', 'none', 'none'], 1],
        ['table-view', ['none', 'block', 'none'], 2],
    ]) {
        page.select(view);
        assert.deepEqual(page.display(), visible);
        assert.equal(page.adjustments(), adjustments);
    }
    page.select('card-view', false);
    assert.deepEqual(page.display(), ['none', 'block', 'none']);
    assert.equal(page.instances(), 1);
});

test('Table view can be shown before table initialization without accessing an unavailable instance', () => {
    const page = gallery();
    page.context.toggleView('table-view');
    assert.deepEqual(page.display(), ['none', 'block', 'none']);
    assert.equal(page.instances(), 0);
    assert.equal(page.adjustments(), 0);
});

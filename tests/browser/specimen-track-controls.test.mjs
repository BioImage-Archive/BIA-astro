import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/components/ViewableImageTable.js', import.meta.url), 'utf8');

function mount({ hasTable = true, hasTracks = false, hasToggle = hasTracks, restored = null } = {}) {
    const events = new Map();
    const handlers = new Map();
    const requests = [];
    const storage = new Map();
    const tableElement = { dataset: {
        studyAccessionId: 'S-BIAD843', imagePageRoot: '', imageFallbackSrc: '/fallback.png',
        apiPath: '/search/v1', hasSpecimenTracks: String(hasTracks),
    } };
    const toggle = { checked: false, addEventListener: (event, handler) => handlers.set(event, handler) };
    const search = restored?.search || '';
    const size = restored?.pageSize || 10;
    let start = 0;
    let options;
    let reload;
    const page = () => ({ draw() {} });
    page.len = () => size;
    const table = {
        search: () => search, page, on() {},
        ajax: { reload() { start = 0; reload = draw(); } },
    };
    async function draw() {
        await options.ajax({ start, length: size, search: { value: search }, draw: requests.length + 1 }, () => {});
        options.drawCallback.call({ api: () => table });
    }
    const jquery = selector => selector === '#viewable_images_table' ? {
        DataTable(config) { options = config; start = config.displayStart; return table; }, on() {},
    } : { length: 0 };
    jquery.fn = { DataTable: { isDataTable: () => false } };
    vm.runInNewContext(source, {
        document: {
            querySelector(selector) {
                if (selector === '#viewable_images_table') return hasTable ? tableElement : null;
                assert.equal(selector, '#showDisplayImagesToggle');
                return hasToggle ? toggle : null;
            },
            addEventListener: (event, handler) => events.set(event, handler),
        },
        window: { scrollY: 0, scrollTo() {}, addEventListener: (event, handler) => events.set(event, handler) },
        sessionStorage: {
            getItem: () => restored ? JSON.stringify(restored) : null,
            setItem: (key, value) => storage.set(key, JSON.parse(value)),
        },
        history: { state: null, replaceState() {} }, requestAnimationFrame: callback => callback(), $: jquery,
        async fetch(url) {
            requests.push(new URL(url, 'https://example.org'));
            return { json: async () => ({ hits: { hits: [], total: { value: 8 } }, pagination: {} }) };
        },
    });
    return {
        events, handlers, requests, storage, toggle,
        async initialize() { events.get('DOMContentLoaded')?.(); if (options) await draw(); },
        async change(checked) { toggle.checked = checked; handlers.get('change')?.(); await reload; },
    };
}

const savedState = () => ({
    savedAt: Date.now(), search: 'tilt series', pageSize: 25, displayPage: 2, totalPages: 30,
    pageCursorEntries: [[401, 'old-cursor']], showDisplayImages: false,
});

test('an absent table cannot initialize specimen-track controls or request images', async () => {
    const app = mount({ hasTable: false, hasTracks: true });
    await app.initialize();
    assert.equal(app.events.size, 0);
    assert.equal(app.handlers.size, 0);
    assert.equal(app.requests.length, 0);
});

test('studies without specimen tracks retain unfiltered requests and no toggle handler', async () => {
    const app = mount();
    await app.initialize();
    assert.equal(app.handlers.size, 0);
    assert.equal(app.requests[0].searchParams.has('has.specimen_track_display_image'), false);
});

test('the display-image switch defaults off, filters when enabled and persists its choice', async () => {
    const app = mount({ hasTracks: true });
    await app.initialize();
    assert.equal(app.toggle.checked, false);
    assert.equal(app.requests[0].searchParams.has('has.specimen_track_display_image'), false);
    await app.change(true);
    assert.equal(app.requests.at(-1).searchParams.get('has.specimen_track_display_image'), 'true');
    assert.equal(app.requests.at(-1).searchParams.get('pagination.page'), '1');
    assert.equal([...app.storage.values()].at(-1).showDisplayImages, true);
    await app.change(false);
    assert.equal(app.requests.at(-1).searchParams.has('has.specimen_track_display_image'), false);
    assert.equal([...app.storage.values()].at(-1).showDisplayImages, false);
});

test('changing the filter clears old cursors and paging while preserving search and page size', async () => {
    const app = mount({ hasTracks: true, restored: savedState() });
    await app.initialize();
    assert.equal(app.requests[0].searchParams.get('pagination.page'), '2');
    await app.change(true);
    const request = app.requests.at(-1);
    assert.equal(request.searchParams.get('pagination.page'), '1');
    assert.equal(request.searchParams.has('cursor'), false);
    assert.equal(request.searchParams.get('query'), 'tilt series');
    assert.equal(request.searchParams.get('pagination.page_size'), '25');
    assert.deepEqual([...app.storage.values()].at(-1).pageCursorEntries, []);
});

test('restored filter selection is reflected in the checkbox and first request', async () => {
    const app = mount({ hasTracks: true, restored: { ...savedState(), showDisplayImages: true } });
    await app.initialize();
    assert.equal(app.toggle.checked, true);
    assert.equal(app.requests[0].searchParams.get('has.specimen_track_display_image'), 'true');
});

test('a stale saved filter cannot restrict a study without specimen tracks', async () => {
    const app = mount({ restored: { ...savedState(), showDisplayImages: true } });
    await app.initialize();
    assert.equal(app.requests[0].searchParams.has('has.specimen_track_display_image'), false);
});

test('a missing optional toggle does not prevent an available table from loading', async () => {
    const app = mount({ hasTracks: true, hasToggle: false });
    await app.initialize();
    assert.equal(app.handlers.size, 0);
    assert.equal(app.requests.length, 1);
    assert.equal(app.requests[0].searchParams.has('has.specimen_track_display_image'), false);
});

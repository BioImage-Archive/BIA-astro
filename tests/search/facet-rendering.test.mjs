import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(repository, 'artifacts/search-rendering');
let root;
let server;
const pages = {};
const cases = {
    canonical: "size_t=1",
    legacy: "size_t=+1&facet.image_format=czi",
    alias: "size_t.eq=+1",
    repeated: "size_t=1&size_t=2-10&facet.image_format=czi&pagination.page_size=25&sort_by=accession_id&sort_order=asc",
    missing: "size_t=2-10",
    omitted: "size_t=2-10",
    empty: "size_t=0",
    range: "size_t=2-10&total_physical_size_x=%E2%89%A40.000000001000000",
    study: "facet.year=2025",
    unavailable: "size_t=1",
    blank: "size_t=&size_t.eq=1",
    missing_channels: "size_c=1",
    omitted_channels: "size_c=1",
    missing_year: "facet.year=2025",
    omitted_year: "facet.year=2025",
    foreign_study: "size_t=1",
    foreign_image: "facet.year=2025",
    scientific_bounds: "total_physical_size_x=%3E1e-9&total_physical_size_y=%E2%89%A42e-9&voxel_physical_size_x=1e-9-2e-9",
    malformed_range: "size_t=1-2-3",
    scientific: "total_physical_size_x=1e-9&total_physical_size_y=2.50e-12&voxel_physical_size_x=1e-9",

};
const requests = [];
let imageFixture;

after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (root) await rm(root, { recursive: true, force: true });
});

before(async () => {
    const fixture = JSON.parse(await readFile(path.join(repository, 'tests/fixtures/api/browse-image-response.json')));
    imageFixture = fixture;
    const studyFixture = JSON.parse(await readFile(path.join(repository, 'tests/fixtures/api/browse-study-response.json')));
    server = createServer((request, response) => {
        const url = new URL(request.url, 'http://local');
        requests.push(url);
        if (url.searchParams.get('query') === 'unavailable') {
            response.writeHead(503);
            response.end();
            return;
        }
        const data = structuredClone(url.pathname.endsWith('/study') ? studyFixture : fixture);
        // Synthetic omissions/empty results exercise API boundaries absent from
        // the complete captures. The stub does not emulate backend filtering.
        if (url.searchParams.get('query') === 'missing') data.facets.time_steps.buckets = [];
        if (url.searchParams.get('query') === 'omitted') delete data.facets.time_steps;
        if (url.searchParams.get('query') === 'missing_channels') data.facets.number_of_channels.buckets = [];
        if (url.searchParams.get('query') === 'omitted_channels') delete data.facets.number_of_channels;
        if (url.searchParams.get('query') === 'missing_year') data.facets.release_date.buckets = [];
        if (url.searchParams.get('query') === 'omitted_year') delete data.facets.release_date;
        if (url.searchParams.get('query') === 'empty') {
            data.hits.hits = [];
            data.hits.total.value = 0;
            data.facets = {};
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(data));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await mkdir(output, { recursive: true });
    root = await mkdtemp(path.join(output, 'application-'));
    await cp(path.join(repository, 'src'), path.join(root, 'src'), {
        recursive: true, filter: source => !['pages', 'content'].includes(path.relative(path.join(repository, 'src'), source).split(path.sep)[0]),
    });
    await mkdir(path.join(root, 'src/pages'), { recursive: true });
    await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    await writeFile(path.join(root, 'package.json'), '{"type":"module"}\n');
    await writeFile(path.join(root, 'astro.config.mjs'), `
import { defineConfig, envField } from 'astro/config';
export default defineConfig({
    cacheDir: ${JSON.stringify(path.join(root, '.astro-cache'))},
    vite: { cacheDir: ${JSON.stringify(path.join(root, '.vite'))} },
    env: { schema: { PUBLIC_SEARCH_API: envField.string({ access: 'public', context: 'client', default: 'http://127.0.0.1:${server.address().port}' }) } }
});
`);
    for (const [name, params] of Object.entries(cases)) {
        await writeFile(path.join(root, `src/pages/${name}.astro`), `---
import Search from '../components/search/Search.astro';
const url = new URL(${JSON.stringify('http://local/bioimage-archive/' + (['study', 'missing_year', 'omitted_year', 'foreign_study'].includes(name) ? 'studies' : 'images') + '?' + params + '&query=' + name)});
---
<Search url={url} query=${JSON.stringify(name)} searchType=${JSON.stringify(['study', 'missing_year', 'omitted_year', 'foreign_study'].includes(name) ? 'study' : 'image')} />
`);
    }
    await promisify(execFile)(process.execPath, [path.join(repository, 'node_modules/astro/astro.js'), 'build', '--root', root],
        {
            cwd: repository,
            // A developer's API override must not redirect fixture tests to a
            // live service. The child build owns this server-reachable endpoint.
            env: { ...process.env, PUBLIC_SEARCH_API: `http://127.0.0.1:${server.address().port}` },
            timeout: 120000,
            maxBuffer: 2 * 1024 * 1024,
        });
    for (const name of Object.keys(cases)) pages[name] = await readFile(path.join(root, `dist/${name}/index.html`), 'utf8');
});

function inputs(html, name) {
    return [...html.matchAll(/<input\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)].map(match => match[0]).filter(tag => tag.includes(`name="${name}"`));
}
function checked(html, name, value) {
    const input = inputs(html, name).find(tag => tag.includes(`value="${value}"`));
    assert.ok(input, `Missing ${name}=${value}`);
    assert.match(input, /\schecked(?:\s|>|=)/);
    return input;
}
function request(name) { return requests.find(url => url.searchParams.get('query') === name); }
function chipURL(html, label) {
    const tag = [...html.matchAll(/<a\b[^>]*>/g)].map(match => match[0]).find(tag => tag.includes(`aria-label="${label}"`));
    assert.ok(tag, `Missing chip: ${label}`);
    return new URL(tag.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))), 'http://local');
}

for (const name of ['canonical', 'legacy', 'alias']) {
    test(`${name} numeric deep link renders a checked successful control`, () => {
        checked(pages[name], 'size_t', '1');
        assert.equal(request(name).searchParams.get('size_t.eq'), '1');
        assert.match(pages[name], /aria-label="Remove Time Steps: 1"/);
        assert.ok(inputs(pages[name], 'size_t').every(tag => !tag.includes('value=" ')));
    });
}

test('text-chip removal retains repeated numeric values and navigation preferences', () => {
    checked(pages.repeated, 'size_t', '1');
    checked(pages.repeated, 'size_t', '2-10');
    const url = chipURL(pages.repeated, 'Remove Image Format: czi');
    assert.deepEqual(url.searchParams.getAll('size_t'), ['1', '2-10']);
    assert.equal(url.searchParams.has('facet.image_format'), false);
    assert.equal(url.searchParams.get('pagination.page_size'), '25');
    assert.equal(url.searchParams.get('sort_by'), 'accession_id');
    assert.equal(url.searchParams.get('sort_order'), 'asc');
    const numericRemoved = chipURL(pages.repeated, 'Remove Time Steps: 1');
    assert.deepEqual(numericRemoved.searchParams.getAll('size_t'), ['2-10']);
    assert.equal(numericRemoved.searchParams.get('facet.image_format'), 'czi');
});

for (const name of ['missing', 'omitted', 'empty']) {
    test(`${name} response retains the active numeric control and removal chip`, () => {
        const value = name === 'empty' ? '0' : '2-10';
        checked(pages[name], 'size_t', value);
        assert.match(pages[name], new RegExp(`aria-label="Remove Time Steps: ${value}"`));
        assert.equal(chipURL(pages[name], `Remove Time Steps: ${value}`).searchParams.has('size_t'), false);
        const section = pages[name].split('id="facet-section-size_t"')[1].split('<form')[0];
        const row = section.split('class="facet-label-inner"')[1].split('</label>')[0];
        assert.doesNotMatch(row, /class="facet-count"/);
        if (name === 'empty') assert.match(pages[name], /data-total-results="0"/);
    });
}

test('range/comparison tokens reach the existing API serializer without precision loss', () => {
    checked(pages.range, 'size_t', '2-10');
    checked(pages.range, 'total_physical_size_x', '≤0.000000001000000');
    const params = request('range').searchParams;
    assert.equal(params.get('size_t.gte'), '2');
    assert.equal(params.get('size_t.lte'), '10');
    assert.equal(params.get('total_physical_size_x.lte'), '0.000000001000000');
});

test('scientific-notation selections retain readable labels and exact submitted values', () => {
    for (const [field, value, title] of [
        ['total_physical_size_x', '1e-9', 'Total Physical Size X (m)'],
        ['total_physical_size_y', '2.50e-12', 'Total Physical Size Y (m)'],
        ['voxel_physical_size_x', '1e-9', 'Voxel Physical Size X (m/px)'],
    ]) {
        const input = checked(pages.scientific, field, value);
        const id = input.match(/\sid="([^"]+)"/)[1];
        const label = pages.scientific.match(new RegExp(`<label\\b[^>]*for="${id}"[^>]*>([\\s\\S]*?)<\\/label>`))[1];
        assert.equal(label.replace(/<[^>]*>/g, '').trim(), value);
        const chip = pages.scientific.match(new RegExp(`<a\\b[^>]*aria-label="Remove ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ${value}"[^>]*>([\\s\\S]*?)<\\/a>`))[1];
        assert.equal(chip.match(/<span\b[^>]*class="facet-value"[^>]*>([\s\S]*?)<\/span>/)[1], value);
        assert.equal(request('scientific').searchParams.get(`${field}.eq`), value);
    }
});

test('study facets retain numeric year checkedness and the study endpoint', () => {
    checked(pages.study, 'facet.year', '2025');
    assert.equal(request('study').pathname, '/website/browse/study');
    assert.equal(request('study').searchParams.get('facet.year.eq'), '2025');
});

test('an API failure does not fabricate a successful selected-only aggregation', () => {
    assert.equal(inputs(pages.unavailable, 'size_t').length, 0);
    assert.doesNotMatch(pages.unavailable, /aria-label="Remove Time Steps: 1"/);
});

test('all numeric facets render the original API order with label/control wiring', () => {
    const fields = {
        image_pixel_x: 'size_x', image_pixel_y: 'size_y', image_pixel_z: 'size_z', time_steps: 'size_t',
        total_size_in_bytes: 'total_size_in_bytes',
        total_physical_size_x: 'total_physical_size_x', total_physical_size_y: 'total_physical_size_y', total_physical_size_z: 'total_physical_size_z',
        voxel_physical_size_x: 'voxel_physical_size_x', voxel_physical_size_y: 'voxel_physical_size_y', voxel_physical_size_z: 'voxel_physical_size_z',
    };
    for (const [facetKey, queryKey] of Object.entries(fields)) {
        const controls = inputs(pages.canonical, queryKey);
        const values = controls.map(tag => tag.match(/value="([^"]*)"/)[1]
            .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replaceAll('&gt;', '>').replaceAll('&lt;', '<'));
        assert.deepEqual(values, imageFixture.facets[facetKey].buckets.map(bucket => String(bucket.key)));
        for (const tag of controls) {
            const id = tag.match(/\sid="([^"]+)"/)[1];
            assert.ok(pages.canonical.includes(`for="${id}"`));
        }
    }
});

test('an empty numeric value creates no selected option or active chip', () => {
    assert.ok(inputs(pages.blank, 'size_t').every(tag => !/\schecked(?:\s|>|=)/.test(tag)));
    assert.doesNotMatch(pages.blank, /aria-label="Remove Time Steps:/);
    assert.equal(request('blank').searchParams.has('size_t.eq'), false);
});

for (const [name, queryKey, value, title] of [
    ['missing_channels', 'size_c', '1', 'Channels'],
    ['omitted_channels', 'size_c', '1', 'Channels'],
    ['missing_year', 'facet.year', '2025', 'Release Year'],
    ['omitted_year', 'facet.year', '2025', 'Release Year'],
]) {
    test(`${name} retains the selected numeric control and chip`, () => {
        checked(pages[name], queryKey, value);
        assert.equal(chipURL(pages[name], `Remove ${title}: ${value}`).searchParams.has(queryKey), false);
    });
}

test('omitted-group retention does not add image controls to study browse or vice versa', () => {
    assert.equal(inputs(pages.foreign_study, 'size_t').length, 0);
    assert.equal(inputs(pages.foreign_image, 'facet.year').length, 0);
});


test('scientific comparisons and range bounds preserve API operators and source precision', () => {
    for (const [field, value] of [
        ['total_physical_size_x', '>1e-9'], ['total_physical_size_y', '≤2e-9'],
        ['voxel_physical_size_x', '1e-9-2e-9'],
    ]) checked(pages.scientific_bounds, field, value);
    const params = request('scientific_bounds').searchParams;
    assert.equal(params.get('total_physical_size_x.gt'), '1e-9');
    assert.equal(params.get('total_physical_size_y.lte'), '2e-9');
    assert.equal(params.get('voxel_physical_size_x.gte'), '1e-9');
    assert.equal(params.get('voxel_physical_size_x.lte'), '2e-9');
    for (const field of ['total_physical_size_x', 'total_physical_size_y', 'voxel_physical_size_x']) {
        assert.equal(params.has(`${field}.eq`), false);
    }
    const input = checked(pages.scientific_bounds, 'voxel_physical_size_x', '1e-9-2e-9');
    const id = input.match(/\sid="([^"]+)"/)[1];
    const label = pages.scientific_bounds.match(new RegExp(`<label\\b[^>]*for="${id}"[^>]*>([\\s\\S]*?)<\\/label>`))[1];
    assert.match(label, /1 nm - 2 nm/);
    assert.doesNotMatch(label, /undefined|NaN/);
});

test('malformed numeric ranges remain whole instead of discarding extra bounds', () => {
    checked(pages.malformed_range, 'size_t', '1-2-3');
    const params = request('malformed_range').searchParams;
    assert.equal(params.get('size_t.eq'), '1-2-3');
    assert.equal(params.has('size_t.gte'), false);
    assert.equal(params.has('size_t.lte'), false);
    assert.match(pages.malformed_range, />1-2-3</);
});

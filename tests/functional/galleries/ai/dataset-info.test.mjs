import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const output = new URL('../../../../artifacts/ai-dataset-biological-entities/', import.meta.url);
const response = JSON.parse(await readFile(new URL('../../../fixtures/api/study-s-biad3335-response.json', import.meta.url)));
const study = response.hits.hits.find(hit => hit._source.accession_id === 'S-BIAD3335')._source;
const taxon = study.dataset[0].biological_entity[0].organism_classification[0];
const base = { title: 'Partial dataset', acquisition_process: [{ imaging_method_name: ['Confocal', 'Confocal', 'TEM'] }] };
const description = 'Embryo <sample> & "intact"\nSecond line';
const missingEntities = { omitted: undefined, null: null, object: {}, text: 'invalid', empty: [] };
const missingMethods = { omitted: undefined, null: null, empty: [], partial: [null, {}, { imaging_method_name: null }] };
const cases = {
    ...Object.fromEntries(study.dataset.map((dataset, index) => ['captured-' + index, dataset])),
    ...Object.fromEntries(Object.entries(missingEntities).map(([name, biological_entity]) => ['missing-' + name, { ...base, biological_entity }])),
    description: { ...base, biological_entity: [{ biological_entity_description: description }, { organism_classification: [], biological_entity_description: 'Another sample' }] },
    mixed: { ...base, biological_entity: [null, { biological_entity_description: {} }, { organism_classification: [null, {}, [], 'invalid', taxon], biological_entity_description: description }],
        acquisition_process: [null, { imaging_method_name: [null, 'Confocal', 'Confocal', 0, 'TEM'] }, { imaging_method_name: null }] },
    ...Object.fromEntries(Object.entries(missingMethods).map(([name, acquisition_process]) => ['no-method-' + name, { title: base.title, acquisition_process, biological_entity: [{ organism_classification: [taxon] }] }])),
};
let root, results;
after(async () => { if (root) await rm(root, { recursive: true, force: true }); });

before(async () => {
    await mkdir(output, { recursive: true });
    root = await mkdtemp(new URL('application-', output));
    await mkdir(root + '/src/pages', { recursive: true });
    await symlink(repository + '/node_modules', root + '/node_modules', 'dir');
    await writeFile(root + '/package.json', '{"type":"module"}\n');
    await writeFile(root + '/cases.json', JSON.stringify(cases));
    await writeFile(root + '/response.json', JSON.stringify(response));
    await writeFile(root + '/astro.config.mjs', `import {defineConfig,envField} from 'astro/config';
export default defineConfig({cacheDir:'./.astro-cache',vite:{cacheDir:'./.vite'},env:{schema:{PUBLIC_SEARCH_API:envField.string({access:'public',context:'client',default:'https://fixture.invalid'})}}});\n`);
    await writeFile(root + '/src/pages/index.astro', String.raw`---
import assert from 'node:assert/strict';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import DatasetInfo from ${JSON.stringify(repository + '/src/components/ai-benchmarking/DatasetInfo.astro')};
import cases from '../../cases.json';
import response from '../../response.json';
const container = await AstroContainer.create();
const results = {}, requests = [], originalFetch = globalThis.fetch;
globalThis.fetch = async input => {
    const url = String(input);
    requests.push(url);
    assert.equal(url, 'https://fixture.invalid/website/study?facet.accession_id=S-BIAD3335');
    return new Response(JSON.stringify(response), {headers:{'Content-Type':'application/json'}});
};
try {
    for (const [name, dataset] of Object.entries(cases)) {
        const before = JSON.stringify(dataset);
        try { results[name] = {html: await container.renderToString(DatasetInfo, {props:{dataset, datasetAIInfo:{annotation_method_override:'Annotation retained'}, studyAccessionID:'S-BIAD3335'}})}; }
        catch (error) { results[name] = {error: String(error)}; }
        assert.equal(JSON.stringify(dataset), before, name + ': input must not be mutated');
    }
    assert(requests.every(url => url === 'https://fixture.invalid/website/study?facet.accession_id=S-BIAD3335'));
} finally { globalThis.fetch = originalFetch; }
---
<script is:inline type="application/json" id="results" set:html={JSON.stringify(results).replaceAll('<', '\u003c')} />
`);
    const { stdout, stderr } = await promisify(execFile)(process.execPath,
        [repository + '/node_modules/astro/astro.js', 'build', '--root', root], {
            cwd: repository, timeout: 120000, maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, PUBLIC_SEARCH_API: 'https://fixture.invalid', ASTRO_TELEMETRY_DISABLED: '1' },
        });
    await writeFile(new URL('rendering-build.log', output), stdout + stderr);
    const html = await readFile(root + '/dist/index.html', 'utf8');
    results = JSON.parse(html.match(/<script\b[^>]*id="results"[^>]*>([\s\S]*?)<\/script>/)[1]);
    await writeFile(new URL('rendering-results.json', output), JSON.stringify(results, null, 2) + '\n');
});

function rendered(name) {
    assert.equal(results[name].error, undefined, name);
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

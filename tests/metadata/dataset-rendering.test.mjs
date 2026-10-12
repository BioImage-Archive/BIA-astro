import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { before, after, test } from "node:test";

const repository = fileURLToPath(new URL("../../", import.meta.url));
let application;
let sections;
let captures;
let fieldMap;
const records = html => [...html.matchAll(/<details\b[^>]*>[\s\S]*?<\/details>/g)].map(match => match[0]);

before(async () => {
    const fixtures = new URL("../fixtures/api/", import.meta.url);
    const provenance = JSON.parse(await readFile(new URL("provenance.json", fixtures), "utf8"));
    captures = await Promise.all(provenance.responses.map(async entry => {
        const bytes = await readFile(new URL(entry.file, fixtures));
        return { ...entry, actualHash: createHash("sha256").update(bytes).digest("hex"), response: JSON.parse(bytes) };
    }));
    fieldMap = JSON.parse(await readFile(path.join(repository, "src/data/metadata-field-name-mapping.json"), "utf8"));
    const output = path.join(repository, "artifacts/dataset-metadata-tests");
    await mkdir(output, { recursive: true });
    application = await mkdtemp(path.join(output, "application-"));
    await mkdir(path.join(application, "src/pages"), { recursive: true });
    await symlink(path.join(repository, "node_modules"), path.join(application, "node_modules"), "dir");
    await writeFile(path.join(application, "package.json"), '{"type":"module"}\n');
    const entrypoint = path.join(repository, "tests/metadata/fixtures/dataset-metadata.astro");
    const invalidEntrypoint = path.join(repository, "tests/metadata/fixtures/invalid-dataset.astro");
    await writeFile(path.join(application, "astro.config.mjs"), `
import { defineConfig, envField } from 'astro/config';
export default defineConfig({
    cacheDir: './.astro', vite: { cacheDir: './.vite' },
    integrations: [{ name: 'metadata-rendering-fixture', hooks: {
        'astro:config:setup': ({ injectRoute }) => injectRoute({ pattern: '/',
            entrypoint: process.env.BIJUX_METADATA_INVALID === 'true' ? ${JSON.stringify(invalidEntrypoint)} : ${JSON.stringify(entrypoint)}, prerender: true })
    } }],
    env: { schema: { PUBLIC_SEARCH_API: envField.string({ access: 'public', context: 'client', default: 'https://alpha.bioimagearchive.org/search/v1' }) } }
});
`);
    const { stdout, stderr } = await promisify(execFile)(process.execPath,
        [path.join(repository, "node_modules/astro/astro.js"), "build", "--root", application],
        { cwd: repository, timeout: 120000, maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, BIJUX_METADATA_INVALID: "false" } });
    await writeFile(path.join(application, "build.log"), stdout + stderr);
    const html = await readFile(path.join(application, "dist/index.html"), "utf8");
    sections = Object.fromEntries([...html.matchAll(/<article id="([^"]+)">([\s\S]*?)<\/article>/g)]
        .map(match => [match[1], match[2]]));
});

after(async () => { if (application) await rm(application, { recursive: true, force: true }); });

test("shared API captures retain complete response envelopes and recorded hashes", () => {
    for (const file of ["study-s-biad3335-response.json", "study-s-biad3397-response.json",
        "image-001b8ef2-7a5e-4b94-b91c-d93f5095ee39-response.json"]) {
        assert(captures.some(capture => capture.file === file), file);
    }
    for (const capture of captures) {
        assert.equal(capture.actualHash, capture.sha256, capture.file);
        assert.equal(new URL(capture.url).protocol, "https:");
        assert(capture.capturedAt);
        assert(Array.isArray(capture.response.hits.hits));
        assert("facets" in capture.response && "pagination" in capture.response);
    }
});

test("complete shared study responses preserve each dataset, record and mapped field", () => {
    const groups = [
        ["biological_entity", "biosample"], ["specimen_imaging_preparation_protocol", "specimen_imaging_preparation_protocol"],
        ["acquisition_process", "image_acquisition"], ["other_creation_process", "specimen_growth_protocol"],
        ["analysis_method", "analysis_method"], ["correlation_method", "correlation_method"], ["annotation_process", "annotation_method"],
    ];
    for (const accession of ["S-BIAD3335", "S-BIAD3397"]) {
        const study = captures.flatMap(capture => capture.response.hits.hits)
            .find(hit => hit._source.accession_id === accession && Array.isArray(hit._source.dataset))._source;
        const blocks = [...sections[`api-${accession}`].matchAll(/data-fixture-dataset-uuid="([^"]+)">([\s\S]*?)(?=<div data-fixture-dataset-uuid=|$)/g)];
        assert.deepEqual(blocks.map(block => block[1]), study.dataset.map(dataset => dataset.uuid));
        for (const [index, dataset] of study.dataset.entries()) {
            const html = blocks[index][2];
            assert(html.includes(dataset.title));
            const overview = html.match(/class="dataset-metadata__overview">([\s\S]*?)<\/div>/)[1];
            const formatEntries = Object.entries(dataset.file_type_counts ?? {})
                .filter(([extension, count]) => extension !== "" && extension !== "file" && extension !== "directory" && count != null && Number.isFinite(Number(count)));
            const expectedCount = formatEntries.length
                ? formatEntries.reduce((total, [, count]) => total + Number(count), 0)
                : dataset.image_count ?? "Not reported";
            const formats = formatEntries.map(([extension, count]) => `${extension.replace(/^\./, "")} (${Number(count)})`);
            assert.match(overview, /<b>Description:<\/b>/);
            assert(overview.includes(`<b>Number of images/files:</b> ${expectedCount}`));
            if (formats.length) assert(overview.includes(`<b>Top 5 file formats:</b> ${formats.join(", ")}`));
            const expectedGroups = groups.filter(([property]) => (dataset[property] ?? []).length > 0);
            assert.deepEqual([...html.matchAll(/data-metadata-group="([^"]+)"/g)].map(match => match[1]), expectedGroups.map(([property]) => property));
            for (const [property, mapKey] of expectedGroups) {
                const group = html.match(new RegExp(`data-metadata-group="${property}">([\\s\\S]*?)<\\/section>`))[1];
                const rendered = records(group);
                assert.equal(rendered.length, dataset[property].length);
                for (const [recordIndex, record] of dataset[property].entries()) {
                    assert(rendered[recordIndex].includes(`<b>${record.title}</b>`));
                    const keys = Object.keys(fieldMap[mapKey]).filter(key => record[key] != null && (!Array.isArray(record[key]) || record[key].length > 0));
                    assert.deepEqual([...rendered[recordIndex].matchAll(/data-metadata-field="([^"]+)"/g)].map(match => match[1]), keys);
                    for (const key of keys) assert(rendered[recordIndex].includes(`<dt><b>${fieldMap[mapKey][key]}:</b></dt>`));
                }
            }
        }
    }
});

test("the shared image response renders its real acquisition records through the default presentation", () => {
    const image = captures.flatMap(capture => capture.response.hits.hits)
        .find(hit => hit._source.uuid === "001b8ef2-7a5e-4b94-b91c-d93f5095ee39")._source;
    assert.equal(records(sections["api-image"]).length, image.creation_process.acquisition_process.length);
    assert.match(sections["api-image"], /Cryo-electron tomography/);
    assert.match(sections["api-image"], /Titan Krios/);
    assert.doesNotMatch(sections["api-image"], /dataset-metadata__|<dl/);
});

test("all seven groups retain their order, fields and record associations", () => {
    const groups = [...sections.complete.matchAll(/data-metadata-group="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(groups, ["biological_entity", "specimen_imaging_preparation_protocol", "acquisition_process",
        "other_creation_process", "analysis_method", "correlation_method", "annotation_process"]);
    for (const [group, expected] of [
        ["biological_entity", "First biological entity"], ["specimen_imaging_preparation_protocol", "Preparation one"],
        ["acquisition_process", "Acquisition description"], ["other_creation_process", "Creation description"],
        ["analysis_method", "Analysis description"], ["correlation_method", "Correlation description"],
        ["annotation_process", "Annotation description"],
    ]) {
        const match = sections.complete.match(new RegExp(`data-metadata-group="${group}">([\\s\\S]*?)<\\/section>`));
        assert(match, group);
        assert.match(match[1], new RegExp(expected));
    }
    assert.equal(records(sections.complete).length, 8);
    assert.match(sections.complete, /<dt><b>Extrinsic variable:<\/b><\/dt>\s*<dd>false<\/dd>/);
    assert.match(sections.complete, /<dt><b>Intrinsic variable:<\/b><\/dt>\s*<dd>0<\/dd>/);
});

test("repeated titles retain distinct dataset and protocol occurrences", () => {
    assert.match(sections.complete, /First dataset description/);
    assert.doesNotMatch(sections.complete, /Second dataset description|Different dataset annotation/);
    assert.match(sections.repeated, /Second dataset description/);
    assert.match(sections.repeated, /Different dataset annotation/);
    assert.doesNotMatch(sections.repeated, /First biological entity/);
    assert.equal((sections.complete.match(/Repeated protocol/g) ?? []).length, 2);
    assert.equal((sections.many.match(/class="dataset-metadata"/g) ?? []).length, 50);
    for (let index = 0; index < 50; index++) assert.match(sections.many, new RegExp(`Dataset occurrence ${index}<`));
});

test("dataset and group headings use a semantic hierarchy and label/value markup", () => {
    assert.match(sections.complete, /<h3 class="dataset-metadata__title">Repeated dataset title<\/h3>/);
    assert.equal((sections.complete.match(/<h4\b/g) ?? []).length, 7);
    assert.equal((sections.complete.match(/<dl class="dataset-metadata__fields">/g) ?? []).length, 8);
    assert.doesNotMatch(sections.complete, /<ul>\s*<div/);
    assert.doesNotMatch(sections.complete, /\(as above\)|name="/);
});

test("missing and legacy disclosure states produce real boolean attributes", () => {
    assert.deepEqual(records(sections.states).map(record => /<details\b[^>]*\bopen(?:[\s=>])/.test(record)),
        [true, true, false, true, false, true, false, false, false, false]);
    assert.doesNotMatch(sections.states, /open="(?:false|False)"/);
    assert(!/<details\b[^>]*\bopen(?:[\s=>])/.test(records(sections.repeated)[0]));
});

test("plain metadata is escaped and retains literal pipes, newlines and long text", () => {
    assert.match(sections.literal, /&lt;script&gt;alert\(&quot;test&quot;\)&lt;\/script&gt; \| literal/);
    assert.doesNotMatch(sections.literal, /<script|<em>|<img src=x| onclick="/);
    assert.match(sections.literal, /Growth &lt;tag&gt; &amp; unchanged/);
    assert.match(sections.literal, /x{300}/);
    assert.match(sections.complete, /μm &lt; 5 \| intact\nSecond line/);
    assert.match(sections.complete, /Growth &lt; 2 days \| intact\nAnother line/);
});

test("taxonomic labels and exact NCBI target retain their association", () => {
    assert.match(sections.complete, /<i>Mus musculus<\/i> \(Mouse\)/);
    assert.match(sections.complete, /href="https:\/\/www.ncbi.nlm.nih.gov\/Taxonomy\/Browser\/wwwtax.cgi\?id=NCBI:txid10090"/);
    assert.match(sections.literal, /id=9606&quot; onclick=&quot;alert\(1\)"/);
});

test("partial taxonomic labels retain the supplied identifier or name without inventing text", () => {
    assert.doesNotMatch(sections["taxon-labels"], /\bnull\b|\bundefined\b/);
    assert.match(sections["taxon-labels"], /id=9606">9606 /);
    assert.match(sections["taxon-labels"], /<i>Mus musculus<\/i>/);
    assert.match(sections["taxon-labels"], /<li class="vf-content"> Mouse<\/li>/);
    assert.equal((sections["taxon-labels"].match(/<li\b/g) ?? []).length, 3);
});

test("dataset overviews retain main file totals, image-count fallbacks, voxel values and formats", () => {
    assert.match(sections.complete, /<b>Description:<\/b> First dataset description/);
    assert.match(sections.empiar, /<b>Description:<\/b> EMPIAR dataset description/);
    assert.match(sections.complete, /<b>Number of images\/files:<\/b> 4/);
    assert.match(sections.complete, /<b>Top 5 file formats:<\/b> tif \(4\)<\/p>/);
    assert.match(sections.repeated, /<b>Number of images\/files:<\/b> 2/);
    assert.match(sections.empty, /<b>Number of images\/files:<\/b> 0/);
    assert.match(sections.empiar, /<b>Number of images\/files:<\/b> 8/);
    assert.doesNotMatch(sections.complete, /Top 5 file formats:<\/b>[^<]*(?:directory|file)/);
    assert.match(sections.empiar, /<b>Physical Voxel Size:<\/b> Recorded source value/);
    assert.match(sections.complete, /<b>Physical Voxel Size:<\/b> 1 x 2 x 3 nm/);
    assert.match(sections.states, /<b>Number of images\/files:<\/b> Not reported/);
});

test("statistics remain visible without a description and preserve supplied format order", () => {
    assert.doesNotMatch(sections.statistics, /<b>Description:<\/b>/);
    assert.match(sections.statistics, /<b>Number of images\/files:<\/b> 6/);
    assert.match(sections.statistics, /<b>Top 5 file formats:<\/b> czi \(3\), zip \(2\), xlsx \(1\)<\/p>/);
});

test("missing statistics retain the accepted main fallback without inventing a zero", () => {
    for (const id of ["no-statistics", "directory-only", "invalid-formats"]) {
        assert.match(sections[id], /<b>Description:<\/b> Description without statistics/);
        assert.match(sections[id], /<b>Number of images\/files:<\/b> Not reported/);
        assert.doesNotMatch(sections[id], /Top 5 file formats/);
    }
});

test("empty groups stay absent and missing titles receive readable fallbacks", () => {
    assert.match(sections.empty, /Untitled dataset/);
    assert.equal(records(sections.empty).length, 0);
    assert.doesNotMatch(sections.empty, /data-metadata-group/);
    assert.match(sections.literal, /Untitled record/);
});

test("the shared image presentation keeps its text, initial state and original spacing", () => {
    assert.doesNotMatch(sections.image, /dataset-metadata__|<dl/);
    assert.match(sections.image, /style="margin-bottom: 0.5rem;"/);
    assert.match(sections.image, /Line one, Line two ,  pipe/);
    assert.match(sections.image, /Method A,Method B/);
    assert.match(sections.image, /<details[^>]* open/);
});

test("malformed groups fail the actual Astro build with the dataset and property identified", async () => {
    await assert.rejects(promisify(execFile)(process.execPath,
        [path.join(repository, "node_modules/astro/astro.js"), "build", "--root", application],
        { cwd: repository, timeout: 120000, maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, BIJUX_METADATA_INVALID: "true" } }), error => {
        assert.match(error.stdout + error.stderr, /Dataset Invalid group dataset: biological_entity must be an array/);
        return true;
    });
});


test("additional metadata retains precedence for counts, formats and voxel axes", () => {
    const html = sections["additional-metadata"];
    assert.match(html, /<b>Number of images\/files:<\/b> 7/);
    assert.match(html, /<b>File types and counts:<\/b> tif \(5\), csv \(2\)/);
    assert.match(html, /<b>Voxel size \(X × Y\):<\/b> 1.25 × 2.5/);
    assert.doesNotMatch(html, /obsolete|999|Top 5 file formats|Physical Voxel Size/);
});

test("file-list fallbacks and invalid additional metadata retain main behavior", () => {
    assert.match(sections["file-list"], /<b>Number of images\/files:<\/b> 12/);
    assert.match(sections["file-list"], /<b>File formats:<\/b> csv/);
    assert.match(sections["metadata-fallback"], /<b>Number of images\/files:<\/b> 3/);
    assert.match(sections["metadata-fallback"], /<b>Top 5 file formats:<\/b> png \(3\)/);
});

test("merged FBBI searches remain available in dataset and default image presentations", () => {
    const study = sections["api-S-BIAD3335"];
    assert.equal((study.match(/>FBbi:00000639 \(search OLS\)<\/a>/g) ?? []).length, 2);
    assert.match(study, /data-metadata-field="fbbi_id"/);
    assert.match(study, /q=FBbi%3A00000639&amp;ontology=fbbi&amp;isDefiningOntology=true/);
    assert.match(sections["api-image"], />FBbi:00000256 \(search OLS\)<\/a>/);
    assert.doesNotMatch(sections["api-S-BIAD3397"], /data-metadata-field="fbbi_id"|\/ols4\/search/);
});

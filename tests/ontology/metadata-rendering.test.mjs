import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { before, test } from "node:test";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(repository, "artifacts/ontology-rendering");
let sections;

before(async () => {
    const fixture = JSON.parse(await readFile(new URL("./fixtures/acquisition-metadata.json", import.meta.url), "utf8"));
    const root = path.join(output, "application");
    await mkdir(path.join(root, "src/pages"), { recursive: true });
    for (const relative of [
        "src/components/DatasetDetail.astro", "src/components/DatasetInfo.astro",
        "src/components/SharedJSFunctions.js", "src/components/formatting/fbbi-terms.mjs",
        "src/components/formatting/physical-dimensions.js",
        "src/assets/bioimage-archive/external-link-svgrepo-com.png",
        "src/assets/bioimage-archive/image_fallback.png", "src/data/metadata-field-name-mapping.json",
    ]) {
        await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
        await cp(path.join(repository, relative), path.join(root, relative));
    }
    await writeFile(path.join(root, "package.json"), '{"type":"module"}\n');
    try {
        await symlink(path.join(repository, "node_modules"), path.join(root, "node_modules"), "dir");
    } catch (error) {
        if (error.code !== "EEXIST") throw error;
    }
    await writeFile(path.join(root, "astro.config.mjs"), `
import { defineConfig, envField } from 'astro/config';
export default defineConfig({
    env: { schema: { PUBLIC_SEARCH_API: envField.string({ access: 'public', context: 'client', default: 'https://alpha.bioimagearchive.org/search/v1' }) } }
});
`);
    await writeFile(path.join(root, "src/data/fixture.json"), JSON.stringify(fixture));
    await writeFile(path.join(root, "src/pages/index.astro"), `---
import DatasetInfo from '../components/DatasetInfo.astro';
import DatasetDetail from '../components/DatasetDetail.astro';
import fieldMap from '../data/metadata-field-name-mapping.json';
import fixture from '../data/fixture.json';
const dataset = { title: fixture.study.accession, description: '', image_count: 0,
    acquisition_process: [fixture.study.acquisition], biological_entity: [fixture.study.biosample] };
const acquisition = fixture.image.acquisition;
const mismatched = { title: 'Independent arrays', imaging_method_name: ['Method A', 'Method B'], fbbi_id: ['FBbi:00000256'] };
const unsupported = { title: 'Unsupported identifiers', fbbi_id: ['<img src=x onerror="alert(1)">', 'NCBITaxon:9606', 'FBbi:00000256'] };
---
<section id="study"><DatasetInfo dataset={dataset} /></section>
<section id="image"><DatasetDetail data={acquisition} fieldMap={fieldMap.image_acquisition} /></section>
<section id="missing"><DatasetDetail data={fixture.missingIdentifiers.acquisition} fieldMap={fieldMap.image_acquisition} /></section>
<section id="absent"><DatasetDetail data={{ title: 'No identifiers', imaging_method_name: ['Unspecified'] }} fieldMap={fieldMap.image_acquisition} /></section>
<section id="mismatched"><DatasetDetail data={mismatched} fieldMap={fieldMap.image_acquisition} /></section>
<section id="unsupported"><DatasetDetail data={unsupported} fieldMap={fieldMap.image_acquisition} /></section>
<section id="scalar"><DatasetDetail data={{ title: 'Scalar identifier', fbbi_id: 'FBbi:00000256' }} fieldMap={fieldMap.image_acquisition} /></section>
`);
    const { stdout, stderr } = await promisify(execFile)(process.execPath,
        [path.join(repository, "node_modules/astro/astro.js"), "build", "--root", root],
        { cwd: repository, timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
    await writeFile(path.join(output, "build.log"), stdout + stderr);
    const html = await readFile(path.join(root, "dist/index.html"), "utf8");
    sections = Object.fromEntries([...html.matchAll(/<section id="([^"]+)">([\s\S]*?)<\/section>/g)]
        .map((match) => [match[1], match[2]]));
});

test("the reference study offers an FBBI search without claiming that its term exists", () => {
    assert.match(sections.study, /Imaging method:<\/b>&nbsp; Optical Projection Tomography \(OPT\)/);
    assert.match(sections.study, /Imaging method ontology:<\/b>/);
    assert.match(sections.study, /href="https:\/\/www\.ebi\.ac\.uk\/ols4\/search\?q=FBbi%3A00000639&amp;ontology=fbbi">FBbi:00000639 \(search OLS\)<\/a>/);
    assert.doesNotMatch(sections.study, /\/entities\/|\/classes\/|href="https:\/\/purl\.obolibrary\.org/);
});

test("image acquisition metadata accepts the observed obo namespace alias", () => {
    assert.match(sections.image, /Imaging method:<\/b>&nbsp; Cryo-electron tomography/);
    assert.match(sections.image, /href="https:\/\/www\.ebi\.ac\.uk\/ols4\/search\?q=FBbi%3A00000256&amp;ontology=fbbi">FBbi:00000256 \(search OLS\)<\/a>/);
    assert.doesNotMatch(sections.image, /target=|onclick=|obo:FBbi_/);
});

test("empty and absent identifier arrays preserve the method without an ontology row", () => {
    for (const section of [sections.missing, sections.absent]) {
        assert.match(section, /Imaging method:<\/b>/);
        assert.doesNotMatch(section, /Imaging method ontology|\/ols4\/search/);
    }
});

test("unequal array lengths retain all names without inventing associations", () => {
    assert.match(sections.mismatched, /Imaging method:<\/b>&nbsp; Method A,Method B/);
    assert.equal((sections.mismatched.match(/<a /g) ?? []).length, 1);
    assert.match(sections.mismatched, /Imaging method ontology:<\/b>/);
});

test("unsupported values remain readable and cannot inject markup", () => {
    assert.match(sections.unsupported, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;, NCBITaxon:9606/);
    assert.doesNotMatch(sections.unsupported, /<img|<script/);
    assert.equal((sections.unsupported.match(/<a /g) ?? []).length, 1);
});

test("an identifier without a method name is still discoverable", () => {
    assert.match(sections.scalar, /Imaging method ontology:<\/b>/);
    assert.match(sections.scalar, />FBbi:00000256 \(search OLS\)<\/a>/);
    assert.doesNotMatch(sections.scalar, /Imaging method:<\/b>/);
});

test("existing organism links and names retain their rendering", () => {
    assert.match(sections.study, /<i>Mus musculus<\/i> \(Mouse\)/);
    assert.match(sections.study, /href="https:\/\/www\.ncbi\.nlm\.nih\.gov\/Taxonomy\/Browser\/wwwtax\.cgi\?id=NCBI:txid10090"/);
});

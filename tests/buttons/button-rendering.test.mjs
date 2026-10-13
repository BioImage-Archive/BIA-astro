import assert from "node:assert/strict";
import { parse } from "@astrojs/compiler";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { once } from "node:events";
import { after, before, test } from "node:test";

const repository = fileURLToPath(new URL("../../", import.meta.url));
let root;
const pages = new Map();
const styles = new Map();
const searchPages = new Map();
let api;

after(async () => {
    if (api) await new Promise((resolve, reject) => api.close((error) => error ? reject(error) : resolve()));
    if (root) await rm(root, { recursive: true, force: true });
});

before(async () => {
    const output = path.join(repository, "artifacts/button-rendering");
    await mkdir(output, { recursive: true });
    root = await mkdtemp(path.join(output, "application-"));
    await cp(path.join(repository, "src"), path.join(root, "src"), {
        recursive: true,
        filter: (source) => source !== path.join(repository, "src/pages"),
    });
    await mkdir(path.join(root, "src/pages"), { recursive: true });
    await writeFile(path.join(root, "package.json"), '{"type":"module"}\n');
    await symlink(path.join(repository, "node_modules"), path.join(root, "node_modules"), "dir");
    // Reuse complete API snapshots so these component checks stay offline.
    const responses = new Map(await Promise.all([
        ["study", "study-s-biad3335-response.json"],
        ["image", "image-001b8ef2-7a5e-4b94-b91c-d93f5095ee39-response.json"],
    ].map(async ([kind, file]) => [kind, await readFile(path.join(repository, "tests/fixtures/api", file), "utf8")])));
    api = createServer((request, response) => {
        const kind = new URL(request.url, "http://localhost").pathname.split("/").pop();
        const body = responses.get(kind);
        response.writeHead(body ? 200 : 404, { "Content-Type": "application/json" });
        response.end(body ?? '{}');
    });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    const apiURL = `http://127.0.0.1:${api.address().port}`;
    await writeFile(path.join(root, "astro.config.mjs"), `
import { defineConfig, envField } from 'astro/config';
import mdx from '@astrojs/mdx';
export default defineConfig({
    cacheDir: './.astro-cache',
    vite: { cacheDir: './.vite-cache' },
    integrations: [mdx()],
    env: { schema: {
        PUBLIC_SEARCH_API: envField.string({ access: 'public', context: 'client', default: ${JSON.stringify(apiURL)} }),
        PUBLIC_GTAG: envField.string({ access: 'public', context: 'client', default: '' }),
        PUBLIC_WEBSITE_STATE: envField.string({ access: 'public', context: 'client', default: 'DEV' })
    } }
});
`);
    for (const layout of ["BaseLayout", "MinimalLayout", "EMPIARLayout", "ProjectsLayout"]) {
        await writeFile(path.join(root, "src/pages", `${layout}.astro`), `---
import Layout from '../layouts/${layout}.astro';
import News from '../components/News.astro';
import SearchBar from '../components/search/SearchBar.astro';
import CodeDialog from '../components/CodeDialog.astro';
import FileListTable from '../components/FileListTable.astro';
import VolumeEMImageCard from '../components/cards/VolumeEMImageCard.astro';
import ViewableImageTable from '../components/ViewableImageTable.astro';
import SOTables from '../components/spatialomics/SOTables.astro';
import BenchmarkingTable from '../components/ai-benchmarking/BenchmarkingTable.astro';
import ModelPredictionTable from '../components/ai-benchmarking/ModelPredictionTable.astro';
import ImageTable from '../components/image/ImageTable.astro';
import SpecimenTrackTable from '../components/image/SpecimenTrackTable.astro';
import volumeImages from '../data/collections/vem_image_summaries.json';
const [uuid, image] = Object.entries(volumeImages)[0];
const study = JSON.parse(${JSON.stringify(responses.get("study"))}).hits.hits[0]._source;
const capturedImage = JSON.parse(${JSON.stringify(responses.get("image"))}).hits.hits[0]._source;
// Synthetic metrics exercise table rendering; study/dataset identities come
// from the shared API capture, served by the local fixture endpoint.
const tableRows = [{ study: study.accession_id, dataset_uuid: study.dataset[0].uuid,
    annotation_data_set_uuid: study.dataset[0].uuid, precision: 1, recall: 1,
    IoU: 1, dice: 1, analysis_parameters: {} }];
---
<Layout pageTitle="Button rendering" projectTitle="Button rendering">
  <section id="button-fixture">
    ${layout === "BaseLayout" ? "" : "<SearchBar />"}
    <News />
    <CodeDialog dialogClass="fixture-dialog" title="Copy command" copyButtonClass="spora-button fixture-copy" />
    <FileListTable file_list_urls={{ table_view: 'https://example.org/table', tree_view: 'https://example.org/tree' }} ftp_path="https://example.org/files" globus_link="https://example.org/globus" />
    <section id="gallery-fixture"><VolumeEMImageCard image={{ ...image, uuid }} /></section>
    <section id="table-fixture">
      <ViewableImageTable study={study} images={[image]} />
      <SOTables datasetUUIDsAndFileStats={[]} />
      <BenchmarkingTable tableRows={tableRows} studyOrModelPageMode="model" />
      <ModelPredictionTable tableRows={tableRows} studyOrModelPageMode="model" />
      <ImageTable images={[capturedImage]} />
      <SpecimenTrackTable images={[capturedImage]} />
    </section>
  </section>
</Layout>
`);
    }
    for (const kind of ["study", "image"]) {
        await writeFile(path.join(root, "src/pages", `search-${kind}.astro`), `---
import Layout from '../layouts/MinimalLayout.astro';
import Search from '../components/search/Search.astro';
---
<Layout pageTitle="Search controls">
  <Search query="" url={new URL(Astro.request.url)} searchType="${kind}" />
</Layout>
`);
    }
    await promisify(execFile)(process.execPath,
        [path.join(repository, "node_modules/astro/astro.js"), "build", "--root", root],
        { cwd: repository, env: { ...process.env, PUBLIC_SEARCH_API: apiURL }, timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
    for (const layout of ["BaseLayout", "MinimalLayout", "EMPIARLayout", "ProjectsLayout"]) {
        const html = await readFile(path.join(root, "dist", layout, "index.html"), "utf8");
        pages.set(layout, html);
        styles.set(layout, await renderedStyles(html));
    }
    for (const kind of ["study", "image"]) {
        const html = await readFile(path.join(root, "dist", `search-${kind}`, "index.html"), "utf8");
        searchPages.set(kind, { html, css: await renderedStyles(html) });
    }
});

async function renderedStyles(html) {
    const sheets = tags(html, "link").filter((tag) => attribute(tag, "rel") === "stylesheet")
        .map((tag) => attribute(tag, "href")).filter((href) => href?.startsWith("/_astro/"));
    // Astro can inline small shared chunks when the entry graph changes.
    const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]);
    return [...inline, ...await Promise.all(sheets.map((href) => readFile(path.join(root, "dist", href), "utf8")))].join("\n");
}

function attribute(tag, name) {
    return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

function tags(html, name) {
    return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((match) => match[0]);
}

test("every document layout loads the shared action geometry", () => {
    for (const [layout, css] of styles) {
        assert.match(css, /--bia-button-radius:\s*0px/, layout);
        assert.match(css, /:is\(a,\s*button,\s*input\)\.bia-button\s*\{[^}]*border-radius:\s*var\(--bia-button-radius\)/, layout);
    }
});

test("gallery card actions adopt the shared geometry without a scoped radius override", () => {
    for (const [layout, html] of pages) {
        const gallery = html.match(/<section id="gallery-fixture">([\s\S]*?)<\/section>/)?.[1];
        assert(gallery, layout);
        const buttons = tags(gallery, "button");
        const links = tags(gallery, "a").filter(tag => attribute(tag, "class")?.includes("card-action"));
        assert.equal(buttons.length, 1, layout);
        assert.equal(links.length, 3, layout);
        for (const action of [...buttons, ...links]) assert.match(attribute(action, "class"), /\bbia-button\b/);
        assert.doesNotMatch(gallery, /<button\b[^>]*>\s*<a\b|<a\b[^>]*>\s*<button\b/);
        // Astro's generated scoping selector can outrank the shared hook.
        const scopedRules = [...styles.get(layout).matchAll(/(?:button|\.card-action)\[data-astro-cid-[^\]]+\][^{]*\{([^}]*)\}/g)];
        assert(scopedRules.length > 0, layout);
        for (const rule of scopedRules) assert.doesNotMatch(rule[1], /border-radius:\s*(?!var\(--bia-button-radius)[^v\s]/, layout);
    }
});

test("the newsletter action is one native navigation link with its original destination", () => {
    for (const html of pages.values()) {
        const newsletter = html.match(/<a\b[^>]*href="https:\/\/listserver\.ebi\.ac\.uk\/mailman\/listinfo\/bioimage-archive-announce"[^>]*>([\s\S]*?)<\/a>/);
        assert(newsletter);
        assert.match(attribute(newsletter[0], "class"), /\bbia-button\b/);
        assert.match(newsletter[1], /Subscribe to our mailing list/);
        assert.doesNotMatch(newsletter[1], /<button\b/);
        assert.equal(attribute(newsletter[0], "role"), undefined);
    }
});

test("application tables scope pagination geometry without changing native table identities", async () => {
    for (const [layout, html] of pages) {
        const { ast } = await parse(html);
        function scopeForTable(node, id, scoped = false) {
            const attributes = node.attributes || [];
            const insideScope = scoped || attributes.some(attribute => attribute.name === 'class' && /\bbia-table-controls\b/.test(attribute.value));
            if (node.name === 'table' && attributes.some(attribute => attribute.name === 'id' && attribute.value === id)) return insideScope;
            for (const child of node.children || []) {
                const found = scopeForTable(child, id, insideScope);
                if (found !== undefined) return found;
            }
        }
        for (const id of ["viewable_images_table", "sotables_file_references_table", "benchmarking_table",
            "model_prediction_table", "viewable_input_images_table", "specimen_track_table"]) {
            assert.equal(scopeForTable(ast, id), true, `${layout}: ${id} must exist inside the application table scope`);
        }
        const css = styles.get(layout);
        assert.match(css, /\.bia-table-controls div\.dt-container \.dt-paging \.dt-paging-button/);
        assert.match(css, /\.bia-table-controls \.dataTables_wrapper \.dataTables_paginate \.paginate_button\s*\{[^}]*border-radius:\s*var\(--bia-button-radius\)/);
    }
});

test("study and image results share square selection faces while retaining native radios and switches", () => {
    for (const [kind, { html, css }] of searchPages) {
        for (const name of ["toggle-switch", "toggle-label", "column-toggle", "column-label"]) {
            assert.match(css, new RegExp(`\\.${name}\\s*\\{[^}]*border-radius:\\s*var\\(--bia-button-radius\\)`), kind);
        }
        const radios = tags(html, "input").filter((tag) => attribute(tag, "type") === "radio");
        assert.equal(radios.length, 6, kind);
        assert.deepEqual(radios.filter((tag) => attribute(tag, "name") === "view").map((tag) => attribute(tag, "value")), ["card-view", "table-view", "grid-view"]);
        assert.match(html, /class="slider round"/, kind);
        assert.match(css, /\.slider\.round\s*\{[^}]*border-radius:\s*24px/, kind);
    }
});

test("search submission, selected file views and dialog commands retain native contracts", () => {
    for (const html of pages.values()) {
        const buttons = tags(html, "button");
        const submit = buttons.find((tag) => attribute(tag, "id") === "search-submit-button");
        assert.equal(attribute(submit, "type"), "submit");
        const search = buttons.filter((tag) => attribute(tag, "data-scope"));
        assert(search.length >= 2);
        for (const button of search) {
            assert.match(attribute(button, "class"), /\bbia-button\b/);
            assert.equal(attribute(button, "type"), "button");
        }
        for (const [view, pressed] of [["table", "true"], ["tree", "false"]]) {
            const button = buttons.find((tag) => attribute(tag, "data-view") === view);
            assert.match(attribute(button, "class"), /\bbia-button\b/);
            assert.equal(attribute(button, "aria-pressed"), pressed);
            assert.equal(attribute(button, "type"), "button");
        }
        const copy = buttons.find((tag) => attribute(tag, "class")?.split(/\s+/).includes("fixture-copy"));
        assert.match(attribute(copy, "class"), /\bbia-button\b/);
        assert.match(attribute(copy, "class"), /\bspora-button\b/);
        assert.equal(attribute(copy, "type"), "button");
        const close = buttons.find((tag) => attribute(tag, "class")?.split(/\s+/).includes("spora-button--ghost"));
        assert.match(attribute(close, "class"), /\bbia-button\b/);
        assert.equal(attribute(close, "value"), "cancel");
        assert.match(html, /<form method="dialog"/);
    }
});

test("file navigation actions are single native links with preserved destinations", () => {
    for (const html of pages.values()) {
        for (const [url, label] of [["https://example.org/files", "Browse HTTP"], ["https://example.org/globus", "Browse Globus"]]) {
            const link = html.match(new RegExp(`<a\\b[^>]*href="${url}"[^>]*>([\\s\\S]*?)<\\/a>`));
            assert(link, label);
            assert.match(attribute(link[0], "class"), /\bbia-button\b/);
            assert.equal(attribute(link[0], "target"), "_blank");
            assert.doesNotMatch(link[1], /<button\b/);
            assert.match(link[1], new RegExp(label));
        }
    }
});

test("gallery information panels retain their own geometry", () => {
    for (const [layout, css] of styles) {
        for (const selector of ["size-bar", "study-link", "license-badge", "cube-wrapper"]) {
            const rules = [...css.matchAll(new RegExp(`\\.${selector}\\[data-astro-cid-[^\\]]+\\]\\s*\\{([^}]*)\\}`, "g"))];
            assert(rules.length > 0, `${layout}: ${selector} is rendered and styled`);
            for (const rule of rules) assert.match(rule[1], /border-radius:\s*4px(?:;|$)/, `${layout}: ${selector} is not an action`);
        }
    }
});

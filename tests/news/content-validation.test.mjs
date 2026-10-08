import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sortNewsByDate } from "../../src/news/article-order.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const evidence = join(repository, "artifacts/news-date-order/content-validation");
await mkdir(evidence, { recursive: true });
const originals = await readdir(join(repository, "src/content/news_articles"));
const template = await readFile(join(repository, "src/content/news_articles", originals[0]), "utf8");

async function fixture(t) {
  const root = await mkdtemp(join(evidence, "articles-"));
  // Register before setup so assertion and setup failures also release this fixture.
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ["src/content/news_articles", "src/news", "src/components", "src/pages", "src/assets/bioimage-archive"]) {
    await mkdir(join(root, directory), { recursive: true });
  }
  for (const path of ["src/content/config.ts", "src/news/article-order.mjs", "src/components/News.astro"]) {
    await copyFile(join(repository, path), join(root, path));
  }
  for (const name of originals) {
    const text = await readFile(join(repository, "src/content/news_articles", name), "utf8");
    const cover = /^cover: \.\.\/\.\.\/assets\/bioimage-archive\/(.+)$/m.exec(text)[1];
    await copyFile(join(repository, "src/assets/bioimage-archive", cover), join(root, "src/assets/bioimage-archive", cover));
  }
  await symlink(join(repository, "node_modules"), join(root, "node_modules"), "dir");
  await writeFile(join(root, "package.json"), '{"type":"module"}\n');
  await writeFile(join(root, "astro.config.mjs"), `import { defineConfig } from 'astro/config';
export default defineConfig({ outDir: './build', cacheDir: './cache', vite: { cacheDir: './vite-cache' } });\n`);
  await writeFile(join(root, "src/pages/index.astro"), `---
import News from "../components/News.astro";
import { getCollection } from "astro:content";
const entries = await getCollection("news_articles");
const inventory = entries.map(({ id, data }) => ({ id, data: { articleDate: data.articleDate } }));
---
<html><body><script id="article-inventory" type="application/json" set:html={JSON.stringify(inventory)} /><News /></body></html>\n`);
  return root;
}

async function build(root) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(repository, "node_modules/astro/astro.js"), "build"], {
      cwd: root,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", NO_COLOR: "1" },
      timeout: 60000,
    });
    let log = "";
    child.stdout.on("data", chunk => { log += chunk; });
    child.stderr.on("data", chunk => { log += chunk; });
    child.on("error", reject);
    child.on("close", (status, signal) => resolve({ status, signal, log }));
  });
  return result;
}

function authored(date, title) {
  return template.replace(/^articleDate:.*$/m, `articleDate: ${JSON.stringify(date)}`).replace(/^title:.*$/m, `title: ${title}`);
}

test("actual collection, schema and component retain every article in date/ID order", async (t) => {
  const root = await fixture(t);
  for (const name of originals) {
    await copyFile(join(repository, "src/content/news_articles", name), join(root, "src/content/news_articles", name));
  }
  for (const [name, date, title] of [
    ["tie-z.md", "12 January 2026", "Tied article Z"],
    ["tie-a.md", "12 January 2026", "Tied article A"],
    ["future.md", "1 January 2099", "Future article"],
  ]) {
    await writeFile(join(root, "src/content/news_articles", name), authored(date, title));
  }
  const result = await build(root);
  assert.equal(result.status, 0, result.log);
  const html = await readFile(join(root, "build/index.html"), "utf8");
  // Helper unit tests define chronology; this check verifies the real collection-to-render wiring.
  const inventory = JSON.parse(/<script id="article-inventory"[^>]*>(.*?)<\/script>/.exec(html)[1]);
  const dates = [...html.matchAll(/<p class="vf-summary__date"[^>]*>(.*?)<\/p>/g)].map(match => match[1]);
  assert.deepEqual(dates, sortNewsByDate(inventory).map(entry => entry.data.articleDate));
  assert.ok(dates.includes("1 January 2099"));
  const titles = [...html.matchAll(/<h3 class="vf-summary__title"[^>]*>(.*?)<\/h3>/g)].map(match => match[1]);
  assert.ok(titles.includes("Tied article A") && titles.includes("Tied article Z"));
  assert.ok(titles.indexOf("Tied article A") < titles.indexOf("Tied article Z"));
  assert.equal((html.match(/class="vf-summary vf-summary--news news-article fade"/g) || []).length, originals.length + 3);
});

for (const [name, date] of [
  ["impossible day", "31 February 2026"],
  ["missing date", undefined],
]) {
  test(`Astro rejects an identifiable article with ${name}`, async (t) => {
    const root = await fixture(t);
    const text = date === undefined ? template.replace(/^articleDate:.*\n/m, "") : authored(date, "Invalid date article");
    await writeFile(join(root, "src/content/news_articles/invalid-date.md"), text);
    const result = await build(root);
    assert.notEqual(result.status, 0, "Invalid authored content must prevent publication");
    assert.equal(result.signal, null, result.log);
    assert.match(result.log, /invalid-date/);
    assert.match(result.log, /articleDate/);
    assert.match(result.log, /InvalidContentEntryDataError/);
    if (typeof date === "string") assert.match(result.log, /Expected a real date in D Month YYYY format/);
  });
}

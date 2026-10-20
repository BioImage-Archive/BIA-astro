import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from '@astrojs/compiler';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const output = new URL('../../../artifacts/shared-document-boundaries/', import.meta.url);
const layouts = ['BaseLayout', 'EMPIARLayout', 'ProjectsLayout', 'MinimalLayout'];
const pages = new Map();
let root;
after(async () => { if (root) await rm(root, { recursive: true, force: true }); });

before(async () => {
    await mkdir(output, { recursive: true });
    root = await mkdtemp(new URL('application-', output));
    await mkdir(root + '/src/pages', { recursive: true });
    await symlink(repository + '/src/styles', root + '/src/styles', 'dir');
    await symlink(repository + '/node_modules', root + '/node_modules', 'dir');
    await writeFile(root + '/package.json', '{"type":"module"}\n');
    await writeFile(root + '/astro.config.mjs', `import {defineConfig,envField} from 'astro/config';
export default defineConfig({cacheDir:'./.astro-cache',vite:{cacheDir:'./.vite'},base:'/bioimage-archive',env:{schema:Object.fromEntries(Object.entries({PUBLIC_GTAG:'',PUBLIC_WEBSITE_STATE:'DEV',PUBLIC_SEARCH_API:'https://fixture.invalid'}).map(([name,value])=>[name,envField.string({access:'public',context:'client',default:value})]))}});\n`);
    for (const layout of layouts) {
        await writeFile(root + '/src/pages/' + layout + '.astro', `---
import Layout from ${JSON.stringify(repository + '/src/layouts/' + layout + '.astro')};
---
<Layout pageTitle="Document boundaries" projectTitle="Document boundaries">
    <main id="layout-fixture"><a href="/bioimage-archive/studies">Study catalogue</a></main>
</Layout>\n`);
    }
    const { stdout, stderr } = await promisify(execFile)(process.execPath,
        [repository + '/node_modules/astro/astro.js', 'build', '--root', root], {
            cwd: repository, timeout: 120000, maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', BIA_PREVIEW_PR: '123', BIA_PREVIEW_SHA: 'abcdef1234567890' },
        });
    await writeFile(new URL('rendering-build.log', output), stdout + stderr);
    for (const layout of layouts) {
        const html = await readFile(root + '/dist/' + layout + '/index.html', 'utf8');
        pages.set(layout, html);
        await writeFile(new URL(layout + '.html', output), html);
    }
});

const attributes = node => new Map((node.attributes || []).map(attribute => [attribute.name, attribute.value]));
const elements = node => (node.children || []).filter(child => child.type === 'element');
const descendants = node => [node, ...(node.children || []).flatMap(descendants)];
for (const layout of layouts) {
    test(layout + ' owns its masthead, content and footer within one document body', async () => {
        const { ast } = await parse(pages.get(layout));
        const document = elements(ast).find(node => node.name === 'html');
        assert.deepEqual(elements(document).map(node => node.name), ['head', 'body']);
        const [head, body] = elements(document);
        assert.equal(attributes(body).get('class'), 'vf-body');
        const imports = descendants(document).filter(node => attributes(node).has('data-embl-js-content-hub-loader'));
        assert.equal(imports.length, 1);
        assert(elements(head).includes(imports[0]));
        const target = attributes(imports[0]).get('data-target');
        assert(target && target !== 'self');
        const targets = descendants(body).filter(node => String(attributes(node).get('class') || '').split(/\s+/).includes(target));
        assert.equal(targets.length, 1);
        const children = elements(body);
        assert.equal(children.filter(node => attributes(node).get('id') === 'masthead-black-bar').length, 1);
        assert.equal(children.filter(node => node.name === 'aside' && attributes(node).get('role') === 'status').length, 1);
        assert.equal(children.filter(node => node.name === 'footer').length, 1);
        assert(children.indexOf(targets[0]) > children.findIndex(node => node.name === 'footer'));
        const fixture = descendants(body).find(node => attributes(node).get('id') === 'layout-fixture');
        assert.equal(attributes(elements(fixture)[0]).get('href'), '/bioimage-archive/studies');
        for (const suffix of ['ebi-header-footer.css', 'fonts.css']) {
            assert(elements(head).some(node => node.name === 'link' && String(attributes(node).get('href')).endsWith(suffix)));
        }
    });
}

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from '@astrojs/compiler';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const output = new URL('../../../artifacts/table-dependency-order/', import.meta.url);
const layouts = ['BaseLayout', 'EMPIARLayout', 'ProjectsLayout'];
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
<Layout pageTitle="Table dependencies" projectTitle="Table dependencies">
    <p>Table dependency fixture</p>
</Layout>\n`);
    }
    await writeFile(root + '/src/pages/VolumeEMGallery.astro', `---
import Gallery from ${JSON.stringify(repository + '/src/pages/galleries/volumeem.astro')};
---
<Gallery />\n`);
    const { stdout, stderr } = await promisify(execFile)(process.execPath,
        [repository + '/node_modules/astro/astro.js', 'build', '--root', root], {
            cwd: repository, timeout: 120000, maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
        });
    await writeFile(new URL('rendering-build.log', output), stdout + stderr);
    for (const layout of [...layouts, 'VolumeEMGallery']) {
        const html = await readFile(root + '/dist/' + layout + '/index.html', 'utf8');
        pages.set(layout, html);
        await writeFile(new URL(layout + '.html', output), html);
    }
});

function scripts(node) {
    return [
        ...(node.type === 'element' && node.name === 'script' ? [node] : []),
        ...(node.children || []).flatMap(scripts),
    ];
}
for (const layout of [...layouts, 'VolumeEMGallery']) {
    test(layout + ' emits jQuery before each DataTables dependency as ordered deferred classic scripts', async () => {
        const { ast } = await parse(pages.get(layout));
        const dependencies = scripts(ast).map(node => new Map(node.attributes.map(attribute => [attribute.name, attribute.value])))
            .filter(attributes => /^https:\/\/(?:code\.jquery\.com\/jquery-|cdn\.datatables\.net\/.*\/js\/)/.test(attributes.get('src') || ''));
        assert.equal(dependencies.length, layout === 'VolumeEMGallery' ? 4 : 2);
        for (let index = 0; index < dependencies.length; index += 2) {
            assert.match(dependencies[index].get('src'), /^https:\/\/code\.jquery\.com\/jquery-/);
            assert.match(dependencies[index + 1].get('src'), /^https:\/\/cdn\.datatables\.net\//);
        }
        for (const attributes of dependencies) {
            assert(attributes.has('defer'));
            assert(!attributes.has('async'));
            assert(!attributes.has('type') || ['text/javascript', 'application/javascript'].includes(attributes.get('type')));
        }
    });
}

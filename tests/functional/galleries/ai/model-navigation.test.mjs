import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from '@astrojs/compiler';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const output = new URL('../../../../artifacts/native-model-navigation/', import.meta.url);

test('the model action is one native link retaining its supplied URL and button appearance classes', async () => {
    await mkdir(output, { recursive: true });
    const root = await mkdtemp(new URL('application-', output));
    try {
        await mkdir(root + '/src/pages', { recursive: true });
        await symlink(repository + '/node_modules', root + '/node_modules', 'dir');
        await writeFile(root + '/package.json', '{"type":"module"}\n');
        await writeFile(root + '/astro.config.mjs', `import {defineConfig,envField} from 'astro/config';
export default defineConfig({cacheDir:'./.astro-cache',vite:{cacheDir:'./.vite'},env:{schema:Object.fromEntries(Object.entries({PUBLIC_WEBSITE_STATE:'DEV',PUBLIC_SEARCH_API:'https://fixture.invalid'}).map(([name,value])=>[name,envField.string({access:'public',context:'client',default:value})]))}});\n`);
        await writeFile(root + '/src/pages/index.astro', `---
import ModelPage from ${JSON.stringify(repository + '/src/components/ai-benchmarking/ModelPage.astro')};
import modelMetadata from ${JSON.stringify(repository + '/src/data/ai-dataset-benchmarking/model-metadata.json')};
---
<ModelPage modelName="loyal-squid" modelMetadata={modelMetadata} tableInfo={[]} aiProjectLogosBasepath="/bioimage-archive/ai-galleries/" />\n`);
        const { stdout, stderr } = await promisify(execFile)(process.execPath,
            [repository + '/node_modules/astro/astro.js', 'build', '--root', root], {
                cwd: repository, timeout: 120000, maxBuffer: 2 * 1024 * 1024,
                env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
            });
        await writeFile(new URL('rendering-build.log', output), stdout + stderr);
        const html = await readFile(root + '/dist/index.html', 'utf8');
        await writeFile(new URL('model.html', output), html);
        const { ast } = await parse(html);
        const descendants = node => [node, ...(node.children || []).flatMap(descendants)];
        const text = node => node.type === 'text' ? node.value : (node.children || []).map(text).join('');
        const links = descendants(ast).filter(node => node.name === 'a' && text(node).trim() === 'Link to model');
        assert.equal(links.length, 1);
        const link = links[0];
        const attributes = new Map(link.attributes.map(attribute => [attribute.name, attribute.value]));
        const models = JSON.parse(await readFile(repository + '/src/data/ai-dataset-benchmarking/model-metadata.json', 'utf8'));
        assert.equal(attributes.get('href').replaceAll('&amp;', '&'), models['loyal-squid'].model_link);
        assert.deepEqual(attributes.get('class').split(/\s+/).sort(), ['vf-button', 'vf-button--primary', 'vf-button--sm'].sort());
        assert.deepEqual(descendants(link).filter(node => ['a', 'button', 'input', 'select', 'textarea'].includes(node.name)).map(node => node.name), ['a']);
        for (const attribute of ['onclick', 'role', 'target', 'download']) assert(!attributes.has(attribute));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

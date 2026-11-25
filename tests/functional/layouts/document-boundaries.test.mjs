import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from '@astrojs/compiler';

const layouts = ['BaseLayout', 'EMPIARLayout', 'ProjectsLayout', 'MinimalLayout', 'BiologicalVisionsLayout'];
const attributes = node => new Map((node.attributes || []).map(attribute => [attribute.name, attribute.value]));
const templateChildren = node => (node.children || []).filter(child => !['text', 'comment', 'frontmatter', 'doctype'].includes(child.type));
const descendants = node => [node, ...(node.children || []).flatMap(descendants)];

for (const layout of layouts) {
    test(layout + ' places its masthead, content slot and shared footer inside the body', async () => {
        const source = await readFile(new URL('../../../src/layouts/' + layout + '.astro', import.meta.url), 'utf8');
        const { ast, diagnostics } = await parse(source);
        assert.deepEqual(diagnostics.filter(item => item.severity === 1), []);
        assert.deepEqual(templateChildren(ast).map(node => node.name), ['html']);
        const [document] = templateChildren(ast);
        assert.deepEqual(templateChildren(document).map(node => node.name), ['head', 'body']);
        const [head, body] = templateChildren(document);
        assert(String(attributes(body).get('class') || '').split(/\s+/).includes('vf-body'));
        const imports = descendants(document).filter(node => attributes(node).has('data-embl-js-content-hub-loader'));
        assert.equal(imports.length, 0, 'the footer must not use the browser content-hub loader');
        assert.equal(descendants(document).filter(node =>
            String(attributes(node).get('class') || '').split(/\s+/).includes('embl-contenthub-footer')).length,
        0, 'the shared Footer component owns the EMBL footer');
        const children = templateChildren(body);
        assert.equal(children.filter(node => attributes(node).get('id') === 'masthead-black-bar').length, 1);
        assert.equal(children.filter(node => node.type === 'component' && node.name === 'PreviewBanner').length, 1);
        const footers = children.filter(node => node.type === 'component' && node.name === 'Footer');
        assert.equal(footers.length, 1);
        const slots = children.filter(node => node.name === 'slot');
        assert.equal(slots.length, 1);
        assert(children.indexOf(footers[0]) > children.indexOf(slots[0]));
        assert(!descendants(document).some(node => node.name === 'script'
            && /^https:\/\/assets\.emblstatic\.net\/vf\/.*\/scripts\/scripts\.js$/.test(attributes(node).get('src') || '')),
        'the full Visual Framework bundle makes unwanted cross-origin requests');
        for (const suffix of ['ebi-header-footer.css', 'fonts.css']) {
            assert(templateChildren(head).some(node => node.name === 'link' && String(attributes(node).get('href')).endsWith(suffix)));
        }
    });
}

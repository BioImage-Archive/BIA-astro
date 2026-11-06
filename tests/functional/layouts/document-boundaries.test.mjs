import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from '@astrojs/compiler';

const layouts = ['BaseLayout', 'EMPIARLayout', 'ProjectsLayout', 'MinimalLayout'];
const attributes = node => new Map((node.attributes || []).map(attribute => [attribute.name, attribute.value]));
const templateChildren = node => (node.children || []).filter(child => !['text', 'comment', 'frontmatter', 'doctype'].includes(child.type));
const descendants = node => [node, ...(node.children || []).flatMap(descendants)];

for (const layout of layouts) {
    test(layout + ' places its masthead, content slot and footer loader inside the body', async () => {
        const source = await readFile(new URL('../../../src/layouts/' + layout + '.astro', import.meta.url), 'utf8');
        const { ast, diagnostics } = await parse(source);
        assert.deepEqual(diagnostics.filter(item => item.severity === 1), []);
        assert.deepEqual(templateChildren(ast).map(node => node.name), ['html']);
        const [document] = templateChildren(ast);
        assert.deepEqual(templateChildren(document).map(node => node.name), ['head', 'body']);
        const [head, body] = templateChildren(document);
        assert.equal(attributes(body).get('class'), 'vf-body');
        const imports = descendants(document).filter(node => attributes(node).has('data-embl-js-content-hub-loader'));
        assert.equal(imports.length, 1);
        assert(templateChildren(head).includes(imports[0]));
        const target = attributes(imports[0]).get('data-target');
        assert(target && target !== 'self');
        const targets = descendants(body).filter(node => String(attributes(node).get('class') || '').split(/\s+/).includes(target));
        assert.equal(targets.length, 1);
        const children = templateChildren(body);
        assert.equal(children.filter(node => attributes(node).get('id') === 'masthead-black-bar').length, 1);
        assert.equal(children.filter(node => node.type === 'component' && node.name === 'PreviewBanner').length, 1);
        const footers = children.filter(node => node.type === 'component' && node.name === 'Footer');
        assert.equal(footers.length, 1);
        assert.equal(children.filter(node => node.name === 'slot').length, 1);
        assert(children.indexOf(targets[0]) > children.indexOf(footers[0]));
        const scripts = children.filter(node => node.name === 'script'
            && attributes(node).get('src') === 'https://assets.emblstatic.net/vf/v2.5.12/scripts/scripts.js');
        assert.equal(scripts.length, 1);
        assert(children.indexOf(scripts[0]) > children.indexOf(targets[0]));
        for (const suffix of ['ebi-header-footer.css', 'fonts.css']) {
            assert(templateChildren(head).some(node => node.name === 'link' && String(attributes(node).get('href')).endsWith(suffix)));
        }
    });
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createComponentRenderer } from '../../../support/astro/render-component.mjs';

test('author lists have unique IDs and each numbered link targets its own list', async () => {
    const renderer = await createComponentRenderer();
    try {
        const studyInfo = { author: [{ display_name: 'Example author', affiliation: [{ display_name: 'Example institute' }] }] };
        const allIds = [];
        for (const idPrefix of ['gallery-affiliation', 'about-affiliation', undefined]) {
            const html = await renderer.render('src/components/AuthorAffiliation.astro', { studyInfo, idPrefix });
            const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
            const targets = [...html.matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
            assert.equal(ids.length, 1);
            assert.deepEqual(targets, ids);
            allIds.push(...ids);
        }
        assert.deepEqual(allIds, ['gallery-affiliation-1', 'about-affiliation-1', 'affiliation-1']);
        assert.equal(new Set(allIds).size, allIds.length);
    } finally {
        await renderer.close();
    }
});

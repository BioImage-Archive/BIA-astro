import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildFacetOptions, getFacetQueryValues } from '../../src/components/search/facet-options.mjs';

const fixture = JSON.parse(await readFile(new URL('../fixtures/api/browse-image-response.json', import.meta.url)));
function readValue(queryKey, value) {
    return getFacetQueryValues(new URLSearchParams([[queryKey, value]]), queryKey)[0];
}

const numericFacets = {
    image_pixel_x: 'size_x', image_pixel_y: 'size_y', image_pixel_z: 'size_z', time_steps: 'size_t',
    total_size_in_bytes: 'total_size_in_bytes',
    total_physical_size_x: 'total_physical_size_x', total_physical_size_y: 'total_physical_size_y', total_physical_size_z: 'total_physical_size_z',
    voxel_physical_size_x: 'voxel_physical_size_x', voxel_physical_size_y: 'voxel_physical_size_y', voxel_physical_size_z: 'voxel_physical_size_z',
};
for (const [facetKey, queryKey] of Object.entries(numericFacets)) {
    test(`${facetKey} preserves captured API order, values and counts`, () => {
        const buckets = fixture.facets[facetKey].buckets;
        const before = structuredClone(buckets);
        const options = buildFacetOptions(buckets, queryKey);
        assert.deepEqual(options, buckets.map(bucket => ({ value: String(bucket.key), count: bucket.doc_count })));
        assert.deepEqual(buckets, before);
        for (const { value } of options) {
            assert.equal(readValue(queryKey, ` ${value}`), value);
            assert.deepEqual(getFacetQueryValues(new URLSearchParams([[queryKey, value]]), queryKey), [value]);
        }
    });
}

test('integer-like buckets keep their deliberate position without padding', () => {
    const buckets = Object.freeze([{ key: '≤512', doc_count: 4 }, { key: 2048, doc_count: 5 }, { key: '>2048', doc_count: 6 }].map(Object.freeze));
    assert.deepEqual(buildFacetOptions(buckets, 'size_x').map(option => option.value), ['≤512', '2048', '>2048']);
});

test('text and channel/year facets retain their existing ordering and identities', () => {
    const buckets = [{ key: '10', doc_count: 10 }, { key: '2', doc_count: 2 }, { key: 'B', doc_count: 3 }, { key: 'a', doc_count: 4 }];
    for (const key of ['facet.organism', 'size_c', 'facet.year']) {
        assert.deepEqual(buildFacetOptions(buckets, key).map(option => option.value), ['2', '10', 'a', 'B']);
        assert.equal(readValue(key, ' 2'), ' 2');
    }
    assert.equal(buildFacetOptions([{ key: 2026, key_as_string: '2026', doc_count: 1 }], 'facet.year')[0].value, '2026');
});

test('direct values win over eq aliases and repeated values remain intact', () => {
    const params = new URLSearchParams('size_t=+1&size_t=2-10&size_t=1&size_t.eq=51-200');
    assert.deepEqual(getFacetQueryValues(params, 'size_t'), ['1', '2-10', '1']);
    assert.deepEqual(getFacetQueryValues(new URLSearchParams('size_t.eq=+1&size_t.eq=2-10'), 'size_t'), ['1', '2-10']);
    assert.deepEqual(getFacetQueryValues(new URLSearchParams(), 'size_t'), []);
});

test('zero and opaque decimal/comparison tokens are not coerced through numbers', () => {
    for (const value of ['0', '0.000000001000000', '≤0.000000001000000', '0.000000001000000-0.000000002000000', '>200', '1e-9']) {
        const options = buildFacetOptions([{ key: value, doc_count: 0 }], 'size_t', [value]);
        assert.deepEqual(options, [{ value, count: 0 }]);
        assert.equal(readValue('size_t', ` ${value}`), value);
    }
});

test('absent active numeric buckets have unknown counts and are included once', () => {
    assert.deepEqual(buildFacetOptions([{ key: '1', doc_count: 0 }], 'size_t', ['1', '2-10', '2-10']), [
        { value: '1', count: 0 }, { value: '2-10', count: null },
    ]);
    assert.deepEqual(buildFacetOptions([], 'size_t', ['0']), [{ value: '0', count: null }]);
    assert.deepEqual(buildFacetOptions([], 'size_t'), []);
    assert.deepEqual(buildFacetOptions([], 'facet.organism', ['Mouse']), []);
});

test('empty numeric values are inactive without reviving a shadowed eq alias', () => {
    for (const queryKey of ['size_t', 'size_c', 'facet.year']) {
        assert.deepEqual(getFacetQueryValues(new URLSearchParams([[queryKey, ''], [`${queryKey}.eq`, '1']]), queryKey), []);
        assert.deepEqual(getFacetQueryValues(new URLSearchParams([[queryKey, '  '], [queryKey, '0']]), queryKey), ['0']);
    }
    assert.deepEqual(getFacetQueryValues(new URLSearchParams('facet.organism='), 'facet.organism'), ['']);
});

test('channel and year selections survive absent buckets without numeric padding normalization', () => {
    for (const queryKey of ['size_c', 'facet.year']) {
        assert.deepEqual(buildFacetOptions([], queryKey, ['1']), [{ value: '1', count: null }]);
        assert.equal(readValue(queryKey, ' 1'), ' 1');
    }
});

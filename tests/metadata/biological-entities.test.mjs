import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getOrganismClassifications, getBiologicalEntityDescriptions } from '../../src/components/ai-benchmarking/biological-entities.js';

for (const biological_entity of [undefined, null, {}, 'missing', 0, false]) {
    test(`missing or non-array biological entities produce empty metadata: ${JSON.stringify(biological_entity)}`, () => {
        const dataset = Object.freeze({ biological_entity });
        assert.deepEqual(getOrganismClassifications(dataset), []);
        assert.deepEqual(getBiologicalEntityDescriptions(dataset), []);
    });
}

test('absent datasets and empty entity arrays produce empty metadata', () => {
    for (const dataset of [undefined, null, {}, { biological_entity: [] }]) {
        assert.deepEqual(getOrganismClassifications(dataset), []);
        assert.deepEqual(getBiologicalEntityDescriptions(dataset), []);
    }
});

test('valid classifications preserve their order and original objects without mutating entities', () => {
    const human = Object.freeze({ scientific_name: 'Homo sapiens', ncbi_id: '9606' });
    const mouse = Object.freeze({ scientific_name: 'Mus musculus', ncbi_id: '10090' });
    const entities = Object.freeze([
        Object.freeze({ organism_classification: Object.freeze([human, mouse]) }),
        Object.freeze({ organism_classification: human }),
    ]);
    const dataset = Object.freeze({ biological_entity: entities });
    const result = getOrganismClassifications(dataset);
    assert.deepEqual(result, [human, mouse, human]);
    assert.equal(result[0], human);
    assert.notEqual(result, entities);
});

test('missing entity fields and invalid classifications do not reach the taxon renderer', () => {
    const taxon = Object.freeze({ common_name: 'human' });
    const dataset = { biological_entity: [null, {}, { organism_classification: [null, 'human', 9606, [], taxon] }] };
    assert.deepEqual(getOrganismClassifications(dataset), [taxon]);
    assert.deepEqual(getBiologicalEntityDescriptions(dataset), []);
});

test('description strings and arrays retain authored order and text', () => {
    const dataset = Object.freeze({ biological_entity: Object.freeze([
        Object.freeze({ biological_entity_description: 'brain tissue' }),
        Object.freeze({ biological_entity_description: Object.freeze(['liver', 'kidney']) }),
        Object.freeze({}),
    ]) });
    assert.deepEqual(getBiologicalEntityDescriptions(dataset), ['brain tissue', 'liver', 'kidney']);
});

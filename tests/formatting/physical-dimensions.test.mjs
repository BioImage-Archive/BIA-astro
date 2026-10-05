import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPhysicalDimensions, formatPhysicalVoxelDimensions } from '../../src/components/formatting/physical-dimensions.js';

const formatters = [
    { name: 'physical image size', format: formatPhysicalDimensions, prefix: 'total_physical_size_', unit: 'm' },
    { name: 'physical voxel size', format: formatPhysicalVoxelDimensions, prefix: 'voxel_physical_size_', unit: 'm/pixel' },
];

for (const { name, format, prefix, unit } of formatters) {
    const dimensions = (x, y, z) => Object.freeze({ [prefix + 'x']: x, [prefix + 'y']: y, [prefix + 'z']: z });

    const scalarExamples = [
        [0.00001, '1.0e-5'],
        [0.000012345, '1.2e-5'],
        [0.0000012345, '1.2e-6'],
        [0.00000012345, '1.2e-7'],
        [0.0012345, '1.2e-3'],
        [0.25, '2.5e-1'],
        [9.99e-5, '1.0e-4'],
        [0, '0.0e+0'],
        ['0.000012345', '1.2e-5'],
        ['1.2345e-5', '1.2e-5'],
        [12.345, '1.2e+1'],
        [123456789, '1.2e+8'],
    ];

    for (const [value, expected] of scalarExamples) {
        test(`${name}: formats ${JSON.stringify(value)} as ${expected} on every axis`, () => {
            for (const values of [[value, null, null], [null, value, null], [null, null, value]]) {
                assert.equal(format(dimensions(...values)), `${expected} ${unit}`);
            }
        });
    }

    test(`${name}: formats all axes in order in scientific notation with two significant digits and the unit`, () => {
        assert.equal(format(dimensions(1.2345e-5, 2.3456e-5, 3.4567e-5)), `1.2e-5 x 2.3e-5 x 3.5e-5 ${unit}`);
    });

    test(`${name}: formats a first, middle, or last axis without stray separators`, () => {
        for (const values of [[2.5e-8, null, null], [null, 2.5e-8, null], [null, null, 2.5e-8]]) {
            assert.equal(format(dimensions(...values)), `2.5e-8 ${unit}`);
        }
        assert.equal(format(dimensions(null, 2.5e-8, 1e-7)), `2.5e-8 x 1.0e-7 ${unit}`);
    });

    test(`${name}: keeps missing dimensions unknown`, () => {
        for (const values of [[null, null, null], [undefined, undefined, undefined], [1, 1, 1], [null, 1, undefined]]) {
            assert.equal(format(dimensions(...values)), 'Unknown');
        }
        assert.equal(format(Object.freeze({})), 'Unknown');
    });

    test(`${name}: preserves numeric-one omission and numeric-string coercion`, () => {
        assert.equal(format(dimensions(1, 2.5e-8, 1)), `2.5e-8 ${unit}`);
        assert.equal(format(dimensions('1', '1.2345e-5', '0.000012345')), `1.0e+0 x 1.2e-5 x 1.2e-5 ${unit}`);
    });

    test(`${name}: preserves zero and negative measurements`, () => {
        assert.equal(format(dimensions(0, -2.5e-8, 0)), `0.0e+0 x -2.5e-8 x 0.0e+0 ${unit}`);
    });

    test(`${name}: characterizes existing non-finite and malformed input handling`, () => {
        assert.equal(format(dimensions('invalid', Infinity, -Infinity)), `NaN x Infinity x -Infinity ${unit}`);
        assert.equal(format(dimensions('', false, true)), `0.0e+0 x 0.0e+0 x 1.0e+0 ${unit}`);
        assert.equal(format(dimensions(NaN, null, undefined)), `NaN ${unit}`);
    });

    test(`${name}: ignores unrelated metadata and leaves input values intact`, () => {
        const input = Object.freeze({
            ...dimensions(2.5e-8, 2.5e-8, 1e-7),
            size_x: 1024, size_y: 512, size_z: 1, size_c: 3, size_t: 10,
            total_size_in_bytes: 1000,
        });
        const original = { ...input };
        assert.equal(format(input), `2.5e-8 x 2.5e-8 x 1.0e-7 ${unit}`);
        assert.deepEqual(input, original);
    });
}

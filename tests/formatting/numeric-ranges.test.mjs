import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseNumericRange } from '../../src/components/formatting/numeric-ranges.mjs';

for (const [value, start, end] of [
    ['1-2', '1', '2'],
    ['1e-9-2e-9', '1e-9', '2e-9'],
    ['-10--1', '-10', '-1'],
    ['+.5-1.', '+.5', '1.'],
    ['2.50e-12-3.00e-12', '2.50e-12', '3.00e-12'],
    [' 12.0 - 24.00 ', '12.0', '24.00'],
]) {
    test(`numeric interval ${value} retains exact endpoints`, () => {
        assert.deepEqual(parseNumericRange(value), { start, end });
    });
}

for (const value of ['1e-9', '>1e-9', '≤1e-9', '1-2-3', '-1', 'A-B', '', '1e999-2e999', '1e-2-3extra', '1-NaN']) {
    test(`non-interval ${JSON.stringify(value)} is not partially parsed`, () => {
        assert.equal(parseNumericRange(value), null);
    });
}

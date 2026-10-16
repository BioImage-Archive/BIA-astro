import assert from "node:assert/strict";
import { test } from "node:test";
import { validFileCount } from "../../src/components/formatting/file-counts.mjs";

test("file counts preserve exact nonnegative safe integer representations", () => {
    for (const [value, expected] of [[0, 0], [3, 3], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
        ["0", 0], ["-0", 0], ["  +003  ", 3], ["3.000", 3], ["3e0", 3], ["30e-1", 3],
        [".3e1", 3], ["300000000000000000000e-20", 3], ["0e999999999999999999", 0],
        ["0x3", 3], ["0b11", 3], ["0o3", 3], ["9007199254740991.0", Number.MAX_SAFE_INTEGER],
        ["90071992547409910e-1", Number.MAX_SAFE_INTEGER]]) {
        assert.equal(validFileCount(value), expected, String(value));
    }
});

test("file counts reject fractions before rounding or underflow can hide them", () => {
    for (const value of ["1.0000000000000001", "9007199254740991.1", "1e-400", "-1e-400",
        "0.00000000000000001", "2.9999999999999999", "1.01", "-3", "9007199254740992",
        "900719925474099100e-1", "0x20000000000000", "1e999999999999999999",
        "1e-999999999999999999", 1.5, -1, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
        assert.equal(validFileCount(value), null, String(value));
    }
});

test("file counts reject missing values and nonnumeric coercions", () => {
    for (const value of [null, undefined, false, true, [], [3], {}, "", " ", "3files", "3_000",
        "1e", "0x", "0b2", "--3", "+0x3", "Infinity", "NaN"]) {
        assert.equal(validFileCount(value), null, String(value));
    }
});

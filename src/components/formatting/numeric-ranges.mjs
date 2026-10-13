const numberToken = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
const rangePattern = new RegExp(`^\\s*(${numberToken})\\s*-\\s*(${numberToken})\\s*$`);

/** Parse a complete numeric interval without consuming a sign or exponent minus.
 * Keep the authored endpoints as strings so query serialization retains precision.
 * @param {string} value
 */
export function parseNumericRange(value) {
    const match = rangePattern.exec(value);
    return match && Number.isFinite(Number(match[1])) && Number.isFinite(Number(match[2]))
        ? { start: match[1], end: match[2] }
        : null;
}

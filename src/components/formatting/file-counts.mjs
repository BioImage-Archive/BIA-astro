const maximumCount = BigInt(Number.MAX_SAFE_INTEGER);
const decimal = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;
const radix = /^0(?:[xX][\da-fA-F]+|[oO][0-7]+|[bB][01]+)$/;

// Validate string cardinalities before numeric conversion can round a fraction or underflow.
export function validFileCount(value) {
    if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (radix.test(text)) {
        const count = BigInt(text);
        return count <= maximumCount ? Number(count) : null;
    }
    const match = decimal.exec(text);
    if (!match) return null;
    const fraction = match[3] ?? match[4] ?? "";
    let digits = ((match[2] ?? "") + fraction).replace(/^0+/, "");
    if (digits === "") return 0;
    if (match[1] === "-") return null;
    const exponent = Number(match[5] ?? 0);
    if (!Number.isSafeInteger(exponent)) return null;
    const shift = exponent - fraction.length;
    if (shift < 0) {
        const places = -shift;
        if (places >= digits.length || /[1-9]/.test(digits.slice(-places))) return null;
        digits = digits.slice(0, -places);
    } else {
        // Safe integers have at most 16 decimal digits; never expand an unbounded exponent.
        if (digits.length + shift > 16) return null;
        digits += "0".repeat(shift);
    }
    if (digits.length > 16) return null;
    const count = BigInt(digits);
    return count <= maximumCount ? Number(count) : null;
}

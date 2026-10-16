// These range/equality buckets have a deliberate order supplied by the API.
// Legacy URLs may carry one leading space from the object-key ordering workaround.
const orderedNumericFields = new Set([
    'size_x', 'size_y', 'size_z', 'size_t', 'total_size_in_bytes',
    'total_physical_size_x', 'total_physical_size_y', 'total_physical_size_z',
    'voxel_physical_size_x', 'voxel_physical_size_y', 'voxel_physical_size_z',
]);

const numericFields = new Set([...orderedNumericFields, 'size_c', 'facet.year']);

/** @param {string} queryKey */
export function isNumericFacet(queryKey) {
    return numericFields.has(queryKey);
}

/** @param {string} queryKey */
function usesBackendOrder(queryKey) {
    return orderedNumericFields.has(queryKey);
}

/**
 * @param {string} queryKey
 * @param {string} value
 */
function normalizeFacetValue(queryKey, value) {
    return usesBackendOrder(queryKey) && value.startsWith(' ') ? value.slice(1) : value;
}

/**
 * @param {URLSearchParams} searchParams
 * @param {string} queryKey
 */
export function getFacetQueryValues(searchParams, queryKey) {
    const direct = searchParams.getAll(queryKey);
    const values = direct.length > 0 ? direct : searchParams.getAll(`${queryKey}.eq`);
    const normalized = values.map(value => normalizeFacetValue(queryKey, value));
    return isNumericFacet(queryKey) ? normalized.filter(value => value.trim() !== '') : normalized;
}

/**
 * @param {{key: string | number, key_as_string?: string, doc_count: number}[]} buckets
 * @param {string} queryKey
 * @param {string[]} selectedValues
 * @returns {{value: string, count: number | null}[]}
 */
export function buildFacetOptions(buckets, queryKey, selectedValues = []) {
    /** @type {{value: string, count: number | null}[]} */
    let options;
    if (usesBackendOrder(queryKey)) {
        const ordered = new Map();
        for (const bucket of buckets) {
            const value = String(bucket.key ?? '');
            ordered.set(value, { value, count: bucket.doc_count });
        }
        options = [...ordered.values()];
    } else {
        // Keep the established text ordering and ascending integer keys used by
        // channel/year facets. Numeric range ordering never depends on keys.
        const counts = Object.create(null);
        for (const bucket of buckets.slice().sort((a, b) =>
            String(a.key_as_string ?? a.key ?? '').toLowerCase().localeCompare(
                String(b.key_as_string ?? b.key ?? '').toLowerCase()))) {
            counts[String(bucket.key_as_string ?? bucket.key ?? '')] = bucket.doc_count;
        }
        options = Object.entries(counts).map(([value, count]) => ({ value, count }));
    }
    // An active numeric filter remains a successful form control even when its
    // bucket is absent. An unknown count must not be displayed as a zero count.
    if (isNumericFacet(queryKey)) {
        const known = new Set(options.map(option => option.value));
        for (const value of selectedValues) {
            if (!known.has(value)) {
                options.push({ value, count: null });
                known.add(value);
            }
        }
    }
    return options;
}

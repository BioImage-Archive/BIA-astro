// Synthetic boundaries cover values absent from the shared API captures.
// Real study/image integration cases read complete responses from tests/fixtures/api.
const record = (title, protocol_description) => ({ title, protocol_description });

export const completeDataset = {
    uuid: "dataset-one", title: "Repeated dataset title", description: "First dataset description: μm < 5 | intact\nSecond line",
    image_count: 0, physical_voxel_size: "1 x 2 x 3 nm", file_type_counts: { ".tif": 4, directory: 2, file: 4 },
    biological_entity: [{ title: "Sample one", biological_entity_description: "First biological entity",
        organism_classification: [{ scientific_name: "Mus musculus", common_name: "Mouse", ncbi_id: "NCBI:txid10090" }],
        growth_protocol: { protocol_description: "Growth < 2 days | intact\nAnother line" },
        experimental_variable_description: ["Time", "Dose"], extrinsic_variable_description: false, intrinsic_variable_description: 0 }],
    specimen_imaging_preparation_protocol: [record("Repeated protocol", "Preparation one"), record("Repeated protocol", "Preparation two")],
    acquisition_process: [{ ...record("Acquisition", "Acquisition description"), imaging_instrument_description: "Instrument",
        imaging_method_name: ["Method one", "Method two"], default_open: false }],
    other_creation_process: [record("Growth", "Creation description")],
    analysis_method: [record("Analysis", "Analysis description")],
    correlation_method: [{ ...record("Correlation", "Correlation description"), fiducials_used: "Beads", transformation_matrix: "[1, 0, 0]" }],
    annotation_process: [{ ...record("Annotation", "Annotation description"), method_type: "segmentation mask",
        annotation_criteria: "Criteria", annotation_coverage: "All selected images" }],
};

export const testCases = [
    { id: "complete", dataset: completeDataset },
    { id: "repeated", dataset: { uuid: "dataset-two", title: "Repeated dataset title", description: "Second dataset description",
        image_count: 2, annotation_process: [{ ...record("Annotation", "Different dataset annotation"), default_open: "False" }] } },
    { id: "empty", dataset: { description: "No records", image_count: 0, biological_entity: [], acquisition_process: null } },
    { id: "states", dataset: { title: "Disclosure states", acquisition_process:
        [undefined, true, false, "True", "False", "true", "false", null, "", 0].map((state, index) => ({
            ...record(`State ${index}`, `Description ${index}`), ...(state === undefined ? {} : { default_open: state }),
        })) } },
    { id: "literal", dataset: { title: "Literal metadata", description: "https://example.org/" + "x".repeat(300),
        biological_entity: [{ title: '<img src=x onerror="alert(1)">', biological_entity_description: '<script>alert("test")</script> | literal',
            organism_classification: [{ scientific_name: "<em>literal</em>", common_name: 'Quote " & pipe |', ncbi_id: '9606" onclick="alert(1)' }],
            growth_protocol: { protocol_description: "Growth <tag> & unchanged" } }],
        acquisition_process: [{ protocol_description: "Protocol without title" }] } },
    { id: "taxon-labels", dataset: { title: "Partial taxonomic labels", biological_entity: [{ title: "Partial organism names",
        organism_classification: [
            { ncbi_id: "9606" },
            { scientific_name: "Mus musculus" },
            { common_name: "Mouse" },
        ] }] } },
    { id: "empiar", dataset: { title: "EMPIAR overview", description: "EMPIAR dataset description",
        physical_voxel_size: "Recorded source value", image_count: 8 } },
    { id: "statistics", dataset: { title: "Dataset statistics", image_count: 0,
        file_type_counts: { ".czi": 3, ".zip": 2, ".xlsx": 1, directory: 2, file: 6, "": 1 } } },
    { id: "no-statistics", dataset: { title: "Missing statistics", description: "Description without statistics" } },
    { id: "directory-only", dataset: { title: "Directory-only formats", description: "Description without statistics",
        image_count: null, file_type_counts: { directory: 2, file: 6 } } },
    { id: "invalid-formats", dataset: { title: "Invalid formats", description: "Description without statistics",
        file_type_counts: "not a format map" } },
    { id: "additional-metadata", dataset: { title: "Additional metadata precedence", image_count: 999,
        physical_voxel_size: "obsolete", file_type_counts: { ".obsolete": 999 }, additional_metadata: [
            { name: "file_type_counts", value: { file_type_counts: [{ file_type: ".tif", count: 5 }, { file_type: ".csv", count: 2 }] } },
            { name: "voxel_sizes", value: { voxel_sizes: [{ voxel_size_x: 1.25, voxel_size_y: 2.5, voxel_size_z: null }] } },
        ] } },
    { id: "file-list", dataset: { title: "File-list fallback", image_count: 1 },
        datasetFileSummaryString: { datasets: [{ dataset: "File-list fallback", file_count: 12, data_format: "csv" }] } },
    { id: "metadata-fallback", dataset: { title: "Invalid additional metadata", image_count: 9,
        file_type_counts: { ".png": 3 }, additional_metadata: [
            { name: "file_type_counts", value: { file_type_counts: [{ file_type: ".tif", count: "invalid" }] } },
        ] } },
    { id: "invalid-counts", dataset: { title: "Invalid count values", file_type_counts: {
        ".png": 3, ".negative": -1, ".fractional": 1.5, ".boolean": false,
        ".empty": "", ".whitespace": " ", ".array": [], ".unsafe": 9007199254740992,
    } } },
    { id: "invalid-fallback-counts", dataset: { title: "Invalid fallback count values", image_count: false },
        datasetFileSummaryString: { datasets: [{ dataset: "Invalid fallback count values", file_count: -1 }] } },
    { id: "numeric-counts", dataset: { title: "Numeric count values", file_type_counts: { ".png": "3", ".tif": 0 } } },
    { id: "overflow-counts", dataset: { title: "Count aggregate overflow", file_type_counts: {
        ".png": Number.MAX_SAFE_INTEGER, ".tif": 1,
    } } },
    { id: "rounded-count", dataset: { title: "Fractional source count", image_count: "1.0000000000000001" } },
    { id: "underflow-count", dataset: { title: "Underflowing source count", image_count: "-1e-400" } },
    { id: "rounded-file-list", dataset: { title: "Fractional file-list fallback", image_count: 7 },
        datasetFileSummaryString: { datasets: [{ dataset: "Fractional file-list fallback", file_count: "9007199254740991.1" }] } },
    { id: "rounded-formats", dataset: { title: "Partially invalid format counts", image_count: 9,
        file_type_counts: { ".png": "3.0", ".tif": "1e-400" } } },
];

export const imageRecord = { ...record("Image record", "Line one\nLine two | pipe"), imaging_method_name: ["Method A", "Method B"] };

export function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}

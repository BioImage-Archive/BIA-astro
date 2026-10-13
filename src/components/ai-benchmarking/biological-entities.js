function getBiologicalEntities(dataset) {
    return Array.isArray(dataset?.biological_entity) ? dataset.biological_entity : [];
}

export function getOrganismClassifications(dataset) {
    return getBiologicalEntities(dataset)
        .flatMap(entity => entity?.organism_classification || [])
        .filter(taxon => taxon !== null && typeof taxon === "object" && !Array.isArray(taxon));
}

export function getBiologicalEntityDescriptions(dataset) {
    return getBiologicalEntities(dataset)
        .flatMap(entity => entity?.biological_entity_description || []);
}

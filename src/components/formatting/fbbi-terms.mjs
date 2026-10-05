const compactIdentifier = /^(?:obo:)?fbbi[:_]([0-9]{8})$/i;
const termIri = /^https?:\/\/purl\.obolibrary\.org\/obo\/FBbi_([0-9]{8})$/;

export function getFbbiSearchLink(value) {
    // Recognising identifier syntax permits a lookup; it does not establish
    // ontology membership. OLS may legitimately return no matching term.
    if (typeof value !== "string") return null;

    const accession = value.trim();
    const match = compactIdentifier.exec(accession) ?? termIri.exec(accession);
    if (!match) return null;

    const id = `FBbi:${match[1]}`;
    return {
        id,
        href: `https://www.ebi.ac.uk/ols4/search?q=${encodeURIComponent(id)}&ontology=fbbi`,
    };
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[character]);
}

export function renderFbbiTermsHtml(value) {
    const accessions = Array.isArray(value) ? value : [value];

    // The API projects separate name and identifier arrays. Preserve identifier
    // order without assuming a positional association with a method name.
    return accessions.map((accession) => {
        const link = getFbbiSearchLink(accession);
        return link
            ? `<a class="vf-link" href="${escapeHtml(link.href)}">${link.id} (search OLS)</a>`
            : escapeHtml(accession);
    }).join(", ");
}

import { escapeHtmlText, multilineTextRender } from "./plain-text.js";
import { renderFbbiTermsHtml } from "./fbbi-terms.mjs";

const text = value => escapeHtmlText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function taxonHtml(taxon, iconSrc) {
    const scientific = taxon.scientific_name ? `<i>${text(taxon.scientific_name)}</i>` : "";
    const common = taxon.common_name ? text(taxon.common_name) : "";
    const label = scientific && common ? `${scientific} (${common})` : scientific || common;
    const identifier = taxon.ncbi_id;
    const link = identifier ? ` <sup><a href="https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${encodeURIComponent(identifier)}">${text(identifier)} <img src="${iconSrc}" width="15" alt="" style="vertical-align:middle;margin:0px 0px 4px 0px"/></a></sup>` : "";
    return `<li class="vf-content"> ${label}${link}</li>`;
}

/** Render API field values as escaped text plus deliberate ontology/taxon markup. */
export function renderMetadataValue(key, value, iconSrc, preserveLineBreaks = false) {
    if (key === "organism_classification") {
        const taxa = Array.isArray(value) ? value.filter(taxon => taxon && typeof taxon === "object" && !Array.isArray(taxon)) : [];
        return `<ul>${taxa.map(taxon => taxonHtml(taxon, iconSrc)).join("")}</ul>`;
    }
    if (key === "fbbi_id") return renderFbbiTermsHtml(value);
    if (key === "growth_protocol") return text(value.protocol_description ?? "");
    return preserveLineBreaks ? text(value) : multilineTextRender(String(value).replace(/[\r\n]+/g, ", "));
}

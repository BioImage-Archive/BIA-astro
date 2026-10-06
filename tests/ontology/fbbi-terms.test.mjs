import assert from "node:assert/strict";
import test from "node:test";
import { getFbbiSearchLink, renderFbbiTermsHtml } from "../../src/components/formatting/fbbi-terms.mjs";

for (const accession of [
    "FBbi:00000256", "FBBI:00000256", "fbbi:00000256", "FBbi_00000256",
    "obo:FBbi_00000256", "obo:FBbi:00000256", "  FBbi:00000256\n",
    "http://purl.obolibrary.org/obo/FBbi_00000256",
    "https://purl.obolibrary.org/obo/FBbi_00000256",
]) {
    test(`normalize supported accession ${JSON.stringify(accession)}`, () => {
        assert.deepEqual(getFbbiSearchLink(accession), {
            id: "FBbi:00000256",
            href: "https://www.ebi.ac.uk/ols4/search?q=FBbi%3A00000256&ontology=fbbi&isDefiningOntology=true",
        });
    });
}

for (const accession of [
    undefined, null, 256, [], {}, "", "  ", "FBbi:256", "FBbi:000002560",
    "FBbi:0000025x", "FBbi:０００００２５６", "NCBITaxon:9606", "GO:00000256",
    "electron microscopy", "method FBbi:00000256", "javascript:alert(1)",
    "https://example.org/obo/FBbi_00000256", "https://purl.obolibrary.org.evil/obo/FBbi_00000256",
    "https://purl.obolibrary.org@evil.org/obo/FBbi_00000256",
    "https://purl.obolibrary.org/obo/FBbi_00000256?x=1",
    "https://purl.obolibrary.org/obo/FBbi_00000256#fragment",
    "https://purl.obolibrary.org/obo/FBbi_00000256/",
    "https://purl.obolibrary.org/obo/GO_00000256",
    "https://purl.obolibrary.org/obo/FBBI_00000256",
    'FBbi:00000256"><script>alert(1)</script>',
]) {
    test(`reject unsupported accession ${JSON.stringify(accession)}`, () => {
        assert.equal(getFbbiSearchLink(accession), null);
    });
}

test("render an explicitly labelled search with canonical spelling and escaped query parameters", () => {
    assert.equal(renderFbbiTermsHtml("obo:FBbi_00000256"),
        '<a class="vf-link" href="https://www.ebi.ac.uk/ols4/search?q=FBbi%3A00000256&amp;ontology=fbbi&amp;isDefiningOntology=true">FBbi:00000256 (search OLS)</a>');
});

test("preserve identifier order, duplicate occurrences, and input values", () => {
    const input = Object.freeze(["FBbi:00000639", "unknown identifier", "FBbi:00000256", "FBbi:00000639"]);
    const output = renderFbbiTermsHtml(input);
    assert.equal((output.match(/FBbi:00000639/g) ?? []).length, 2);
    assert.ok(output.indexOf("FBbi:00000639") < output.indexOf("unknown identifier"));
    assert.ok(output.indexOf("unknown identifier") < output.indexOf("FBbi%3A00000256"));
    assert.deepEqual(input, ["FBbi:00000639", "unknown identifier", "FBbi:00000256", "FBbi:00000639"]);
});

test("escape unsupported metadata without making it clickable", () => {
    assert.equal(renderFbbiTermsHtml(['<img src=x onerror="alert(1)">', "'&", "javascript:alert(1)"]),
        "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;, &#39;&amp;, javascript:alert(1)");
});

test("render missing identifiers as empty and retain other unsupported scalar text", () => {
    assert.equal(renderFbbiTermsHtml([]), "");
    assert.equal(renderFbbiTermsHtml(null), "");
    assert.equal(renderFbbiTermsHtml(undefined), "");
    assert.equal(renderFbbiTermsHtml(256), "256");
    assert.equal(renderFbbiTermsHtml("  unspecified  "), "  unspecified  ");
});

for (const id of ["FBbi:00000639", "FBbi:99999999", "FBbi:00000032"]) {
    test(`offer a search for ${id} without asserting term existence or guessing a replacement`, () => {
        const link = getFbbiSearchLink(id);
        assert.equal(link.id, id);
        const destination = new URL(link.href);
        assert.equal(destination.origin, "https://www.ebi.ac.uk");
        assert.equal(destination.pathname, "/ols4/search");
        assert.equal(destination.searchParams.get("q"), id);
        assert.equal(destination.searchParams.get("ontology"), "fbbi");
        assert.equal(destination.searchParams.get("isDefiningOntology"), "true");
        assert.match(renderFbbiTermsHtml(id), /\(search OLS\)<\/a>/);
        assert.doesNotMatch(link.href, /\/entities\/|\/classes\//);
    });
}

test("rendering works offline without consulting an external service", () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => { throw new Error("network unavailable"); };
    try {
        assert.match(renderFbbiTermsHtml("FBbi:00000256"), /<a class="vf-link"/);
        assert.match(renderFbbiTermsHtml("FBbi:00000639"), /FBbi%3A00000639/);
    } finally {
        globalThis.fetch = original;
    }
});

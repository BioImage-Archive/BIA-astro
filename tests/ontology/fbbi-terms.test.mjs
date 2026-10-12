import assert from "node:assert/strict";
import test from "node:test";
import { getFbbiSearchLink, renderFbbiTermsHtml } from "../../src/components/formatting/fbbi-terms.mjs";

test("normalize supported forms to a full-ID, defining-ontology search", () => {
    for (const value of [
        "FBbi:00000256", "fbbi:00000256", "FBbi_00000256",
        "obo:FBbi_00000256", "obo:FBbi:00000256", "  FBbi:00000256\n",
        "http://purl.obolibrary.org/obo/FBbi_00000256",
        "https://purl.obolibrary.org/obo/FBbi_00000256",
    ]) {
        assert.deepEqual(getFbbiSearchLink(value), {
            id: "FBbi:00000256",
            href: "https://www.ebi.ac.uk/ols4/search?q=FBbi%3A00000256&ontology=fbbi&isDefiningOntology=true",
        }, JSON.stringify(value));
    }
});

test("reject unsupported types, identifiers and noncanonical term URLs", () => {
    for (const value of [
        undefined, null, 256, [], {}, "", "FBbi:256", "FBbi:000002560",
        "FBbi:0000025x", "FBbi:０００００２５６", "NCBITaxon:9606",
        "method FBbi:00000256", "javascript:alert(1)",
        "https://example.org/obo/FBbi_00000256",
        "https://purl.obolibrary.org.evil/obo/FBbi_00000256",
        "https://purl.obolibrary.org@evil.org/obo/FBbi_00000256",
        "https://purl.obolibrary.org/obo/FBbi_00000256?x=1",
        "https://purl.obolibrary.org/obo/FBbi_00000256#fragment",
        "https://purl.obolibrary.org/obo/FBbi_00000256/",
        "https://purl.obolibrary.org/obo/GO_00000256",
        "https://purl.obolibrary.org/obo/FBBI_00000256",
        'FBbi:00000256"><script>alert(1)</script>',
    ]) {
        assert.equal(getFbbiSearchLink(value), null, JSON.stringify(value));
    }
});

test("label searches explicitly and escape both URLs and unsupported text", () => {
    assert.equal(renderFbbiTermsHtml("obo:FBbi_00000256"),
        '<a class="vf-link" href="https://www.ebi.ac.uk/ols4/search?q=FBbi%3A00000256&amp;ontology=fbbi&amp;isDefiningOntology=true">FBbi:00000256 (search OLS)</a>');
    assert.equal(renderFbbiTermsHtml(['<img src=x onerror="alert(1)">', "'&", "javascript:alert(1)"]),
        "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;, &#39;&amp;, javascript:alert(1)");
});

test("preserve identifier order and duplicates without mutating input", () => {
    const input = Object.freeze(["FBbi:00000639", "unknown identifier", "FBbi:00000256", "FBbi:00000639"]);
    const output = renderFbbiTermsHtml(input);
    const labels = [...output.matchAll(/>(FBbi:[0-9]{8}) \(search OLS\)<\/a>/g)].map((match) => match[1]);
    assert.deepEqual(labels, ["FBbi:00000639", "FBbi:00000256", "FBbi:00000639"]);
    assert.ok(output.includes("</a>, unknown identifier, <a"));
    assert.deepEqual(input, ["FBbi:00000639", "unknown identifier", "FBbi:00000256", "FBbi:00000639"]);
});

test("omit missing values and retain unsupported scalar text", () => {
    for (const value of [[], null, undefined]) assert.equal(renderFbbiTermsHtml(value), "");
    assert.equal(renderFbbiTermsHtml(256), "256");
    assert.equal(renderFbbiTermsHtml("  unspecified  "), "  unspecified  ");
});

test("preserve an unverified identifier as a search without guessing a replacement", () => {
    const link = getFbbiSearchLink("FBbi:00000639");
    assert.equal(link.id, "FBbi:00000639");
    assert.equal(new URL(link.href).searchParams.get("q"), "FBbi:00000639");
    assert.match(renderFbbiTermsHtml(link.id), />FBbi:00000639 \(search OLS\)<\/a>/);
    assert.doesNotMatch(link.href, /\/entities\/|\/classes\//);
});

---
title: FBBI links in acquisition metadata
audience: developer
type: reference
status: maintained
owner: Bijan Mousavi
author: Bijan Mousavi
created: 2026-10-05
last_reviewed: 2026-10-05
repository: BioImage-Archive/BIA-astro
scope: FBBI identifiers and OLS search links in study/image acquisition metadata
related_issue: BIOIM-82
related_issue_url: https://embl.atlassian.net/browse/BIOIM-82
---

# FBBI links in acquisition metadata

Study and image pages expose identifiers supplied in the acquisition record's
`fbbi_id` field. An identifier appears under **Image Acquisition
Processes/Protocols**, in an **Imaging method ontology** row below **Imaging
method** when a method name is present.

FBBI links are conditional: not every study or image has an identifier. Missing,
null or empty identifier arrays produce no ontology row. Supported identifiers
are displayed as `FBbi:00000256 (search OLS)` and link to an OLS search for the
complete identifier, filtered to FBBI. Unsupported or malformed values remain
escaped text rather than becoming links.

## Why the destination is a search

The link offers an ontology lookup; it does not assert that a matching term
exists or that an annotation is scientifically correct. OLS can return a match
or an explicit no-results page. Searches use OLS's current index when the link
is activated, without a locally maintained term catalog or an external request
during page rendering. They use native same-tab navigation, so the browser's
Back action returns to the originating page.

The frontend preserves the supplied eight-digit identifier and normalises only
its supported namespace spelling to `FBbi:`. The [OBO Foundry FBBI
entry](https://obofoundry.org/ontology/fbbi.html) specifies this mixed-case
prefix. Supported input forms include compact colon/underscore identifiers,
the observed `obo:FBbi_` namespace form, and exact HTTP/HTTPS OBO term IRIs.

Method names and identifiers arrive as separate arrays. Their positions are
not assumed to correspond: each remains in its own row, with identifier order
and duplicate occurrences preserved. No identifier is inferred from a method
name, and no method name is replaced with an OLS result label. Corrections to
annotations belong to the source metadata owners.

## Reference behaviours

These examples were checked on 5 October 2026 against the public search API
and the proposed page renderer. They are observations, not permanent promises
about the source data or OLS index. The page paths below are relative to the
frontend host; use a local preview or a deployment containing this renderer.

| Study page path | Supplied identifier | Expected frontend behaviour | Observed OLS outcome |
| --- | --- | --- | --- |
| `/bioimage-archive/study/S-BIAD3335` | `FBbi:00000639`, in both datasets | Two `FBbi:00000639 (search OLS)` links; retain “Optical Projection Tomography (OPT)” | [Full-ID FBBI search](https://www.ebi.ac.uk/ols4/search?q=FBbi%3A00000639&ontology=fbbi) reports no results |
| `/bioimage-archive/study/EMPIAR-12104` | `obo:FBbi_00000256`, in both datasets | Two `FBbi:00000256 (search OLS)` links; retain “Cryo-electron tomography” | [Full-ID FBBI search](https://www.ebi.ac.uk/ols4/search?q=FBbi%3A00000256&ontology=fbbi) returns “electron microscopy” |
| `/bioimage-archive/study/S-BIAD3397` | Empty identifier array | No ontology row or FBBI search link; retain “confocal microscopy” | No search is offered |

Image `/bioimage-archive/image/001b8ef2-7a5e-4b94-b91c-d93f5095ee39`, belonging
to EMPIAR-12104, supplies the same `obo:FBbi_00000256` annotation and displays
one search link. S-BIAD3335's checked study response contains no indexed images.

The no-result lookup for `FBbi:00000639` does not resolve the underlying
annotation. Study/ontology owners must investigate it; the frontend preserves
the supplied identifier. OLS controls search results and availability, and a
search does not guarantee discovery of a renamed or replaced identifier.

## Verification

Run `npm run test:fbbi` from the repository root. The versioned tests cover
identifier syntax, scoped search URLs, HTML escaping, unknown-term lookups,
array preservation, missing metadata and offline rendering. The rendering
tests compile the actual shared components with selected public metadata from
`tests/ontology/fixtures/acquisition-metadata.json`, writing generated output
under `artifacts/ontology-rendering/`. They do not require OLS or the search API.
The `fbbi-tests` job in `.github/workflows/basic_checks.yaml` runs this command
on pull requests to `main` with Node 22.

For a manual check, open the three study pages above in the built preview:

1. Expand acquisition details and confirm the labels and link counts shown
   above. Check that existing method names, protocol text and organism links
   are retained.
2. Activate the S-BIAD3335 and EMPIAR-12104 links. Confirm the OLS query contains
   the full identifier and the FBBI filter. A no-result response is a valid
   lookup outcome, not evidence that the frontend selected a replacement.
3. Use Back to return to the study page. Confirm the links are keyboard
   focusable and remain readable on a narrow viewport.
4. Confirm that S-BIAD3397 offers no ontology row or FBBI search link, and that
   simply loading any page makes no request to OLS.

Live metadata and OLS results can change independently of this repository.
Keep deterministic regression assertions in the captured fixtures; report
unexpected live annotations to their owners rather than guessing replacements.

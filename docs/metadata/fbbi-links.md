---
title: FBBI links in acquisition metadata
audience: developer
type: reference
status: maintained
owner: Bijan Mousavi
author: Bijan Mousavi
created: 2026-10-05
last_reviewed: 2026-10-09
repository: BioImage-Archive/BIA-astro
scope: FBBI identifiers and OLS search links in study/image acquisition metadata
related_issue: BIOIM-82
related_issue_url: https://embl.atlassian.net/browse/BIOIM-82
---

# FBBI links in acquisition metadata

This reference records the display contract and examples for maintainers of the
shared study/image acquisition renderer.

- Supplied `fbbi_id` values appear in an **Imaging method ontology** row.
  Missing or null values and empty arrays produce no row. No identifier is inferred
  from an imaging method name.
- Supported compact identifiers, the observed `obo:FBbi_` alias and exact OBO
  term IRIs become native links labelled `FBbi:00000256 (search OLS)`.
  Unsupported values remain escaped text. Identifier digits, order and
  duplicate occurrences are preserved; names and IDs remain independent arrays.
- Links search the full identifier with `ontology=fbbi` and
  `isDefiningOntology=true`. Rendering makes no request to OLS. A search offers
  a lookup and may return no results; it does not validate or replace an annotation.
  Direct term links depend on upstream validation of term existence.

## Reference examples

API records were captured on 5 October 2026; OLS search outcomes were checked
on 6 October. These observations can change independently of the frontend.
Open these paths on a preview containing the renderer:

| Study path | Supplied ID | Expected display | Dated OLS outcome |
| --- | --- | --- | --- |
| `/bioimage-archive/study/S-BIAD3335` | `FBbi:00000639` | Two search links; keep “Optical Projection Tomography (OPT)” | No results |
| `/bioimage-archive/study/EMPIAR-12104` | `obo:FBbi_00000256` | Two search links; keep “Cryo-electron tomography” | “electron microscopy” |
| `/bioimage-archive/study/S-BIAD3397` | Empty array | No ontology row; keep “confocal microscopy” | No lookup offered |

Image `/bioimage-archive/image/001b8ef2-7a5e-4b94-b91c-d93f5095ee39`
from EMPIAR-12104 displays one `FBbi:00000256 (search OLS)` link. No method name
is replaced with an OLS result label. Annotation corrections belong to the
source data owners.

## Fixture provenance and checks

Shared fixtures in `tests/fixtures/api/` preserve complete, unchanged API
responses, including `hits`, `facets` and `pagination`. Separate study/image
responses retain their respective record shapes. The adjacent `provenance.json`
records each endpoint, capture date and SHA-256 hash.

Rendering tests select studies by accession and the image by UUID, pass the
captured datasets to `DatasetInfo`, and obtain image acquisition metadata from
`_source.creation_process.acquisition_process[0]`. Small synthetic cases remain
for missing/malformed inputs and escaping. Tests do not query the live API or OLS.

Run `npm test` for all versioned suites or `npm run test:fbbi` for focused
formatter and compiled-component checks. The existing `fbbi-tests` PR job runs
the focused command on Node 22. Isolated Astro fixtures under
`artifacts/ontology-rendering/` are removed after each run, including failures.

For a manual check, confirm the rows above, activate a link and verify the full
ID and both search filters. Use Back to return; check keyboard focus and a
narrow viewport. Treat a no-result lookup as an annotation question for the
owners, rather than evidence that the frontend should guess a replacement.

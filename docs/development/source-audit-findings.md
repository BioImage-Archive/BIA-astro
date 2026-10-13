---
title: Source-audit findings and runtime contracts
audience: developer
type: reference
status: maintained
owner: Bijan Mousavi
author: Bijan Mousavi
created: 2026-10-07
last_reviewed: 2026-10-13
repository: BioImage-Archive/BIA-astro
scope: Verified source corrections and preserved runtime contracts from the dead-code audit
related_issue: BIOIM-347
related_issue_url: https://embl.atlassian.net/browse/BIOIM-347
---

# Source-audit findings and runtime contracts

[BIOIM-322](https://embl.atlassian.net/browse/BIOIM-322) delivers the audit tooling together with the reviewed source corrections and removals tracked by [BIOIM-347](https://embl.atlassian.net/browse/BIOIM-347). This document records the source decisions and preserved runtime contracts.

The initial audit reported 80 candidates and 21 parser diagnostics. These counts describe analyzer observations, not 101 unused resources. Review the configured graph, source context and affected behavior before changing code. The audit commands and failure semantics are documented in [repository quality checks](quality.md).

## Verified inventory

| Source snapshot | Candidates | Parser diagnostics |
| --- | ---: | ---: |
| Original reviewed baseline | 80 | 21 |
| Tooling with accepted main (`b8933ae`) | 85 | 21 |
| Reviewed corrections with accepted main | 33 | 0 |

The configured scan now completes. Strict mode exits 1 because candidates remain; report-only mode exits 0. No audit rules or suppressions were relaxed. The historical cleanup retained 28 observations; five further observations come from accepted main and remain visible below. These counts describe review candidates, not confirmed production bugs.

Verification on 13 October 2026 passed **131 tests on Node 22.23.3**, including the real Astro probe. The scoped source check reports zero errors/warnings. The full production build succeeds in an isolated exact-source snapshot; local review worktrees are excluded from that build input. No page or public asset is removed. Browser comparisons describe exercised routes and matching accepted-main inputs, rather than claiming coverage of every runtime state.

The runner rejects omitted or duplicate source reports, ignored selected files and source symlinks escaping the repository. Its latest log is marked in progress before execution. A real Knip fixture also verifies optional spawned-worker, copied metadata-fixture and analyzer-config entry points when independently maintained tooling is combined.

## Verified corrections

The source corrections balance mismatched layout/HTML closing tags, complete type-only frontmatter delimiters and remove stray attribute punctuation. They preserve route exports, scripts, content expressions and valid adjacent Astro conditional siblings. Astro accepted the original files, so parser diagnostics alone did not establish deployed failures. Correcting the source allows the analyzer to inspect previously skipped code and can increase the candidate count.

Unused local tuple elements use destructuring elisions so the second element stays in its original position. The spatialomics file table still initializes DataTables and attaches copy handlers; only its unused return handle and trailing callback argument are removed. Bare DataTables imports preserve module initialization. Removing a local asset import does not remove the asset itself.

Six functions in `SharedJSFunctions.js` have callers within that module. Their implementations remain, with unnecessary exports removed. Only helpers with no active caller are removed. The CC0 licence-logo branch returns the same concatenated URL without assigning it back to an unread local.

The benchmarking biological-entity helpers formerly assigned an empty fallback and then unconditionally called `flatMap` on the original value. The pure helpers in `components/ai-benchmarking/biological-entities.js` normalize missing/non-array collections, preserve valid object identity, ordering and authored descriptions, and omit null/non-object taxon entries before rendering. Metadata regression tests cover these contracts.

The volume-EM view switch requires access to the initialized table instance. The table handle therefore belongs to the script scope shared by the load callback and view-switch function. A handle scoped only inside the callback cannot serve the switch; removing initialization would also break the table. Gallery regression tests exercise the script's load callback, table/card/grid switches and grid-density behavior.

Remove local CSS selectors only after checking their owning markup, client scripts and generated/child content. When one selector in a shared rule is unused, retain the other selectors and declarations. Static source searches and browser comparisons cover the reviewed selectors; they do not prove all future render states.

Shared acquisition fields are escaped before adding display markup, preserving literal pipes and record identity. Dataset-specific presentation can use the same field renderer without changing image presentation. Native viewer links and repeated metadata IDs preserve the annotation carousel's stable hooks.

The corrected Base, EMPIAR and Projects layouts own their body and named ContentHub footer target. Their repaired slotted pages and reusable fragments use ordinary content wrappers. The markup toolchain separately verifies broader rendered structural rules.

## Optional browser controls and dependency order

The viewable-image component renders either a table or an explanatory message. Its processed browser script is still included when the table is absent, so initialization must check for the table before reading its dataset or registering table handlers. When the table exists, the same API requests, image destinations, pagination and state handlers remain active.

The general image page renders the OME-Zarr copy button only when an interactive representation is available. Its script must likewise check for the button before reading its label or attaching the clipboard handler. The normal copy behavior and label restoration remain unchanged.

The Base, EMPIAR and Projects layouts load jQuery before their dependent DataTables 2.1.8 CDN script. Both use [`is:inline`](https://docs.astro.build/en/guides/client-side-scripts/#unprocessed-scripts) to preserve ordinary blocking script tags instead of Astro's module-import processing. Source order alone does not establish execution order for processed scripts. This corrects the previously reproduced `jQuery is not defined` error without changing library versions. Network availability and the volume-EM page's additional legacy CDN scripts remain separate integration concerns.

`npm run test:browser` exercises the actual scripts with absent/present elements, a table API response, clipboard behavior and layout script order. These tests run through `make quality-test`; compiled-browser checks complement the controlled script tests.

## Unreachable components and ineffective styles

Remove `AnnotationFilesTable`, `DatasetFilesTable`, `ImageTableRow`, `ModelFieldInfoTable`, `Article`, `SourceImage` and `MarkdownLayout` after checking the complete tracked repository for consumers, configured graph entries, Markdown layouts and dynamic imports. `Article` had only `ModelFieldInfoTable` as a caller, and both were unreachable. `SourceImage` appeared only in a commented proposal; the source-image linking TODO remains without referencing a removed component. No active route or content layout used these files. Public assets and live file-table components remain.

CaseStudy's `img :global(img)` required an image inside another image, while its `svg` selector had no rendered consumer. Remove these ineffective selectors rather than inventing a new image styling requirement. Compiled case-study image styles are compared before and after the removal.

## Contracts retained during review

| Observation | Why the code remains |
| --- | --- |
| DataTables render placeholders, event settings, `Array.from` values and regex full matches | Earlier parameters reserve the positions of later used callback arguments. Deleting them changes the received data. |
| `StudyTitleInfo` `.highlight` | Client code adds and removes the class on authors and affiliations for click/hover feedback. |
| `ViewableImageTable` `.file-path` | Browser code creates the spans and measures their widths. |
| Table-cell and volume-EM child selectors | Child components generate the matching elements; a local-template warning does not establish absence from the rendered DOM. |
| Collapsed image-metadata selector | Browser code toggles the `data-collapsed` attribute to control the metadata view. |
| Volume-EM `copyURI` | Child-card inline handlers call the browser-global function. |
| jQuery and DataTables type dependencies | Runtime table integrations and automatically loaded ambient browser types need a separate dependency review. |
| Announcement collection loading | The result is unused by active markup, but the awaited content operation remains; deciding to retire the feature is separate work. |
| `buildDatasetFileSummary` | Its only study-page call is currently commented out. Removing the unused import exposes the helper as a new candidate; retiring that feature and its related XML helpers is a separate decision. |
| `getRelatedEntryLinks` export | Accepted main uses this function inside `SharedJSFunctions.js`; its export is a separate API-surface decision. Preserve the function and its callers. |
| SPORA `sporaData`, `sporaIO` and `sporaBench` bindings | Four binding observations across the SPORA landing/dataset pages come from accepted main. Preserve the accepted imports and page implementations pending an initializer/feature review; this integration does not retire them. |

The application corrections do not relax audit rules or remove runtime initializers. The configured graph explicitly preserves live browser scripts and optional worker/fixture entry points. Remaining candidates stay visible. A completed configured scan is narrower than complete runtime coverage; `make quality` can still fail because candidates remain, while report-only mode succeeds when analysis itself completes.

## Build and browser comparison limits

Accepted main already orders home news newest first; that implementation and initial-slide behavior are preserved. The unchanged case-study component iterates an unsorted content collection. Independent builds can therefore produce the same case-study entries in different positions. Output comparison preserves all generated paths and anchor destinations/labels and checks case-study content identity separately from order. No additional case-study ordering policy is introduced here.

DOM references justify preserving child/dynamic style intent, but do not establish that every scoped selector applies in every browser state. Compiled before/after checks cover file-view switching, image-table pagination, spatialomics dataset selection and file-copy URI/label behavior with real API responses and a stubbed clipboard writer. External viewers, network failures and the additional legacy volume-EM CDN integration remain outside this verification.

The current Chromium comparison uses recorded matching jQuery/DataTables and Visual Framework libraries, permits selected API requests and excludes external iframe documents, analytics, fonts and images. It checks news navigation, file controls, author hover, image-table pagination and volume-EM view switching. This verifies the exercised execution paths, not live CDN availability, external viewers, all browser states, Firefox, screen readers or remote CI/deployment. Existing markup findings remain separate from this configured dead-code result.

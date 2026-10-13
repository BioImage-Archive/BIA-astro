---
title: Markup audit findings
audience: developer
type: reference
status: maintained
owner: Bijan Mousavi
author: Bijan Mousavi
created: 2026-10-07
last_reviewed: 2026-10-13
repository: BioImage-Archive/BIA-astro
scope: Structural markup inventory, source tracing and metadata rendering repairs
related_issue: BIOIM-321
related_issue_url: https://embl.atlassian.net/browse/BIOIM-321
---

# Markup audit findings

## Baseline and repair scope

The independent branch is based on main `b8933ae7e7f69082b0c57513c5d088a14682a672`. Its initial source inventory contained 21 parser diagnostics and two explicit-closing findings. After the first closure/text repairs, a fresh build exposed 39,765 ordinary rendered observations. Repeated shared templates account for most observations; this is not a count of independent production bugs.

The repairs below are included with the audit. They were manually reviewed; the runner does not modify application files, and neither BIOIM-322 nor BIOIM-347 is a prerequisite for this branch.

| Finding family | Source repair and preserved contract |
| --- | --- |
| 21 source parser diagnostics | Complete type-only frontmatter delimiters, balance wrappers, close the actual layout/component, and remove stray attribute punctuation and orphan end tags. Keep all source files and routes. |
| Explicit-closing policy | Close the browse heading's named slot and the landing card's section at their intended boundaries. Astro self-closing syntax and void elements remain supported. |
| Scientific text tokenization | Escape plain metadata before adding intentional paragraph markup. Preserve comparisons, Unicode, pipes, taxonomy formatting, NCBI query values and FBBI links. The helper is not a rich-HTML sanitizer. |
| Document content model | Layouts own one document body; pages/components supply fragments. Put styles/import links in the head and visible headers/footer targets/scripts in the body. |
| Metadata content model | Use indented div groups for fields/disclosures instead of placing them directly in lists. Keep real taxonomy lists. Use valid containers around author cards, affiliations and related entries. |
| Navigation controls | Render navigation as styled anchors and retain buttons for actions. Preserve link destinations, targets, copy controls and file-view controls. |
| Repeated IDs/attributes | Keep one public news fragment, one file-list fragment and the AWS download fragment; give other download headings unique IDs. Scope annotation fields by dataset and image metadata by pane. Remove the duplicate card target attribute. |
| Generated MDX paragraphs | Explicitly wrap logo captions so MDX does not synthesize paragraphs containing headings. Preserve text and downloads. |

The ContentHub import uses its existing loader's supported named target in the body. No loader or framework version is upgraded. See the [official loader contract](https://stable.visual-framework.dev/components/embl-content-hub-loader/). Plain-text handling follows [Astro's escaping boundary](https://docs.astro.build/en/reference/directives-reference/#sethtml).

## Verified result on 2026-10-13

- Strict markup audit: **exit 0**, 104 Astro files, one authored HTML file, all 2,024 generated HTML files and eight selected HTTP responses. No configured findings, parser failures or execution failures were recorded.
- All 26 Astro and 15 HTML analyzer probes pass without relaxing rules or adding suppressions.
- `npm test`: **159 passed** on Node 22.23.3. Real-template checks cover raw HTML, destinations, footer ownership, repeated viewer IDs and annotation-dataset targeting. Browser-script tests cover optional controls, dependency execution order and Table/Tree pressed-state and iframe switching.
- Scoped source check: zero errors/warnings; the full production build and both public-file copies pass. Generated/HTTP HTML coverage is recorded separately from interactive browser coverage.
- `SourceImage.astro` has no live consumer and is removed after reference review. No route or public asset is deleted.

The acquisition-field renderer is shared with image metadata while dataset-specific presentation remains independently owned. Plain values are escaped before adding markup, taxon query values are encoded, literal pipe characters are preserved, and rendering does not change input records. Viewer metadata IDs use the copy-button key for repeated panes, while the annotation carousel's existing hooks remain stable.

Navigation actions are native anchors with an inert shared shape hook; commands remain buttons. Card radius rules accept the button token while retaining their prior fallback when that theme is absent. Optional image-table/copy controls are guarded, and jQuery precedes dependent DataTables scripts. The actual file-view handler is tested so styling hooks cannot accidentally alter its selectors.

Raw reports, builds, comparison inputs and browser evidence remain in ignored root `artifacts/`. Results apply to the configured rules and exercised content; API responses can change.

## Combination with other changes

An isolated, freshly installed application combines markup, dead-code corrections, dataset presentation, numeric facets and button geometry. The source changes merge without manual source resolutions. The shared package declarations and lockfile require explicit reconciliation when combining the two audit toolchains.

The combined **273 tests pass** on Node 22. Its full production build passes, and the markup audit completes without findings. The configured dead-code scan still has deliberately retained observations; neither successful analysis nor a successful merge approves their removal. Optional spawned workers, copied fixture modules and ESLint configurations are registered in the graph and covered by a real Knip integration test. Dependency and static-finding CI policy remain separate decisions.

## Remaining verification boundaries

- Structural success is limited to the configured rules and recorded inputs. It is not full HTML, accessibility, security, CSS, link or runtime certification.
- Optional table/copy controls and shared jQuery/DataTables execution order are covered here. Other runtime states and network availability still require focused verification.
- Visual Framework 2.5.12 assigns duplicate tab IDs in the browser on the homepage. Raw output has unique IDs; matching baseline duplicates are recorded, with no newly introduced DOM duplicates. This external script behavior requires separate review.
- Browser checks use recorded matching vendor libraries and a recorded ContentHub response. Analytics, fonts, images and external iframe documents are excluded. Live CDN reliability, all SSR IDs, screen-reader/Firefox coverage and remote CI/deployment are not verified.
- ESLint/Astro-plugin maintenance limits and HTML inline-directive suppression review remain documented in the [audit reference](markup-audit.md). Static audit gates and evidence-retention policy require team agreement under BIOIM-332.

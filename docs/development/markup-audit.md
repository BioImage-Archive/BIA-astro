---
title: Source and rendered markup audit
audience: developer
type: reference
status: maintained
owner: Bijan Mousavi
author: Bijan Mousavi
created: 2026-10-07
last_reviewed: 2026-10-13
repository: BioImage-Archive/BIA-astro
scope: Astro closing-tag policy and structural validation of authored, generated and served HTML
related_issue: BIOIM-321
related_issue_url: https://embl.atlassian.net/browse/BIOIM-321
---

# Source and rendered markup audit

Run from the Git repository root after `npm ci`. This audit reads application files and writes evidence under `artifacts/`; it never applies fixes. It complements the regular Astro source check and browser tests. The runner does not require a dead-code audit or application cleanup.

## Commands

| Command | Scope |
| --- | --- |
| `npm run test:markup` | Helper tests and installed-analyzer/runner regression tests. |
| `make -f makes/markup.mk quality-markup` | Strict Astro/authored-HTML audit. |
| `make -f makes/markup.mk quality-markup-report` | Same audit, with ordinary findings nonblocking. |
| `make -f makes/markup.mk quality-markup-html MARKUP_HTML_DIR=dist` | Source plus every discovered raw HTML file in the selected output directory. |

`npm test` discovers every versioned test under `tests/`, including the markup suites. `npm run quality:markup:check` checks application source, markup tools and tests using `configs/quality/tsconfig.markup.json`, excluding generated artifacts. The Make fragment can be called directly without a root Makefile or dead-code targets. No markup CI gate is enabled by this change.

Build successfully before auditing output. A directory's existence does not prove it belongs to the current source. Keep the build log and source snapshot with the audit evidence:

```sh
npm run build
# Run only after the intended build succeeds.
npm run audit:markup -- --html-dir dist
```

Optional HTTP validation checks raw response text, before browser DOM repair:

```sh
npm run audit:markup -- --routes configs/quality/markup.routes.json --base-url http://127.0.0.1:4321
```

Start the supported local built server first and substitute its actual origin/port. The manifest selects representative routes, not every route or API-dependent state. Each request requires status 200, HTML content type, a nonempty body and the listed body markers. Redirects are not followed; remote origins require `--allow-remote`. HTTP requests require a repository-local route manifest with valid, unchanged input provenance. Rejected response bodies are cancelled so an error stream cannot consume the worker deadline; this follows [Undici’s response-body lifecycle guidance](https://github.com/nodejs/undici#garbage-collection). No authentication cookies are supplied. Responses have a 20-second deadline and an 8 MiB limit and are retained as raw HTML evidence. The worker has a five-minute overall deadline, configurable using `--timeout-ms N` (maximum one hour), including synchronous analyzer work. Audited files are also limited to 8 MiB before provenance hashing; oversized or nonregular inputs make the result incomplete.

## Source policy and output rules

The dedicated ESLint configuration uses the locked Astro parser and a small AST-based `markup/explicit-closing-tags` rule. It checks original tag and fragment ranges so parser-inserted closures cannot hide omissions, including a synthetic zero-width fragment closing range. Authored `<>` fragments require a written `</>` boundary; compiler-generated wrappers are not treated as authored openings. It preserves explicit Astro self-closing syntax, closed fragments, components, HTML voids and SVG. Strings/comments are not scanned as tags. The rule cannot decide the intended boundary, so it has no automatic fix.

Some HTML end tags are legally optional. Requiring them in authored Astro and HTML is an explicit readability policy; the report labels optional Astro closures `READABILITY_POLICY`. It does not claim that every omission is invalid HTML. HTML void elements such as `img`, `br` and `input` need no closing tag.

[HTML-Validate](https://html-validate.org/dev/using-api.html) analyzes authored HTML and raw generated/HTTP HTML independently of Astro. The narrow configuration checks closing order, permitted parent/content relationships, duplicate IDs/attributes, void content and nonvoid self-closing syntax. Rendered HTML permits legal optional end-tag omission; authored HTML additionally enables `no-implicit-close`. This is a structural audit, not a full accessibility, security, CSS, link or HTML conformance certification.

Raw Astro/MDX cannot be passed to an HTML validator. `.astro` files receive Astro-aware analysis; `.html` receives HTML validation. Other extensions are counted as unexamined source formats. Markdown/MDX output is checked when included in selected generated pages or responses. Dynamic client-inserted HTML, remote iframe documents, browser interactions and unrequested SSR states need separate checks. An error repeated across many pages may have one shared layout cause; trace output back to its source before changing it. Generated/HTTP positions are never presented as Astro source lines.

The [findings and rendering repairs](markup-findings.md) record the baseline, group repeated observations and document source, document-body, metadata-container, control and repeated-ID repairs. The audit itself never applies those repairs automatically.

## Tool compatibility

The audit uses locked ESLint 9.39.5, eslint-plugin-astro 1.3.1 and typescript-eslint 8.48.1 profile. That plugin lacks the upstream omitted-end-tag rule, so the local rule is a compatibility fallback. The legacy `astro/valid-compile` setting is specific to this profile; continue running `npm run quality:markup:check` and the normal build separately. The [current upstream documentation](https://ota-meshi.github.io/eslint-plugin-astro/rules/no-omitted-end-tags/) describes a newer compiler/plugin contract and must not be applied to this installed profile without testing. Replace the fallback when a compatible upstream implementation passes the same valid/invalid fixtures; avoid duplicate checks.

HTML-Validate is locked to 10.17.0, compatible with Node 20.19+, 22.16+ or 24+. Top-level application dependency declarations are unchanged. Adding the analyzers also updates shared transitive lock entries; the lockfile and installation are verified together. The ESLint 9 profile is a maintenance limitation; adding this audit does not resolve its end-of-life status.

Successful markup checks and analyzer probes do not establish dependency security. The pinned Astro parser inherits the existing `fast-glob` / `micromatch` / `braces` chain. The [braces nested-pattern denial-of-service advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no published patched version at this review. Keep dependency advisory review separate from markup completeness, and revalidate parser compatibility, regressions and builds when replacing affected dependencies. The audit uses repository-controlled patterns; that is a scope boundary, not a security certification.

Every audit executes 30 Astro and 15 HTML integration probes using the locally installed analyzers. A missing local tool, ignored source, failed probe, invalid configuration or unavailable provenance produces an incomplete result. Tests exercise nested discovery, non-mutation, missing/empty output, fatal source parsing, timeouts, malformed messages, HTTP response contracts and input changes. Regressions also cover ignored-name false positives, uppercase HTML, member/namespaced tags, symlinked output ancestors, malformed/inconsistent worker reports, generated route directories sharing source-exclusion names, streaming HTTP failures, rejected route-manifest provenance and artifact write failures.

## Evidence and exit status

`artifacts/markup-issues.log` points to the current run. `artifacts/markup/<timestamp>-<pid>/` retains normalized findings, raw analyzer JSON, fixture results, worker stdout/stderr and raw HTTP bodies. Invalid worker report text is retained before the parent writes its incomplete-result report. A completed worker result must contain stable before/after provenance, successful analyzer probes and hashed input records consistent with its declared coverage. Failed runs may retain partial evidence without claiming completion. The latest log is marked `IN_PROGRESS` before execution, preventing an interrupted invocation from appearing to be an older successful result. Synchronous Git provenance calls also hard-kill on their own deadlines, so a handled SIGTERM cannot make the worker wait until the overall audit deadline. See [Node's documented synchronous child-process behavior](https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options).

Reports record commit, tracked dirty status, tool versions, configuration/input hashes, exclusions and actual file/response coverage. Before/after hashes include untracked audited inputs. The report records the selected source/authored/generated file inventory separately from analyzed input records. Completed worker reports require those lists to match exactly, without duplicates; internally consistent counts alone cannot conceal skipped selected files. Source/output inventory changes, changed inputs/HEAD, missing committed Git provenance or a timeout invalidate the run. Git-free archives are not considered reproducible complete runs. Build provenance is recorded separately by the person running the build; the scanner cannot prove which build generated a directory.

| Exit | Meaning |
| --- | --- |
| 0 | Configured checks completed without blocking findings, or completed in report-only mode. |
| 1 | Ordinary markup/readability findings in strict mode. |
| 2 | Incomplete analysis, including source/HTML parsing failures or execution/input/configuration failures. |

`--report-only` never suppresses incomplete analysis. Open reports even after a nonzero exit. ESLint inline disabling is disallowed for this audit. HTML-Validate still honors its own inline directives; files containing disable text receive a suppression-review notice and require manual inspection before claiming unsuppressed coverage. Zero active findings is therefore not an exhaustive guarantee.

Repository-root build/report/cache exclusions do not exclude product directories under `src/` or `public/` merely because they share those names. Source discovery still excludes nested Git metadata and third-party `node_modules` directories. Within an explicitly selected generated-output tree, all regular `.html` files are visited even when a route directory is named `artifacts`, `coverage`, `dist` or `node_modules`. Selected Astro/HTML paths that are FIFOs, sockets or other nonregular entries fail discovery before any read; strict and report-only runs return incomplete status. Symbolic links remain recorded exclusions and are not followed.

Generated evidence can contain article text, paths and served data. Review it before sharing. Artifact retention and CI gating require an agreed policy; no automatic removals, markup finding gate or evidence-upload policy is introduced here. The PR workflow runs the common `npm test` command and uses bounded deployment readiness independently of markup finding status. Formatting is also separate: adopting a formatter does not establish the intended closing boundary and should not create a repository-wide rewrite as part of an inventory.

## Integration with other quality tools

Markup uses its own configurations, commands, evidence and failure status. It can run before or after a dead-code audit or source cleanup is introduced. Existing parser failures must remain visible as incomplete analysis until their source/configuration causes are addressed; passing application tests do not override that status.

Both audits retain matching locked analyzer dependencies and separate, compatible npm commands. Knip must treat `scripts/markup/worker.mjs` as an entry because the runner spawns it, and must load `configs/quality/eslint.markup.config.mjs` when discovering ESLint dependencies. Its entry/config regression should cover both paths. Include this Make fragment explicitly if integrating a shared root Makefile; keep the two audits independently invokable. CI gating and artifact retention require a separate agreed policy.

## Shared analyzer dependencies

The markup and dead-code audits use the same locked development-tool profile, including HTML-Validate 10.17.0 and Knip 5.70.1. Both independently reviewed branches retain identical development dependency declarations and lockfiles so combining them does not require competing dependency resolutions. Each branch keeps its own audit commands and source checks; application dependency declarations are unchanged.

A standalone dead-code scan reports HTML-Validate as an unused development dependency until the markup audit is present. Retain that observation as the companion analyzer reservation; do not suppress it or describe it as a source defect. The combined graph uses both analyzers. Regenerate and validate the shared lockfile when changing this profile, and rerun installation, regressions and configured audits on both owning surfaces.

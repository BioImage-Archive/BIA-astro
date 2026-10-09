---
title: Repository quality checks
audience: developer
type: reference
status: maintained
owner: Bijan Mousavi
author: Bijan Mousavi
created: 2026-10-07
last_reviewed: 2026-10-07
repository: BioImage-Archive/BIA-astro
scope: Astro source checks, regression tests and dead-code candidate auditing
related_issue: BIOIM-322
related_issue_url: https://embl.atlassian.net/browse/BIOIM-322
---

# Repository quality checks

## Make interface

The root `Makefile` imports `makes/quality.mk`; quality configuration lives in `configs/quality/`. Run from the repository root with npm dependencies installed. The recipes work with macOS GNU Make 3.81 and do not install packages or rewrite application source.

| Command | Checks |
| --- | --- |
| `make quality` | Formatting regression tests, audit regression tests/Astro probe, normal source check, then strict candidate audit, in order. |
| `make quality-test` | Existing formatting tests plus audit tests and Astro probe. |
| `make quality-check` | Astro check using the scoped, normal source-check configuration. |
| `make quality-audit` | ESLint/Knip candidate inventory, failing on active findings or incomplete analysis. |
| `make quality-report` | Same inventory with nonblocking findings; incomplete analysis still fails. |
| `make quality-types` | Inventory plus stricter unused-local/parameter and JavaScript type diagnostics. |

`make quality` keeps its check order under parallel Make invocation. It fails honestly when the audit cannot analyze a file; it is not expected to pass before existing parser diagnostics and active findings are triaged. A passing source check and build do not override an incomplete static inventory.

`configs/quality/tsconfig.check.json` scopes the normal check to source, quality scripts/configuration and tests, excluding generated evidence. The root `tsconfig.json` and existing build command are unchanged. The stricter audit tsconfig is opt-in because it exposes existing source issues beyond the regular check.

## Audit commands

Run from the repository root after `npm ci`:

```sh
npm run test:dead-code
npm run audit:dead-code
npm run audit:dead-code -- --report-only
```

The audit writes `artifacts/dead-codes.log` even when findings or analyzer failures cause a nonzero exit. Open the report separately rather than chaining the audit and report viewer with `&&`.

| Exit | Meaning |
| --- | --- |
| 0 | Configured analysis completed with no active findings, or completed in report-only mode. |
| 1 | Review candidates or active analysis diagnostics were found. |
| 2 | Incomplete analysis: unavailable tools or provenance, unreadable required inputs, malformed output, parser/configuration failure, timeout, unresolved imports, changed inputs/HEAD, or failed optional type check. |

`--report-only` makes findings nonblocking; it does not suppress failures. Unknown arguments, including `--fix`, are rejected. The runner invokes installed package executables and never downloads tools or runs automatic fixes.

## Configuration and compatibility

The dedicated configurations do not change normal build settings:

- `configs/quality/eslint.config.mjs` uses the Astro parser and client-script processor with TypeScript-aware unused-variable rules, control-flow checks and local CSS checks. Ambient type declarations are excluded from ordinary unused-local rules.
- `configs/quality/knip.json` retains Astro's route discovery and explicitly identifies the audit/probe/test executables, browser scripts loaded through `<script src>` (`ViewableImageTable.js`, `search/search-results.js`), and three layouts referenced through Markdown/MDX frontmatter (`HelpLayout`, `PoliciesLayout`, `MarkdownLayoutLeftAlign`). Those script/layout references are not imports understood by Knip's default compiler; their entry status is backed by actual component/page references. A regression test runs Knip against the repository to preserve the two browser entries. Components are not blanket entry points. The separate Knip npm command makes the analyzer's own dependency use discoverable.
- `configs/quality/tsconfig.dead-code.json` enables unused locals/parameters and JavaScript checking only for the optional type-analysis command.

The locked compatibility profile is ESLint 9.39.5, eslint-plugin-astro 1.3.1, typescript-eslint 8.48.1 and Knip 5.70.1. It uses the plugin's v1 flat-config API. ESLint 9 is [end of life](https://eslint.org/version-support/); this profile is a compatibility baseline, not the long-term maintenance target. A maintained ESLint/Astro-plugin profile must be verified against the entire repository before replacing it. Matching peer ranges and a small passing probe alone do not establish compatibility.

The test command runs report/failure-path regression tests and a real, in-memory Astro integration probe. The probe checks unused imports, frontmatter variables, processed and inline browser scripts, template-only references, local CSS, style variables and malformed source. Every audit repeats the probe before scanning.

Wrapper integration tests use isolated Git repositories and controlled analyzer output to verify successful scans, candidate exit codes, Git failures before/after scanning, unreadable inputs, changed HEAD/source and malformed nested reports in both ordinary and report-only modes. These controlled tests verify the wrapper contract; the Astro probe and live Knip test verify actual analyzer integration. Browser entry assertions parse Astro attributes using the explicitly declared `@astrojs/compiler` 2.12.2 development dependency, preserving equivalent valid quotation/spacing while rejecting commented-out references. The version matches the compiler already locked for Astro; no runtime package version changes are required.

Optional type diagnostics:

```sh
npm run astro -- check --help
npm run audit:dead-code -- --with-astro-check
```

The installed CLI must support `--tsconfig`. This stage can evaluate application configuration and generate `.astro/` types. A nonzero result is incomplete analysis; raw type errors are not automatically dead-code findings. Keep application dependency upgrades separate from analyzer compatibility work.

## Evidence and scope

Each run preserves raw JSON and stdout/stderr/failure logs under `artifacts/dead-code/<timestamp>-<pid>/`, plus `report.json`. The latest human-readable report points to that specific evidence directory. Generated output is ignored by Git; run directories accumulate without automatic deletion.

Reports record commit, tracked dirty state, Node/package versions, lockfile/config hashes, source/config/test input hashes before and after the scan, stage status and timing. Untracked audit inputs are included in the hashes. Review the working tree as well as HEAD when auditing uncommitted changes. Changed input hashes or HEAD make the run incomplete.

Provenance collection is an explicit stage before and after analysis. It requires the actual Git repository root, a committed HEAD, successful status/file enumeration and readable audit inputs/configuration/lockfile. Source snapshots hash file bytes, including untracked files; a missing tracked input or dangling input symlink fails the stage. Git subprocess stdout/stderr, command statuses and failure details are retained alongside analyzer evidence. Failed provenance cannot become a successful report-only scan. Git-free source archives and repositories with no commits therefore return incomplete status.

Nested analyzer report structures and supplied locations are validated before normalization. Knip validation follows the [pinned JSON reporter](https://github.com/webpro-nl/knip/blob/5.70.1/packages/knip/src/reporters/json.ts)'s object, array and member-group shapes; unsupported fields or malformed elements fail the stage. Locations remain optional rather than receiving invented defaults. The pinned Astro parser supplies column 0 for some fatal diagnostics; those positions are preserved. Malformed raw output is retained in the stage's stdout log even when it cannot be normalized.

Findings retain analyzer-provided file, line and column, category and message. Whole-file findings have no fabricated line number. Knip locations in preprocessed Astro/MDX must be checked against the original file before acting. Source excerpts and raw configuration failures can contain sensitive content; inspect evidence before sharing it.

ESLint scans matching Astro, JavaScript and TypeScript files. Knip examines the configured source/config/script/test graph and uses [Astro framework entry points](https://knip.dev/reference/plugins/astro). Its Astro/MDX extraction is import-oriented; it does not replace template-aware unused-variable checks. Plain Markdown, MDX executable expressions, YAML/JSON references, public URL resources, externally hosted CSS/JS and runtime-generated HTML are not comprehensively audited.

Existing inline suppressions are honored and shown when ESLint returns them. Directives disabling a rule entirely require manual review. CSS selectors require checking dynamic classes, child components, slots, widget-generated DOM and browser states.

## Triage

Treat findings as candidates. An unused binding can still have a required initializer or imported module side effect. Preserve positional callbacks, framework route exports, browser globals, feature flags, deployment-specific adapters and public URLs until their contracts are understood.

For example, `src/layouts/BaseLayout.astro` has an unused `DataTable` import binding and a separate bare DataTables import. Layouts also load DataTables/jQuery from CDNs, while browser code initializes tables. The unused binding does not establish that its package, bare import, stylesheet or CDN resource can be removed. Knip's unused direct `jquery` dependency finding also requires checking DataTables' transitive dependency and browser integration.

The same distinction applies to export declarations, ambient types and positional arguments. A function can have no external import while still having callers inside its module. TypeScript automatically loads the jQuery/DataTables type packages to supply browser-global contracts even without explicit imports. Unused callback parameters before a used parameter preserve its argument position; deleting them would change which value the callback receives.

`ViewableImageTable.js` generates `.file-path` elements as HTML strings. Its component's selector is still reported by the local CSS analyzer, which cannot establish the generated DOM or scoped-style behavior. Preserve that style pending browser/scoping review. Selectors targeting child-generated table cells need the same review.

Parse diagnostics mean a file could not be fully analyzed, not that it is unused. The baseline scan encounters existing markup/frontmatter that the parser rejects. Keep those failures visible; investigate source syntax and parser support before trusting a complete inventory. A successful application build can coexist with analyzer parse failures.

For a proposed removal, record the source location, reference searches, classification, side-effect/dynamic-reference risks, affected routes and required checks. Resolve missing graph entries and imports before treating unreachable files as confirmed unused. Rescan after removals because import changes can expose additional unreachable modules.

Keep actual removals in focused, reviewed changes. Validate the normal build and affected browser interactions, including tables, downloads, galleries, focus states and supported deployment modes. Browser coverage describes only exercised behavior. Neither a passing build nor a successful static scan proves that every resource is unused or safe to delete.

A strict CI dead-code gate should wait for baseline triage and an agreed exception policy. Report/failure-path tests can be automated independently; generated reports should be uploaded as artifacts rather than committed.

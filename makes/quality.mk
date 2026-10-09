# Quality commands run from the repository root and use the locked npm tools.
.DEFAULT_GOAL := quality

.PHONY: quality quality-test quality-check quality-audit quality-report quality-types

# Recursive calls preserve ordering even when the caller enables parallel make.
quality:
	$(MAKE) quality-test
	$(MAKE) quality-check
	$(MAKE) quality-audit

quality-test:
	npm test
	npm run test:dead-code

quality-check:
	npm run quality:check

quality-audit:
	npm run audit:dead-code

quality-report:
	npm run audit:dead-code -- --report-only

quality-types:
	npm run audit:dead-code -- --report-only --with-astro-check

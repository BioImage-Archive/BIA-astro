# Run from the repository root: make -f makes/markup.mk <target>.
.PHONY: quality-markup quality-markup-test quality-markup-check quality-markup-report quality-markup-html

quality-markup:
	npm run audit:markup

quality-markup-test:
	npm run test:markup

quality-markup-check:
	npm run quality:markup:check

quality-markup-report:
	npm run audit:markup -- --report-only

quality-markup-html:
	@test -n "$(MARKUP_HTML_DIR)" || (echo "Set MARKUP_HTML_DIR to a successful build output directory" >&2; exit 2)
	npm run audit:markup -- --html-dir "$(MARKUP_HTML_DIR)"

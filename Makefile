PYTHON ?= python3

.PHONY: check test lint demo clean

check: lint test
	$(PYTHON) -m compileall -q guide-service tools
	@if command -v node >/dev/null 2>&1; then node --check guide-service/widget/guide.js; else echo 'node not installed; skipped JS syntax check'; fi
	@if command -v node >/dev/null 2>&1; then node --test guide-service/widget/tests/gaze.test.js guide-service/widget/tests/lipsync.test.js; else echo "node not installed; skipped widget tests"; fi
	git diff --check

lint:
	$(PYTHON) -m ruff check guide-service tools

test:
	$(PYTHON) -m pytest -q

demo:
	$(PYTHON) -m http.server 8912 --directory guide-service

clean:
	rm -rf .pytest_cache .ruff_cache __pycache__ guide-service/__pycache__ guide-service/tests/__pycache__ guide-service/widget/tests/__pycache__ tools/concept/__pycache__ generated

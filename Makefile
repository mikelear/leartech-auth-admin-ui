# leartech-auth-admin-ui — Makefile
# Canonical Angular shape for cloned services. Mirrors leartech-auth-ui
# (df1b5345 — the convention-establishing Angular Makefile). Cloned services
# inherit `make all` / `make pre-push` / `make diagnose` automatically.

.PHONY: all pre-push build test test-coverage lint lint-check format-check \
        type-check audit audit-strict secrets lockfile-check clean help diagnose

NPM                 := npm
NPM_INSTALL         := $(NPM) install --legacy-peer-deps
NPM_CI              := $(NPM) ci --legacy-peer-deps
GITLEAKS_VERSION    := v8.18.4

all: lint test build   ## Lint, test, production build (matches Go canonical 'all')

pre-push: lint-check format-check type-check test build audit secrets lockfile-check   ## Tier-1 gates that MUST pass before pushing

build:   ## Production build (catches AOT errors)
	$(NPM) run build

test:   ## Run unit tests with coverage (headless Chrome)
	$(NPM) run test

test-coverage: test   ## Alias of test — coverage flag is in the npm script

lint:   ## Run eslint via ng lint (auto-fix where safe)
	$(NPM) run lint

lint-check: lint   ## Alias of lint (matches CI, which runs 'npm run lint' permissively)

format-check:   ## Verify formatting with prettier (no-op if no prettier config)
	@if [ -f .prettierrc ] || [ -f .prettierrc.json ] || [ -f .prettierrc.js ] || [ -f prettier.config.js ] || [ -f .prettierrc.yaml ] || [ -f .prettierrc.yml ]; then \
		npx prettier --check "src/**/*.{ts,html,scss,css,json}"; \
	else \
		echo "no prettier config — skipping format-check (add .prettierrc to enforce)"; \
	fi

type-check:   ## Type-check without emitting JS (catches type errors lint misses)
	npx tsc --noEmit

audit:   ## npm audit — fail on high+ severity
	@$(NPM) audit --audit-level=high || { echo "FAIL: npm audit found high-severity vulnerabilities"; exit 1; }

audit-strict:   ## npm audit — fail on moderate+ severity
	$(NPM) audit --audit-level=moderate

lockfile-check:   ## Verify package-lock.json is in sync with package.json (CI-mode — no writes)
	@cp package-lock.json package-lock.json.bak
	@$(NPM_CI) >/dev/null 2>&1 || { mv package-lock.json.bak package-lock.json; echo "FAIL: npm ci failed — package-lock.json may be corrupt or out of sync"; exit 1; }
	@if ! diff -q package-lock.json package-lock.json.bak >/dev/null 2>&1; then \
		mv package-lock.json.bak package-lock.json; \
		echo "FAIL: package-lock.json drifted during 'npm ci' — likely package.json change without lockfile update. Run 'npm install --legacy-peer-deps' and commit package-lock.json."; exit 1; \
	fi
	@rm -f package-lock.json.bak
	@echo "PASS: package-lock.json in sync"

secrets:   ## Scan for committed secrets (gitleaks)
	@command -v gitleaks >/dev/null || { \
		echo "Installing gitleaks $(GITLEAKS_VERSION)..."; \
		GOOS=$$(uname -s | tr '[:upper:]' '[:lower:]'); \
		GOARCH=$$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/'); \
		curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/$(GITLEAKS_VERSION)/gitleaks_$${GITLEAKS_VERSION#v}_$${GOOS}_$${GOARCH}.tar.gz" | \
			tar -xz -C /tmp gitleaks && \
			mkdir -p $$HOME/bin && \
			mv /tmp/gitleaks $$HOME/bin/gitleaks && \
			export PATH=$$HOME/bin:$$PATH; \
	}
	gitleaks detect --source . --no-banner --redact

clean:   ## Clean build artifacts + caches
	rm -rf dist/ coverage/ .angular/ test-results/ *.bak

diagnose:   ## Show which Tekton presubmit checks are covered locally vs need cluster
	@echo "Tekton presubmit checks for this repo (PR-time):"
	@echo "─────────────────────────────────────────────────"
	@for f in .lighthouse/jenkins-x/*.yaml .lighthouse/jenkins-x/*/*.yaml; do \
		[ -f "$$f" ] || continue; \
		case "$$f" in *triggers.yaml|*release.yaml|*pullrequest.yaml) continue;; esac; \
		name=$$(echo "$$f" | sed 's|.lighthouse/jenkins-x/||; s|.yaml$$||'); \
		case $$name in \
			lint) covered="✓ \033[32mmake lint-check\033[0m";; \
			test|test-coverage) covered="✓ \033[32mmake test\033[0m";; \
			npm-audit) covered="✓ \033[32mmake audit\033[0m";; \
			end2end) covered="✗ \033[33mTier 3 — needs preview cluster\033[0m";; \
			end2end-ui) covered="✗ \033[33mTier 3 — Playwright needs preview cluster\033[0m";; \
			ai-review*) covered="✗ \033[33mTier 3 — LLM-against-deployed-preview\033[0m";; \
			security-scan/dynamic*) covered="✗ \033[33mTier 3 — DAST needs running app\033[0m";; \
			security-scan/image*) covered="✗ \033[33mTier 3 — needs built image\033[0m";; \
			security-scan*) covered="◐ \033[33mpartial — gitleaks via 'make secrets'; SAST needs cluster\033[0m";; \
			*) covered="? \033[31munknown — extend Makefile diagnose mapping\033[0m";; \
		esac; \
		printf "  %-30s %b\n" "$$name" "$$covered"; \
	done
	@echo ""
	@echo "Legend: ✓ covered by 'make pre-push'   ◐ partial   ✗ requires Tekton cluster   ? mapping needs update"
	@echo ""
	@echo "Run 'make pre-push' before pushing to catch all locally-covered failures."

help:   ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

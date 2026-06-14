# leartech-auth-admin-ui — Claude Context

Leartech Auth Admin UI — Angular 20 SPA for managing tenants, OAuth
clients, users, and audit logs via `leartech-auth-service /admin/*`
routes. Internal-only ingress in production. Two-mode deployment
(platform / tenant) via Helm values per memory
`project_auth_lifecycle_and_umbrella_design`.

Bootstrapped from `leartech-angular-service-template` at v0.0.1 on
2026-06-14. Wired into the Jenkins X / Lighthouse multi-cluster
CI/CD chain (Azure + GCP).

## Status

- **v0.0.1**: bootstrap only — sample component from template still in
  place. No admin functionality yet.
- **v7-P3.4+** (separate inits): tenant CRUD, OAuth client management,
  user management, audit-log viewer.
- **v7-P3.5**: auth integration against `leartech-auth-service`.
- **v7-P3.6**: backend admin handlers (separate repo, not here).

## Repo layout

| Path | Purpose |
|---|---|
| `src/main.ts` + `src/app/` | Angular 20 standalone app — AppComponent + app.config.ts + app.routes.ts |
| `src/index.html`, `src/styles.scss` | Host page + global styles |
| `src/app/app.component.spec.ts` | Minimal unit test |
| `angular.json` | CLI config — build, serve, test (Karma), lint (@angular-eslint) targets |
| `tsconfig.{json,app.json,spec.json}` | Strict TypeScript config |
| `karma.conf.js` | ChromeHeadlessNoSandbox so CI runs without `--privileged` |
| `eslint.config.mjs` | Flat ESLint config (typescript-eslint + angular-eslint) |
| `Dockerfile` | Multi-stage: `node:22-alpine` build → `ghcr.io/mikelear/leartech-nginx:X` runtime |
| `charts/leartech-auth-admin-ui/` | Helm chart — deployment, service, ingress, config ConfigMap |
| `preview/` | Per-PR preview helmfile (env-templated URLs) |
| `end2end/run.sh` + `end2end/01-smoke.sh` | Smoke tests run by shared end2end Tekton task |
| `.lighthouse/jenkins-x/` | Presubmit + release suite (thin `uses:` wrappers) |
| `renovate.json` | Dependency bump automation (patch auto-merge, leartech-nginx auto-merge) |

## Pipeline triggers

All checks below are thin wrappers over
[mikelear/leartech-pipeline-catalog](https://github.com/mikelear/leartech-pipeline-catalog)
tasks. Zero pipeline logic lives in this repo.

| Check | Catalog source |
|---|---|
| `pr` | `tasks/angular/pullrequest.yaml` — npm install + ng build + kaniko + jx-preview |
| `lint` | `tasks/ng-lint/pullrequest.yaml` |
| `test` | `tasks/ng-test/pullrequest.yaml` — Karma + LCOV coverage sticky comment |
| `npm-audit` | `tasks/npm-audit/pullrequest.yaml` |
| `security-scan` | `tasks/security-scan/pullrequest.yaml` — gitleaks + semgrep + grype |
| `image-scan` | `tasks/security-scan/image-scan.yaml` |
| `dynamic-scan` | `tasks/security-scan/dynamic/pullrequest.yaml` — nmap + egress-isolation |
| `ai-review` | `tasks/ai-review/pullrequest.yaml` — multi-LLM code review |
| `ai-feedback` | `tasks/ai-review/feedback.yaml` — comment-triggered on `/ai-feedback` |
| `end2end` | `tasks/end2end/pullrequest.yaml` — runs this repo's `end2end/run.sh` |
| `release` (postsubmit) | `tasks/angular/release.yaml` — cluster-suffixed tag, cosign, helm-release, jx-promote |

## Runtime base

Built from `ghcr.io/mikelear/leartech-nginx` which bakes in:

- Port 8080, uid 101 (nginx-unprivileged)
- SPA `try_files $uri $uri/ /index.html` fallback
- `/health` returning 200 JSON for Kubernetes probes
- gzip on text assets, 1y immutable cache on hashed static files

## Iteration mechanics

Real admin features land via separate v7-P3.4+ initiatives. Direct
commits to `main` are reserved for bootstrap (this commit) and chart
mode-config wiring; subsequent work goes through PRs.

## Dependencies

- [`mikelear/leartech-pipeline-catalog`](https://github.com/mikelear/leartech-pipeline-catalog) — Tekton task catalog
- [`mikelear/leartech-dockerfiles`](https://github.com/mikelear/leartech-dockerfiles) — `leartech-nginx` base image source
- `ghcr.io/mikelear/leartech-nginx` — runtime base (cosign-signed, weekly rebuild)
- `leartech-helm-library` — shared chart helpers
- Jenkins X / Lighthouse + Tekton on each target cluster
- Upstream: `leartech-auth-service` `/admin/*` routes (v7-P3.6 — separate repo, not yet shipped)

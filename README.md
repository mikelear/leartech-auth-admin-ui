# leartech-auth-admin-ui

Leartech Auth Admin UI — Angular SPA for managing tenants, OAuth clients, users, and audit logs via leartech-auth-service `/admin/*` routes. Internal-only ingress in production. Two-mode deployment (platform / tenant) via Helm values per memory `project_auth_lifecycle_and_umbrella_design`.

## Status

Bootstrap (v0.0.1) from `leartech-angular-service-template`. Real admin views (`TenantListComponent`, OAuth client CRUD, user management, audit-log viewer) land in v7-P3.4+ follow-up initiatives.

## Deployment modes

This UI ships with two Helm value profiles:

- **Platform mode** — operator-facing instance for tenant CRUD + cross-tenant audit-log review. Restricted to platform admins.
- **Tenant mode** — single-tenant self-serve admin for OAuth client + user management inside one tenant boundary.

Profile selection is config-driven (Helm values), not runtime role-based. See memory `project_auth_lifecycle_and_umbrella_design` for the rationale.

## Local dev

```bash
npm install --legacy-peer-deps
npm start                   # ng serve on http://localhost:4200
npm test                    # karma + jasmine, headless chrome
npm run lint
npm run build               # production build → dist/leartech-auth-admin-ui/
```

## CI/CD

Jenkins X / Lighthouse multi-cluster (Azure + GCP). Pipelines defined in `.lighthouse/jenkins-x/` reference the shared catalog at `mikelear/leartech-pipeline-catalog`.

Renovate auto-bumps catalog and base image versions.

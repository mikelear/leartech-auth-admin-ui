# Golden Dockerfile — Node build stage, leartech-nginx runtime.
# Build stage: node:22-alpine for `ng build` (npm install already ran in
# the pipeline's build-npm-install step with GitHub Packages auth, so
# node_modules is in the kaniko build context — no `npm ci` here).
# Runtime: leartech-nginx (nginxinc/nginx-unprivileged + golden default.conf).
# Renovate bumps both tags on new releases.

# ---- build stage ----
FROM node:22-alpine AS build

WORKDIR /app
COPY . .
RUN npm run build

# ---- runtime stage ----
# leartech-nginx bakes in: port 8080, SPA try_files fallback to index.html,
# /health JSON probe, gzip, 1y cache on hashed static assets. Runs as uid 101.
FROM ghcr.io/mikelear/leartech-nginx:0.40.0

COPY --from=build /app/dist/leartech-auth-admin-ui/browser /usr/share/nginx/html

# USER + EXPOSE inherited from base image. Declared explicitly here so
# security scanners that don't chase base-image layers (semgrep's
# missing-user rule, kyverno runAsNonRoot checks) are happy.
USER 101
EXPOSE 8080

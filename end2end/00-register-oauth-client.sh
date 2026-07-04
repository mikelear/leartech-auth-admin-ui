#!/usr/bin/env bash
# Preview-only setup: register the frontend-services OAuth2 client with Hydra.
#
# Preview Hydra uses sqlite + emptyDir — state survives container restart
# but is wiped on pod replacement. In staging/prod Maester + OAuth2Client
# CRDs handle this automatically. This seed runs once per end2end pass and
# is idempotent: 409 on duplicate client_id is treated as success.
#
# Env vars (with preview defaults):
#   HYDRA_ADMIN_URL       e.g. http://preview-auth-service-hydra-admin:4445
#   CLIENT_ID             frontend-services
#   AUTH_UI               https://auth-ui-pr-N.jx.leartech.com

set -euo pipefail

# Hydra admin is cluster-internal only — default to cross-namespace
# FQDN so the end2end task pod (running in the `jx` namespace) can
# reach the preview's Hydra admin service. PREVIEW_NAMESPACE is
# exported by the catalog end2end task.
: "${HYDRA_ADMIN_URL:=http://preview-auth-service-hydra-admin.${PREVIEW_NAMESPACE:?must be set}.svc.cluster.local:4445}"
: "${CLIENT_ID:=frontend-services}"
# Default to the catalog-provided PREVIEW_URL (same host for redirects).
: "${AUTH_UI:=${PREVIEW_URL:?must be set (e.g. https://auth-ui-pr-2.jx.leartech.com)}}"

# `audience` is the RFC 8707 resource allow-list — Hydra rejects any
# `audience=` / `resource=` param on /oauth2/authorize that isn't in
# this list. Mirrors the staging chart values in leartech-auth-service
# (charts/.../values.yaml → oauth.frontend.audiences). Required so
# Playwright specs that drive the OAuth flow with audience params get
# tokens with the expected `aud` populated; without it Hydra 400s with
# "Requested audience ... has not been whitelisted by the OAuth 2.0
# Client". 409 on duplicate means an existing client (with potentially
# stale audience list) — the Hydra pod must recycle to pick up changes.
BODY=$(cat <<JSON
{
  "client_id": "${CLIENT_ID}",
  "grant_types": ["authorization_code","refresh_token"],
  "response_types": ["code"],
  "scope": "openid profile email leartechapi offline",
  "redirect_uris": ["${AUTH_UI}/auth/callback","${AUTH_UI}/silent-renew.html"],
  "post_logout_redirect_uris": ["${AUTH_UI}"],
  "token_endpoint_auth_method": "none",
  "audience": [
    "leartech-auth-service",
    "leartech-rust-service-template",
    "leartech-go-service-template",
    "leartech-dotnet-service-template"
  ]
}
JSON
)

# Capture HTTP status separately from body so we can treat 200/201 + 409
# as success and fail loud on anything else. The previous form (curl |
# grep || echo "may already exist") swallowed every non-2xx — DNS
# failure, 4xx body errors, even 503 — and printed "idempotent" while
# leaving Hydra with zero registered clients. End2end then failed
# downstream with invalid_client instead of pointing at the seed.
#
# Retry-with-backoff: preview-gate verifies Hydra discovery is up but
# auth-service may still be crash-looping on a Postgres cold-start race
# when this script runs, leaving the admin Service with zero endpoints
# for ~10-30s (curl exit 7, no response body). 5 retries × 5s = up to
# 25s; no-op once stack is steady.
echo "==> POST ${HYDRA_ADMIN_URL}/admin/clients (client_id=${CLIENT_ID})"
RESPONSE_FILE=$(mktemp)
HTTP_CODE=""
for attempt in 1 2 3 4 5; do
  if HTTP_CODE=$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' \
      -X POST "${HYDRA_ADMIN_URL}/admin/clients" \
      -H 'Content-Type: application/json' \
      -d "$BODY"); then
    break
  fi
  echo "  attempt ${attempt}/5: curl could not reach Hydra admin — retrying in 5s"
  sleep 5
done

if [ -z "$HTTP_CODE" ]; then
  echo "FAIL: curl could not reach ${HYDRA_ADMIN_URL} after 5 attempts" >&2
  cat "$RESPONSE_FILE" >&2 || true
  rm -f "$RESPONSE_FILE"
  exit 1
fi

case "$HTTP_CODE" in
  200|201)
    echo "ok: ${CLIENT_ID} registered (HTTP ${HTTP_CODE})"
    ;;
  409)
    echo "ok: ${CLIENT_ID} already registered (HTTP 409, idempotent)"
    ;;
  *)
    echo "FAIL: Hydra admin returned HTTP ${HTTP_CODE}" >&2
    echo "URL: ${HYDRA_ADMIN_URL}/admin/clients" >&2
    echo "Body:" >&2
    cat "$RESPONSE_FILE" >&2
    rm -f "$RESPONSE_FILE"
    exit 1
    ;;
esac
rm -f "$RESPONSE_FILE"

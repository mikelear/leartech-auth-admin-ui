#!/usr/bin/env bash
# 03-audience-bound-config.sh — asserts the DEPLOYED SPA is wired for
# audience-bound admin calls to leartech-auth-service.
#
# admin-ui talks to auth-service /admin/*. Group B of the auth hardening
# populates the `aud` array on Hydra-issued tokens; Group C will START
# ENFORCING that `leartech-auth-service` appears in that aud[]. If admin-ui's
# runtime config drifts — no leartech-auth-service in audiences[], or no
# peers.leartech-auth-service base URL — the SPA either won't request the
# right audience (Group C → 401) or won't know where auth-service lives
# (SDK basePath empty → the call never leaves the browser).
#
# This script fetches the deployed api.conf.json served by nginx at the SPA
# root and asserts BOTH:
#   1. audiences[] contains "leartech-auth-service"
#   2. peers.leartech-auth-service is a non-empty https URL
#
# Runs in both preview and staging modes (dual-mode contract shared with
# 01-smoke.sh). Failure blocks the release, catching values.yaml drift
# BEFORE it can break admin flows post-Group-C.

set -eo pipefail

BASE_URL="${STAGING_URL:-${PREVIEW_URL:-}}"
if [ -z "$BASE_URL" ]; then
  echo "[audience-bound] neither STAGING_URL nor PREVIEW_URL set — nothing to test against; aborting" >&2
  exit 1
fi
MODE="preview"
[ -n "${STAGING_URL:-}" ] && MODE="staging"
echo "[audience-bound] mode=${MODE} base=${BASE_URL}"

CONF_URL="${BASE_URL%/}/api.conf.json"
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

code=$(curl -sS -o "$tmp" -w '%{http_code}' -m 10 "$CONF_URL" 2>/dev/null || echo 000)
if [ "$code" != "200" ]; then
  echo "[audience-bound] GET $CONF_URL returned HTTP $code — expected 200" >&2
  head -c 500 "$tmp" >&2 || true
  exit 1
fi

# `jq -e` returns non-zero when the expression is false / null, giving us a
# terse assertion syntax. Each assertion prints a specific failure so a red
# gate points straight at which piece of wiring drifted.
if ! jq -e '.auth.audiences | index("leartech-auth-service")' "$tmp" >/dev/null; then
  echo "[audience-bound] FAIL: auth.audiences does not include \"leartech-auth-service\"" >&2
  echo "[audience-bound] Group C enforcement will 401 admin-ui once it lands." >&2
  echo "[audience-bound] api.conf.json auth.audiences =" >&2
  jq '.auth.audiences' "$tmp" >&2 || true
  echo "[audience-bound] Fix: add \"leartech-auth-service\" to config.auth.audiences in the chart values." >&2
  exit 1
fi
echo "[audience-bound] auth.audiences includes leartech-auth-service ✓"

if ! jq -e '.peers["leartech-auth-service"] | type == "string" and (test("^https?://") // false)' "$tmp" >/dev/null; then
  echo "[audience-bound] FAIL: peers.leartech-auth-service missing / not a URL" >&2
  echo "[audience-bound] Without a base URL the generated auth-service SDK can't reach /admin/*." >&2
  echo "[audience-bound] api.conf.json peers =" >&2
  jq '.peers' "$tmp" >&2 || true
  echo "[audience-bound] Fix: set config.peers.leartech-auth-service in the chart values / preview helmfile." >&2
  exit 1
fi
peer=$(jq -r '.peers["leartech-auth-service"]' "$tmp")
echo "[audience-bound] peers.leartech-auth-service = ${peer} ✓"

echo "[audience-bound] PASS — SPA runtime config is audience-bound for auth-service admin calls"

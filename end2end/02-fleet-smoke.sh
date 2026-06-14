#!/usr/bin/env bash
# 02-fleet-smoke.sh — staging-only fleet health check.
#
# Runs ONLY when the leartech-arrivals-observer dispatches us against a
# staging Arrival (STAGING_URL set). In PR preview contexts (PREVIEW_URL
# set, STAGING_URL unset) we skip cleanly — peer services aren't in the
# preview namespace and we don't want every PR to fail when staging is
# under maintenance.
#
# What it proves:
#   - Each golden-template service is alive at its staging URL on the
#     current cluster
#   - HTTPS + ingress + DNS path resolves end-to-end across the fleet
#   - The canonical /health/live contract (200) holds across languages
#
# What it doesn't (yet — Phase B candidates):
#   - SDK-driven calls that dogfood the published clients
#   - Auth flow (mint token → call /api/v1/example → assert 200)
#
# Failure of any check fails this script (run.sh marks it `fail` in
# results.json, the observer sets Arrival.phase=Failed, the gate fails
# the next promotion PR's verify check).

set -eo pipefail

# Skip-in-PR gate. STAGING_URL is set ONLY by the arrivals-observer's
# dispatched Job; the catalog end2end task (which runs in PR builds)
# sets PREVIEW_URL instead. This pattern means "did the observer
# dispatch us?" rather than guessing from BRANCH_NAME / PIPELINE_KIND.
if [ -z "${STAGING_URL:-}" ]; then
  echo "[fleet-smoke] STAGING_URL unset — running in PR/preview context, skipping fleet check"
  exit 0
fi

# Extract the cluster suffix from our own staging URL so the smoke
# works on both clusters (jx.leartech.com / az.leartech.com) without
# hardcoding which one. Example:
#   STAGING_URL=https://leartech-auth-admin-ui-jx-staging.jx.leartech.com
#                                                                   ^^ this part
CLUSTER_HOST=$(printf '%s\n' "$STAGING_URL" | sed -E 's|^https?://[^.]+-jx-staging\.([^/]+)/?.*$|\1|')
if [ -z "$CLUSTER_HOST" ] || [ "$CLUSTER_HOST" = "$STAGING_URL" ]; then
  echo "[fleet-smoke] could not parse cluster host from STAGING_URL=$STAGING_URL — aborting"
  exit 1
fi

# Peer services that should be reachable on this cluster's jx-staging.
# Real consumers cloning this angular template should review + edit
# this list to match the services their UI consumes.
PEERS="
  leartech-rust-service-template
  leartech-dotnet-service-template
  leartech-go-service-template
"

FAIL=0
echo "[fleet-smoke] cluster=$CLUSTER_HOST"
for peer in $PEERS; do
  url="https://${peer}-jx-staging.${CLUSTER_HOST}/health/live"
  code=$(curl -sSL -o /dev/null -w '%{http_code}' -m 10 "$url" 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then
    printf '[fleet-smoke] %-40s HTTP %s ✓\n' "$peer" "$code"
  else
    printf '[fleet-smoke] %-40s HTTP %s ✗ (want 200)\n' "$peer" "$code"
    FAIL=1
  fi
done

if [ "$FAIL" = "1" ]; then
  echo "[fleet-smoke] FAIL — one or more peer services unhealthy on $CLUSTER_HOST"
  exit 1
fi
echo "[fleet-smoke] PASS — all peers reachable on $CLUSTER_HOST"

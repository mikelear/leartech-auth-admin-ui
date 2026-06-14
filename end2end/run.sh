#!/usr/bin/env bash
# end2end/run.sh — reference implementation (same contract as the Go
# template). Auto-discovers sibling [0-9][0-9]-*.sh scripts, runs each,
# captures pass/fail + duration + tail of output, writes results.json
# to the schema the catalog's tasks/end2end/pullrequest.yaml expects.
#
# Envs the catalog task provides:
#   PREVIEW_URL, PREVIEW_HOST_BASE, PREVIEW_NAMESPACE,
#   APP_NAME, PULL_NUMBER, REPO_OWNER, REPO_NAME, CLUSTER_ID, VERSION,
#   GIT_TOKEN (use carefully)

set -eo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "[end2end] preview=${PREVIEW_URL:-<unset>} ns=${PREVIEW_NAMESPACE:-<unset>} pr=${PULL_NUMBER:-<unset>}"

results_file="$SCRIPT_DIR/results.json"
tests_json="[]"
passed=0
failed=0

shopt -s nullglob
scripts=("$SCRIPT_DIR"/[0-9][0-9]-*.sh)
if [ ${#scripts[@]} -eq 0 ]; then
  summary="no 0X-*.sh scripts found"
else
  for script in "${scripts[@]}"; do
    name=$(basename "$script" .sh)
    log="$SCRIPT_DIR/$name.log"
    echo "[end2end] running $name"
    t0=$(date +%s%3N)
    if bash "$script" >"$log" 2>&1; then
      status="pass"; message="OK"
      passed=$((passed + 1))
    else
      status="fail"
      message=$(tail -3 "$log" 2>/dev/null | tr '\n' ' ' | head -c 300)
      [ -z "$message" ] && message="(no output)"
      failed=$((failed + 1))
    fi
    t1=$(date +%s%3N)
    dur=$((t1 - t0))
    tests_json=$(jq -c \
      --arg name "$name" \
      --arg status "$status" \
      --argjson duration "$dur" \
      --arg message "$message" \
      '. + [{name: $name, status: $status, duration_ms: $duration, message: $message}]' \
      <<< "$tests_json")
  done
  total=$((passed + failed))
  summary="$passed/$total checks passed"
fi

if [ $failed -eq 0 ] && [ ${#scripts[@]} -gt 0 ]; then
  success=true
elif [ ${#scripts[@]} -eq 0 ]; then
  success=true
else
  success=false
fi

jq -n \
  --argjson success "$success" \
  --arg summary "$summary" \
  --argjson tests "$tests_json" \
  --arg preview_url "${PREVIEW_URL:-}" \
  --arg version "${VERSION:-}" \
  '{
    success:  $success,
    summary:  $summary,
    tests:    $tests,
    metadata: { preview_url: $preview_url, version: $version }
  }' > "$results_file"

echo "[end2end] results.json:"
cat "$results_file"

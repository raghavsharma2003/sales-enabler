#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../../../.." && pwd)"
node "$root/dist/readiness.cjs" --config-only
node "$root/dist/private-voice-supervisor.cjs" &
child=$!

stop_child() {
  if kill -0 "$child" 2>/dev/null; then kill -TERM "$child" 2>/dev/null || true; fi
}
trap stop_child TERM INT EXIT

while kill -0 "$child" 2>/dev/null; do
  if [[ -n "${WEBJOBS_SHUTDOWN_FILE:-}" && -f "$WEBJOBS_SHUTDOWN_FILE" ]]; then
    stop_child
    break
  fi
  sleep 1
done
wait "$child"

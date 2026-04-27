#!/usr/bin/env bash
# automation/verify.sh — runs the gating verification suite for one task list.
#
# Reads .verification.required_commands and .verification.phase_specific_checks
# from the given tasks.json. Each command must exit 0; any failure causes the
# script to exit non-zero with the failing command logged.
#
# Usage:
#   ./automation/verify.sh <task-list>
#   ./automation/verify.sh <task-list> --quiet
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TASK_LIST="${1:-}"
QUIET=""
[[ "${2:-}" == "--quiet" ]] && QUIET="1"

[[ -n "$TASK_LIST" ]]    || { echo "usage: $0 <tasks.json>" >&2; exit 64; }
[[ -f "$TASK_LIST" ]]    || { echo "[verify] task list not found: $TASK_LIST" >&2; exit 1; }
command -v jq >/dev/null || { echo "[verify] jq required" >&2; exit 127; }

log() { [[ -z "$QUIET" ]] && printf '[verify] %s\n' "$*"; }

cd "$REPO_ROOT"

# On Windows + Git Bash, npm-installed CLIs live under %APPDATA%\npm but that
# path is not on the bash login PATH by default. Prepend it so `pnpm`, `codex`,
# etc. resolve in the subshells spawned below. cygpath is required because
# bash's PATH lookup needs Unix-style paths (/c/Users/...), not Windows-style.
if [[ -n "${APPDATA:-}" ]] && command -v cygpath >/dev/null 2>&1; then
  npm_global_unix="$(cygpath -u "$APPDATA/npm" 2>/dev/null)"
  if [[ -n "$npm_global_unix" && -d "$npm_global_unix" ]]; then
    case ":$PATH:" in
      *":$npm_global_unix:"*) ;;
      *) PATH="$npm_global_unix:$PATH" ;;
    esac
    export PATH
  fi
fi

# Required commands first; phase-specific second.
mapfile -t REQUIRED < <(jq -r '.verification.required_commands[]'        "$TASK_LIST")
mapfile -t PHASE    < <(jq -r '.verification.phase_specific_checks[]?'   "$TASK_LIST")

run_one() {
  local cmd="$1" label="$2"
  log "$label: $cmd"
  # Use bash -c so multi-token commands and pipes work; capture exit.
  if bash -c "$cmd"; then
    log "$label: PASS"
    return 0
  fi
  log "$label: FAIL"
  return 1
}

failed=0
for c in "${REQUIRED[@]}"; do
  run_one "$c" "required" || failed=$((failed + 1))
done
for c in "${PHASE[@]}"; do
  run_one "$c" "phase-specific" || failed=$((failed + 1))
done

if [[ $failed -gt 0 ]]; then
  log "$failed verification command(s) failed"
  exit 1
fi
log "all verification commands passed"
exit 0

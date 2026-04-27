#!/usr/bin/env bash
# automation/qa-exec-codex.sh — thin shell over `codex exec` for /qa Pass 2.
#
# Per ADR-0014, /qa interactive Pass 2 calls this helper directly instead of
# nesting through the /codex slash command. The substrate ADR-0008 verified
# (read-only sandbox, exact flag set, audit log) is shared with /codex via
# this helper, not via the slash-command layer.
#
# Reads the prompt from stdin (the caller is responsible for substituting
# placeholders in automation/qa-prompt.template.md). Streams Codex's stdout
# to this script's stdout. Logs the invocation to automation/codex-log.jsonl
# in the same shape /codex uses. Exits non-zero on codex failure or missing
# binary; the caller decides what to do.
#
# Usage:
#   < prompt.txt bash automation/qa-exec-codex.sh [--scope <label>]
#
# Flags:
#   --scope <label>   short string written to the audit log entry's "scope"
#                     field. Defaults to "qa-pass-2".
#
# Env:
#   CODEX_BIN         override path to codex binary (otherwise resolved via
#                     automation/qa-lib.sh:resolve_codex_binary).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCOPE="qa-pass-2"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope) SCOPE="$2"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "[qa-exec-codex] unknown flag: $1" >&2; exit 64 ;;
  esac
done

# shellcheck source=./qa-lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/qa-lib.sh"

CODEX="$(resolve_codex_binary || true)"
if [[ -z "$CODEX" ]]; then
  echo "[qa-exec-codex] codex CLI not found on PATH or known npm shim locations" >&2
  echo "[qa-exec-codex] install with 'npm i -g @openai/codex'" >&2
  exit 4
fi

# Stdin holds the prompt; tee through a temp so we can preserve it for the
# log entry without reading from a closing pipe twice.
PROMPT_TMP="$(mktemp)"
CODEX_OUT="$(mktemp)"
CODEX_ERR="$(mktemp)"
trap 'rm -f "$PROMPT_TMP" "$CODEX_OUT" "$CODEX_ERR"' EXIT

cat > "$PROMPT_TMP"

# Sanity: empty stdin is a caller bug.
if [[ ! -s "$PROMPT_TMP" ]]; then
  echo "[qa-exec-codex] empty prompt on stdin; nothing to send to codex" >&2
  exit 65
fi

# Flag set verified by ADR-0008. Identical to the slash command and to
# automation/qa.sh; if either drifts the audit substrate stops being
# consistent.
START_TS=$(date +%s)
set +e
"$CODEX" exec \
  -C "$REPO_ROOT" \
  -s read-only \
  --color never \
  --skip-git-repo-check \
  - < "$PROMPT_TMP" > "$CODEX_OUT" 2> "$CODEX_ERR"
CODEX_RC=$?
set -e
END_TS=$(date +%s)
DURATION_MS=$(( (END_TS - START_TS) * 1000 ))

# Audit log entry per ADR-0008. Same shape /codex writes.
LOG_FILE="${REPO_ROOT}/automation/codex-log.jsonl"
mkdir -p "$(dirname "$LOG_FILE")"
TS_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TASK_PREVIEW="$(head -c 200 "$PROMPT_TMP" | tr -d '\n' | sed 's/"/\\"/g')"
printf '{"ts":"%s","task":"%s","scope":"%s","exit":%d,"duration_ms":%d,"tokens":{"input":null,"output":null}}\n' \
  "$TS_ISO" "$TASK_PREVIEW" "$SCOPE" "$CODEX_RC" "$DURATION_MS" \
  >> "$LOG_FILE"

# Stream codex stdout to our caller. On error, also print the last 30 lines
# of stderr so the caller can debug.
cat "$CODEX_OUT"
if (( CODEX_RC != 0 )); then
  echo "" >&2
  echo "[qa-exec-codex] codex exec failed (rc=${CODEX_RC}); last 30 stderr lines:" >&2
  tail -n 30 "$CODEX_ERR" >&2 || true
  exit "$CODEX_RC"
fi

exit 0

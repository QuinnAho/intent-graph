#!/usr/bin/env bash
# automation/qa.sh — Pass-2-only QA audit for the bash loop.
#
# This is the bash entrypoint of the /qa pattern documented in
# .claude/commands/qa.md and ADR-0013. It exists because the bash loop has no
# Claude session to produce the Pass-1 self-report, so we run the audit in
# Pass-2-only flavor: codex audits the uncommitted diff against the project's
# hard rules and emits the same severity-ranked findings table.
#
# Output: a single Markdown file at automation/qa-reports/qa-report-<UTC>.md.
# Read-only against the rest of the tree — this script never modifies source,
# settings, or ADR files.
#
# Severity → exit code mapping (consumed by ralph.sh):
#   blocker > 0  → exit 2  (mark task blocked; loop continues)
#   major   > 0  → exit 3  (halt loop for human review)
#   minor / nit only → exit 0 (proceed to commit)
#   diff over threshold or codex failure → exit 4 (refused; treat as blocker)
#   clean tree → exit 0 (nothing to audit; not an error)
#
# Usage:
#   ./automation/qa.sh                           # audit current uncommitted state
#   ./automation/qa.sh --max-lines 2000          # raise the diff cutoff
#   ./automation/qa.sh --task-list <tasks.json>  # context for the audit prompt
#   ./automation/qa.sh --task <id> --task-list <tasks.json>
#
# Env:
#   QA_DIFF_LINE_THRESHOLD   default 1000; cli flag overrides
#   CODEX_BIN                override path to codex binary (default: search PATH then npm shim)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_THRESHOLD="${QA_DIFF_LINE_THRESHOLD:-1000}"
THRESHOLD="$DEFAULT_THRESHOLD"
TASK_LIST=""
TASK_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-lines)  THRESHOLD="$2"; shift 2 ;;
    --task-list)  TASK_LIST="$2"; shift 2 ;;
    --task)       TASK_ID="$2"; shift 2 ;;
    -h|--help)    sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "[qa] unknown flag: $1" >&2; exit 64 ;;
  esac
done

# ------------------------------------------------------------ helpers

log()  { printf '[qa] %s\n' "$*"; }
err()  { printf '[qa] ERROR: %s\n' "$*" >&2; }

cd "$REPO_ROOT"

git rev-parse HEAD >/dev/null 2>&1 || { err "not a git repo or HEAD unset"; exit 4; }

# ------------------------------------------------------------ resolve codex binary

resolve_codex() {
  if [[ -n "${CODEX_BIN:-}" && -x "$CODEX_BIN" ]]; then
    echo "$CODEX_BIN"; return 0
  fi
  if command -v codex >/dev/null 2>&1; then
    command -v codex; return 0
  fi
  # Windows npm shim
  if [[ -n "${APPDATA:-}" && -x "$APPDATA/npm/codex.cmd" ]]; then
    echo "$APPDATA/npm/codex.cmd"; return 0
  fi
  # Unix npm-global
  if [[ -x "$HOME/.npm-global/bin/codex" ]]; then
    echo "$HOME/.npm-global/bin/codex"; return 0
  fi
  return 1
}

CODEX="$(resolve_codex || true)"
if [[ -z "$CODEX" ]]; then
  err "codex CLI not found on PATH or known npm shim locations; install with 'npm i -g @openai/codex'"
  exit 4
fi

# ------------------------------------------------------------ clean-tree check

if [[ -z "$(git status --porcelain)" ]]; then
  log "working tree is clean — nothing to audit"
  exit 0
fi

# ------------------------------------------------------------ diff size check

# Sum of additions+deletions across tracked files. Untracked files are added
# whole (counted as additions); use wc -l on each.
TRACKED_LINES="$(git diff HEAD --numstat | awk '{a+=$1+0; d+=$2+0} END{print (a+d)+0}')"
UNTRACKED_LINES=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  [[ -f "$f" ]] || continue
  UNTRACKED_LINES=$((UNTRACKED_LINES + $(wc -l < "$f" 2>/dev/null || echo 0)))
done < <(git ls-files --others --exclude-standard)

DIFF_LINES=$((TRACKED_LINES + UNTRACKED_LINES))

if (( DIFF_LINES > THRESHOLD )); then
  err "diff is ${DIFF_LINES} lines (threshold ${THRESHOLD}). Split into smaller commits and audit each."
  err "to override, re-run with --max-lines <N> after deciding the audit is still meaningful at scale."
  exit 4
fi

log "diff size: ${DIFF_LINES} lines (threshold ${THRESHOLD})"

# ------------------------------------------------------------ assemble payload

REPORTS_DIR="${REPO_ROOT}/automation/qa-reports"
mkdir -p "$REPORTS_DIR"

TS="$(date -u +%Y-%m-%dT%H%M%SZ)"
REPORT_FILE="${REPORTS_DIR}/qa-report-${TS}.md"
PROMPT_FILE="$(mktemp)"
CODEX_OUT="$(mktemp)"
CODEX_ERR="$(mktemp)"
trap 'rm -f "$PROMPT_FILE" "$CODEX_OUT" "$CODEX_ERR"' EXIT

BRANCH="$(git branch --show-current 2>/dev/null || echo '(detached)')"
HEAD_SHORT="$(git rev-parse --short HEAD)"
HEAD_SUBJ="$(git log -1 --format='%s')"

DIFF_RAW="$(git diff HEAD)"
STATUS_RAW="$(git status --porcelain)"
UNTRACKED_BLOCK=""
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  [[ -f "$f" ]] || continue
  UNTRACKED_BLOCK+=$'\n'"+++ NEW: ${f}"$'\n'
  UNTRACKED_BLOCK+="$(sed 's/^/+ /' "$f")"$'\n'
done < <(git ls-files --others --exclude-standard)

TASK_CTX=""
if [[ -n "$TASK_LIST" && -f "$TASK_LIST" && -n "$TASK_ID" ]]; then
  command -v jq >/dev/null && TASK_CTX="$(jq -r --arg id "$TASK_ID" '
    .tasks[] | select(.id==$id) | "Task: \(.id) — \(.title)\nSpec: \(.spec_reference)"
  ' "$TASK_LIST" 2>/dev/null || true)"
fi

# Bound the payload sent to codex. The prompt itself is unlikely to exceed
# Codex's context but the diff might if THRESHOLD is raised. Trim defensively
# at 200_000 chars (well under any frontier-model context window).
MAX_PAYLOAD_CHARS=200000

cat > "$PROMPT_FILE" <<EOF
You are running as Codex in read-only sandbox mode, invoked from the IntentGraph autonomous loop (automation/ralph.sh) as a per-commit QA audit. The bash loop has no parent agent to produce a self-report, so this is a Pass-2-only audit: verify the diff against the project's hard rules independently. You have no stake in the answer.

Project: IntentGraph (TypeScript monorepo, pnpm). Authoritative spec: tech-spec.md.

Hard rules from CLAUDE.md (the contract you are auditing against):
- AgentRunner-only model calls. No file outside packages/skill/src/agent-runner/ may import generateText | streamText | generateObject | streamObject | embed | embedMany from 'ai'.
- No JSON-as-storage. SQLite is the substrate. Markdown under /spec/ and graph.json exports are dumps, never sources.
- Do not lift from claudemap/{contracts/, handlers/, cache layer, enrichment pipeline, JSON storage}. Lifted files must carry a provenance header and an entry in LIFT_LOG.md.
- TypeScript strict everywhere. No 'any', no '// @ts-ignore' without an ADR reference.
- No second graph model. Inngest's task graph IS the IntentGraph task subgraph.
- Specs under /spec/ are contracts: YAML frontmatter required (id, title, parent, confidence per scripts/check-agent-config.ts; richer per-kind fields recommended per ADR-0009).
- Architectural decisions are ADRs under /docs/adr/. Numbered sequentially, immutable after acceptance.
- Never train any IntentGraph component against the monitor LLM's signal (Baker et al. 2503.11926).

${TASK_CTX:+Ralph task context:
${TASK_CTX}

}Branch: ${BRANCH}
HEAD: ${HEAD_SHORT} — ${HEAD_SUBJ}
Diff size: ${DIFF_LINES} lines

Raw diff (git diff HEAD):
<<<DIFF
${DIFF_RAW}
DIFF

Untracked files (added whole, prefixed +++ NEW):
<<<UNTRACKED${UNTRACKED_BLOCK}
UNTRACKED

git status --porcelain:
<<<STATUS
${STATUS_RAW}
STATUS

Required output format:

You MUST answer three questions explicitly, in this order, with this exact structure. Do not collapse them. Do not add a preamble. Do not summarize at the end.

## 1. Self-report fidelity
Skip this section in the bash-loop flavor — there is no parent self-report to compare against. Write exactly: "N/A — Pass-2-only invocation from automation/qa.sh."

## 2. Hard-rule compliance
For each hard rule above, independently verify against the diff. Output: a bullet list per rule. For each, state your verdict (compliant / non-compliant / not applicable / cannot determine from diff alone) with a one-sentence reason and file:line citations from the diff.

## 3. Unrecorded architectural decisions
Are there decisions visible in the diff that should have been ADRs but aren't? A decision is load-bearing if it constrains future code, foundationally shapes a contract, introduces a new dependency, or changes the substrate. Output: a bullet list. For each: what was decided, why it's load-bearing, whether an ADR currently records it.

## Findings table (severity-ranked)

| ID | Severity | Area | Finding | File:line |
|----|----------|------|---------|-----------|
| F-NN | blocker / major / minor / nit | <area> | <one sentence> | <path:line or N/A> |

Severity definitions (use them strictly):
- blocker: hard-rule violation that must be fixed before commit.
- major: real misbehavior or doc rot that will cause problems within one or two phases; load-bearing decision missing an ADR.
- minor: correct today but ages poorly or will mislead the next contributor.
- nit: cosmetic, style, pure documentation polish.

After the table, emit one final line in this exact format (parsed by automation/qa.sh):
COUNT_BLOCKER=<n> COUNT_MAJOR=<n> COUNT_MINOR=<n> COUNT_NIT=<n>
EOF

# Trim if oversized.
if (( $(wc -c < "$PROMPT_FILE") > MAX_PAYLOAD_CHARS )); then
  err "audit payload exceeds ${MAX_PAYLOAD_CHARS} chars; truncating diff in the prompt"
  head -c "$MAX_PAYLOAD_CHARS" "$PROMPT_FILE" > "${PROMPT_FILE}.tmp" \
    && mv "${PROMPT_FILE}.tmp" "$PROMPT_FILE"
  printf '\n\n[qa] PAYLOAD TRUNCATED — diff was too large for the prompt window.\n' >> "$PROMPT_FILE"
fi

# ------------------------------------------------------------ run codex

log "invoking codex (read-only, sandbox=read-only)"
START_TS=$(date +%s)
set +e
"$CODEX" exec \
  -C "$REPO_ROOT" \
  -s read-only \
  --color never \
  --skip-git-repo-check \
  - < "$PROMPT_FILE" > "$CODEX_OUT" 2> "$CODEX_ERR"
CODEX_RC=$?
set -e
END_TS=$(date +%s)
DURATION=$((END_TS - START_TS))

if (( CODEX_RC != 0 )); then
  err "codex exec failed (rc=${CODEX_RC}); see stderr below"
  tail -n 30 "$CODEX_ERR" >&2 || true
  exit 4
fi

# ------------------------------------------------------------ parse counts

COUNTS_LINE="$(grep -E '^COUNT_BLOCKER=[0-9]+ COUNT_MAJOR=[0-9]+ COUNT_MINOR=[0-9]+ COUNT_NIT=[0-9]+' "$CODEX_OUT" | tail -n 1 || true)"
if [[ -z "$COUNTS_LINE" ]]; then
  err "codex output did not include the COUNT_* line in the expected format; treating as audit failure"
  exit 4
fi

eval "$(echo "$COUNTS_LINE" | tr ' ' '\n')"  # sets COUNT_BLOCKER, COUNT_MAJOR, etc.

# ------------------------------------------------------------ write report

cat > "$REPORT_FILE" <<EOF
# QA report — ${TS}

**Branch:** ${BRANCH}
**HEAD:** ${HEAD_SHORT} — ${HEAD_SUBJ}
**Diff size:** ${DIFF_LINES} lines
**Threshold:** ${THRESHOLD}
**Invocation:** automation/qa.sh (Pass-2-only, bash-loop entrypoint)
${TASK_CTX:+**Ralph task:** ${TASK_ID} (see ${TASK_LIST})}
**Codex duration:** ${DURATION}s, exit ${CODEX_RC}

---

## Pass 1 — Claude self-report

N/A — automation/qa.sh runs Pass-2-only because the bash loop has no Claude session to produce a self-report. See .claude/commands/qa.md for the full two-pass flow used by interactive \`/qa\` runs and ADR-0013 for the rationale.

---

## Pass 2 — Codex independent audit

> [codex]:
>
$(sed 's/^/> /' "$CODEX_OUT")

---

## Pass 3 — automated outcome

- Blockers: ${COUNT_BLOCKER}
- Majors: ${COUNT_MAJOR}
- Minors: ${COUNT_MINOR}
- Nits: ${COUNT_NIT}

**Severity → action mapping (applied by ralph.sh):**
- Blockers > 0 → task is marked blocked; loop continues with next task.
- Majors > 0 → loop halts for human review.
- Only minors / nits → loop proceeds to commit.

EOF

log "report: ${REPORT_FILE}"
log "blockers=${COUNT_BLOCKER} majors=${COUNT_MAJOR} minors=${COUNT_MINOR} nits=${COUNT_NIT}"

# ------------------------------------------------------------ exit code

if (( COUNT_BLOCKER > 0 )); then
  exit 2
fi
if (( COUNT_MAJOR > 0 )); then
  exit 3
fi
exit 0

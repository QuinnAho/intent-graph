#!/usr/bin/env bash
# automation/ralph.sh — bash-loop Ralph implementation for IntentGraph.
#
# Each iteration spawns a fresh agent process with a clean context, hands it
# one task plus the spec excerpt and verification commands, and waits for it
# to finish. Per task:
#   1. agent runs (claude or codex, fresh context)
#   2. verify.sh gate (typecheck + lint + test, etc.)
#   3. monitor-llm.sh gate (Pillar 5; required in phases 4 and 6)
#   4. qa.sh gate (ADR-0013; codex audits the diff against project rules)
#   5. commit_task → mark_completed
# Any gate failure marks the task blocked and either halts or continues per
# the gate's severity contract. See ADR-0013 for the qa gate's mapping.
#
# State persists ONLY through git history, the file system, and progress.json.
# No conversation memory crosses iterations. This is non-negotiable.
#
# Usage:
#   ./automation/ralph.sh <task-list>             # start a fresh session
#   ./automation/ralph.sh --resume                # continue from progress.json
#   ./automation/ralph.sh --status                # report state, no execution
#   ./automation/ralph.sh --cancel                # write final report, halt
#
# Flags:
#   --cli {claude|codex}           default: claude
#   --monitor                      force-enable monitor-LLM gate (mandatory in
#                                  phases that declare monitor_llm.required=true)
#   --max-cost <usd>               override per-session cap (capped at $200 hard)
#   --dry-run                      validate everything, spawn nothing
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTOMATION_DIR="${REPO_ROOT}/automation"
SCHEMA_FILE="${AUTOMATION_DIR}/tasks/schema.json"
HARD_COST_CAP_USD=200          # circuit breaker, not a budget
MAX_CONSECUTIVE_FAILURES=3     # deterministically-bad signal
SESSION_DIR="${AUTOMATION_DIR}/sessions"
PROGRESS_FILE="${SESSION_DIR}/progress.json"
LOG_FILE=""                    # set per-session

# ------------------------------------------------------------ logging helpers

log()  { printf '[ralph] %s\n' "$*"; [[ -n "$LOG_FILE" ]] && printf '[ralph] %s\n' "$*" >> "$LOG_FILE"; }
err()  { printf '[ralph] ERROR: %s\n' "$*" >&2; [[ -n "$LOG_FILE" ]] && printf '[ralph] ERROR: %s\n' "$*" >> "$LOG_FILE"; }
fatal() { err "$*"; exit 1; }

# ------------------------------------------------------------ argument parsing

CLI="claude"
TASK_LIST=""
MODE="run"
MONITOR_FLAG=""
MAX_COST_OVERRIDE=""
DRY_RUN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cli)         CLI="$2"; shift 2 ;;
    --monitor)     MONITOR_FLAG="forced"; shift ;;
    --max-cost)    MAX_COST_OVERRIDE="$2"; shift 2 ;;
    --dry-run)     DRY_RUN="1"; shift ;;
    --resume)      MODE="resume"; shift ;;
    --status)      MODE="status"; shift ;;
    --cancel)      MODE="cancel"; shift ;;
    -h|--help)     sed -n '2,22p' "$0"; exit 0 ;;
    -*)            fatal "unknown flag: $1" ;;
    *)             TASK_LIST="$1"; shift ;;
  esac
done

if [[ "$CLI" != "claude" && "$CLI" != "codex" ]]; then
  fatal "--cli must be 'claude' or 'codex' (got: $CLI)"
fi

# ------------------------------------------------------------ jq dependency

require_jq() {
  command -v jq >/dev/null 2>&1 || fatal "jq is required (apt: jq, brew: jq)"
}

# ------------------------------------------------------------ schema validation

validate_task_list() {
  local file="$1"
  [[ -f "$file" ]] || fatal "task list not found: $file"
  [[ -f "$SCHEMA_FILE" ]] || fatal "schema not found: $SCHEMA_FILE"

  # Lightweight validation: jq required keys + status enum. A stricter
  # JSON Schema validator (ajv-cli) is preferred when available; fall back
  # to the jq path so the script works in CI without npx.
  # ajv-cli@5 needs --spec=draft2020 to load the meta-schema declared by
  # tasks/schema.json ("$schema": "https://json-schema.org/draft/2020-12/schema").
  # Without it ajv errors with: 'no schema with key or ref ...'.
  if command -v ajv >/dev/null 2>&1; then
    ajv validate --spec=draft2020 -s "$SCHEMA_FILE" -d "$file" --strict=false \
      || fatal "task list failed JSON Schema validation"
  elif command -v npx >/dev/null 2>&1; then
    npx --yes -p ajv-cli@5 ajv validate --spec=draft2020 -s "$SCHEMA_FILE" -d "$file" --strict=false \
      || fatal "task list failed JSON Schema validation (ajv-cli via npx)"
  else
    log "WARN: no ajv-cli found; running degraded jq-only validation"
    jq -e '.phase and .status and .autonomy_level and .max_iterations_per_task and .max_total_cost_usd and .verification.required_commands and (.tasks | length >= 1)' "$file" >/dev/null \
      || fatal "task list failed minimal jq validation"
  fi
}

# ------------------------------------------------------------ workspace safety

assert_clean_unrelated_tree() {
  cd "$REPO_ROOT"
  # Loop output lives in commits and in automation/sessions/. Anything ELSE
  # uncommitted indicates the human has work in flight; refuse to overlap.
  local dirty
  dirty="$(git status --porcelain | grep -v -E '^\?\? automation/sessions/|^M  automation/sessions/' || true)"
  if [[ -n "$dirty" ]]; then
    err "working tree has uncommitted changes outside automation/sessions/:"
    echo "$dirty" | sed 's/^/    /' >&2
    fatal "commit, stash, or revert before starting a loop"
  fi
}

# ------------------------------------------------------------ hard rules

assert_hard_rules() {
  # Banned commands the loop must never run, even if a task asks.
  # Implemented as PROMPT_HEADER guidance + (where possible) shell-level guards.
  cat <<'EOF' > "${SESSION_DIR}/HARD_RULES.txt"
HARD RULES enforced by ralph.sh — the agent must never invoke any of:
  - git push (any remote)
  - git push --force / -f
  - npm publish, pnpm publish, yarn publish
  - any command writing outside the workspace root
  - any command modifying .env, .env.*, **/secrets/**
  - any command touching .git/config, .git/hooks/, or rewriting history
The agent must also never feed monitor-LLM verdicts back into a model as training data
or as part of any prompt asking the model to align with the monitor.
EOF
}

# ------------------------------------------------------------ session bootstrap

bootstrap_session() {
  local task_list="$1"
  mkdir -p "$SESSION_DIR"
  LOG_FILE="${SESSION_DIR}/loop-$(date -u +%Y%m%dT%H%M%SZ).log"
  touch "$LOG_FILE"
  assert_hard_rules

  local phase
  phase="$(jq -r '.phase' "$task_list")"
  local status
  status="$(jq -r '.status' "$task_list")"
  local autonomy
  autonomy="$(jq -r '.autonomy_level' "$task_list")"
  local cap
  cap="$(jq -r '.max_total_cost_usd' "$task_list")"

  # Refuse-to-run gates
  case "$status" in
    approved|executing) ;;
    draft-needs-human-approval) fatal "task list is draft; see automation/tasks/APPROVAL.md" ;;
    blocked-on-decision)        fatal "task list is blocked on a decision; resolve and reapprove" ;;
    completed|aborted)          fatal "task list is in terminal state: $status" ;;
    *) fatal "unknown task list status: $status" ;;
  esac
  if [[ "$autonomy" == "low" ]]; then
    fatal "autonomy_level=low — phase requires per-task explicit human approval; ralph.sh refuses"
  fi

  # Respect the hard cap
  if [[ -n "$MAX_COST_OVERRIDE" ]]; then
    awk -v a="$MAX_COST_OVERRIDE" -v b="$HARD_COST_CAP_USD" 'BEGIN { exit !(a+0 > b+0) }' \
      && fatal "--max-cost ($MAX_COST_OVERRIDE) exceeds hard cap (\$${HARD_COST_CAP_USD})"
    cap="$MAX_COST_OVERRIDE"
  fi
  awk -v a="$cap" -v b="$HARD_COST_CAP_USD" 'BEGIN { exit !(a+0 > b+0) }' \
    && fatal "task list max_total_cost_usd ($cap) exceeds hard cap (\$${HARD_COST_CAP_USD})"

  jq -n \
    --arg phase "$phase" \
    --arg list "$task_list" \
    --arg cli "$CLI" \
    --arg started "$(date -u +%FT%TZ)" \
    --argjson cap "$cap" \
    '{
      phase: $phase,
      task_list: $list,
      cli: $cli,
      started_at: $started,
      max_total_cost_usd: $cap,
      cost_so_far_usd: 0,
      consecutive_failures: 0,
      completed: [],
      blocked: [],
      in_flight: null
    }' > "$PROGRESS_FILE"

  log "session bootstrapped: phase=$phase cli=$CLI cap=\$$cap"
  log "log file: $LOG_FILE"
}

# ------------------------------------------------------------ task selection

next_task() {
  local task_list="$1"
  jq -r --slurpfile p "$PROGRESS_FILE" '
    . as $list
    | $list.tasks
    | map(select(
        (.id as $id | $p[0].completed | index($id) | not)
        and (.id as $id | $p[0].blocked | index($id) | not)
        and (.blocked_on_decision == null)
        and (.depends_on | all(. as $d | $p[0].completed | index($d)))
      ))
    | (.[0].id // "")
  ' "$task_list"
}

task_field() {
  local task_list="$1" id="$2" field="$3"
  jq -r --arg id "$id" --arg field "$field" '
    .tasks[] | select(.id == $id) | .[$field] // empty
  ' "$task_list"
}

# ------------------------------------------------------------ approvals.json

approval_satisfied() {
  local task_list_dir="$1" task_id="$2"
  local approvals_file="${task_list_dir}/approvals.json"
  [[ -f "$approvals_file" ]] || return 1
  jq -e --arg id "$task_id" '.approved[]? | select(. == $id)' "$approvals_file" >/dev/null
}

# ------------------------------------------------------------ agent invocation

run_agent_for_task() {
  local task_list="$1" id="$2"
  local title spec_ref signal max_iters scope_files
  title="$(task_field "$task_list" "$id" title)"
  spec_ref="$(task_field "$task_list" "$id" spec_reference)"
  signal="$(task_field "$task_list" "$id" completion_signal)"
  max_iters="$(jq -r '.max_iterations_per_task' "$task_list")"
  scope_files="$(jq -r --arg id "$id" '.tasks[] | select(.id==$id) | .scope_files | join(", ")' "$task_list")"

  local prompt_file="${SESSION_DIR}/prompt-${id}.txt"
  cat > "$prompt_file" <<EOF
You are an IntentGraph implementation agent operating inside automation/ralph.sh.
This is a FRESH CONTEXT iteration. You have no memory of prior tasks. State
persists only through git history, the file system, and automation/sessions/progress.json.

# Task ${id}
${title}

# Spec reference
${spec_ref}

# Files in scope (do not touch others without explicit justification)
${scope_files}

# Completion signal
When and only when the task is fully done, with verification passing, emit the literal token:

    ${signal}

on its own line in your final response. Do not emit it speculatively. Do not invent a different token.

# Verification (will run automatically after you exit)
$(jq -r '.verification.required_commands[]' "$task_list" | sed 's/^/    /')
$(jq -r '.verification.phase_specific_checks[]?' "$task_list" | sed 's/^/    /')

# Hard rules
$(cat "${SESSION_DIR}/HARD_RULES.txt")

# Maximum iterations inside this single task
${max_iters}

# Turn-budget guidance (turns are scarce; do not exhaust them)
- Each tool call is one turn. The cap above is a hard wall — if you hit it you
  fail this task and the loop blocks on you.
- Read only what you actually need. tech-spec.md and CLAUDE.md are large; if a
  scoped audit (e.g. comparing a list of pins to package.json files) does not
  require the full tech-spec, do NOT read it cover-to-cover.
- If the task is read-only / an audit and the audit conclusion is "everything
  already matches, no changes needed," emit the completion signal IMMEDIATELY
  in your next response. Do not write a report file unless the task notes
  explicitly require one. Do not "double-check by re-reading."
- Batch related reads in parallel tool calls when possible; do not serialize
  Reads that have no dependency on each other.

Read the spec_reference above and the in-scope files. Only read tech-spec.md
or CLAUDE.md if the spec_reference points at them or if the in-scope files are
ambiguous without that context.
EOF

  log "agent prompt: $prompt_file"
  log "spawning fresh ${CLI} for task ${id}"

  if [[ -n "$DRY_RUN" ]]; then
    log "[dry-run] would spawn: ${CLI} -p \"\$(cat $prompt_file)\""
    return 0
  fi

  # The agent CLI invocation deliberately uses --print / non-interactive mode.
  # Fresh process per task = fresh context.
  # Each attempt's output is preserved with a UTC timestamp so retries do not
  # erase diagnostic evidence; output-${id}.txt is also kept as the latest copy
  # for downstream gates that look for a stable filename.
  local attempt_ts
  attempt_ts="$(date -u +%Y%m%dT%H%M%SZ)"
  local agent_output_file="${SESSION_DIR}/output-${id}-${attempt_ts}.txt"
  local agent_output_latest="${SESSION_DIR}/output-${id}.txt"
  local agent_exit=0
  case "$CLI" in
    claude)
      claude --print --max-turns "$max_iters" < "$prompt_file" > "$agent_output_file" 2>&1 \
        || agent_exit=$?
      ;;
    codex)
      codex exec - < "$prompt_file" > "$agent_output_file" 2>&1 \
        || agent_exit=$?
      ;;
  esac
  cp -f "$agent_output_file" "$agent_output_latest" 2>/dev/null || true

  if grep -qF "$signal" "$agent_output_file"; then
    log "task ${id}: completion signal present (attempt ${attempt_ts})"
    return 0
  fi
  log "task ${id}: completion signal NOT present (agent exit=${agent_exit}, attempt ${attempt_ts})"
  return 1
}

# ------------------------------------------------------------ verification gate

run_verification_gate() {
  local task_list="$1" id="$2"
  local gate_log="${SESSION_DIR}/verify-${id}.log"
  if [[ -n "$DRY_RUN" ]]; then
    log "[dry-run] would run verification gate"
    return 0
  fi
  bash "${AUTOMATION_DIR}/verify.sh" "$task_list" > "$gate_log" 2>&1
  local rc=$?
  if [[ $rc -eq 0 ]]; then
    log "verify.sh: PASS for task ${id}"
  else
    err "verify.sh: FAIL for task ${id} (rc=$rc); see $gate_log"
  fi
  return $rc
}

# ------------------------------------------------------------ monitor LLM gate

run_monitor_gate() {
  local task_list="$1" id="$2"
  local required forced_on
  required="$(jq -r '.monitor_llm.required // false' "$task_list")"
  [[ "$MONITOR_FLAG" == "forced" ]] && forced_on="1" || forced_on=""
  if [[ "$required" != "true" && -z "$forced_on" ]]; then
    log "monitor LLM gate: skipped (not required, not forced)"
    return 0
  fi
  if [[ -n "$DRY_RUN" ]]; then
    log "[dry-run] would call monitor-llm.sh"
    return 0
  fi
  local verdict_file="${SESSION_DIR}/monitor-${id}.json"
  bash "${AUTOMATION_DIR}/monitor-llm.sh" --task "$id" --task-list "$task_list" > "$verdict_file" 2>&1
  local action
  action="$(jq -r '.recommended_action // "allow"' "$verdict_file" 2>/dev/null || echo "allow")"
  case "$action" in
    allow) log "monitor verdict: allow"; return 0 ;;
    require_human_review)
      err "monitor verdict: require_human_review — halting loop"
      jq . "$verdict_file" >&2 || cat "$verdict_file" >&2
      return 2
      ;;
    block)
      err "monitor verdict: block — halting loop"
      jq . "$verdict_file" >&2 || cat "$verdict_file" >&2
      return 2
      ;;
    *) err "monitor verdict unrecognized: $action"; return 2 ;;
  esac
}

# ------------------------------------------------------------ qa audit gate
#
# After verify+monitor pass, run automation/qa.sh against the uncommitted diff
# for this task. The gate's whole purpose is to catch the failure mode where
# the agent thinks it followed the rules but didn't. See ADR-0013.
#
# qa.sh exit codes:
#   0  — clean OR only minors/nits → proceed to commit
#   2  — blockers > 0 → mark task blocked, continue with next task
#   3  — majors > 0 → halt loop for human review (return rc=2 so the caller
#                     halts the way it does for monitor 'require_human_review')
#   4  — qa.sh refused (codex unavailable, diff over threshold, parse failure)
#        → mark task blocked; do not commit

run_qa_gate() {
  local task_list="$1" id="$2"
  if [[ -n "$DRY_RUN" ]]; then
    log "[dry-run] would run qa gate"
    return 0
  fi
  local gate_log="${SESSION_DIR}/qa-${id}.log"
  bash "${AUTOMATION_DIR}/qa.sh" --task "$id" --task-list "$task_list" \
    > "$gate_log" 2>&1
  local rc=$?
  case $rc in
    0) log "qa gate: clean or only minors/nits"; return 0 ;;
    2) err "qa gate: blockers found for task ${id}; see $gate_log"; return 1 ;;
    3) err "qa gate: majors found for task ${id} — halting loop"; return 2 ;;
    4) err "qa gate: refused (codex unavailable, oversize diff, or parse failure); see $gate_log"; return 1 ;;
    *) err "qa gate: unexpected rc=$rc; see $gate_log"; return 2 ;;
  esac
}

# ------------------------------------------------------------ commit on success

commit_task() {
  local task_list="$1" id="$2"
  local title spec_ref
  title="$(task_field "$task_list" "$id" title)"
  spec_ref="$(task_field "$task_list" "$id" spec_reference)"
  local verify_log="${SESSION_DIR}/verify-${id}.log"
  cd "$REPO_ROOT"

  # Stage everything except the session dir (which is loop-internal state).
  git add -A -- ':(exclude)automation/sessions'
  if git diff --cached --quiet; then
    log "task ${id}: no changes to commit"
    return 0
  fi

  local msg_file="${SESSION_DIR}/commit-${id}.txt"
  cat > "$msg_file" <<EOF
ralph(${id}): ${title}

Spec: ${spec_ref}
Phase: $(jq -r '.phase' "$task_list")
Iteration log: automation/sessions/loop-*.log

Verification:
$(tail -n 20 "$verify_log" 2>/dev/null | sed 's/^/    /')
EOF
  git commit -F "$msg_file"
}

# ------------------------------------------------------------ progress writers

mark_completed() {
  local id="$1"
  jq --arg id "$id" '
    .completed += [$id]
    | .in_flight = null
    | .consecutive_failures = 0
  ' "$PROGRESS_FILE" > "${PROGRESS_FILE}.tmp" && mv "${PROGRESS_FILE}.tmp" "$PROGRESS_FILE"
}

mark_blocked() {
  local id="$1" reason="$2"
  jq --arg id "$id" --arg reason "$reason" '
    .blocked += [{id: $id, reason: $reason, at: now | strftime("%FT%TZ")}]
    | .in_flight = null
    | .consecutive_failures += 1
  ' "$PROGRESS_FILE" > "${PROGRESS_FILE}.tmp" && mv "${PROGRESS_FILE}.tmp" "$PROGRESS_FILE"
}

set_in_flight() {
  local id="$1"
  jq --arg id "$id" '.in_flight = $id' "$PROGRESS_FILE" \
    > "${PROGRESS_FILE}.tmp" && mv "${PROGRESS_FILE}.tmp" "$PROGRESS_FILE"
}

# ------------------------------------------------------------ main loop

run_loop() {
  local task_list="$1"
  local task_list_dir
  task_list_dir="$(dirname "$task_list")"
  local cap consecutive
  cap="$(jq -r '.max_total_cost_usd' "$PROGRESS_FILE")"

  while :; do
    local id
    id="$(next_task "$task_list")"
    if [[ -z "$id" ]]; then
      log "no eligible task remaining; loop complete"
      return 0
    fi

    # Cost cap check
    local spent
    spent="$(jq -r '.cost_so_far_usd' "$PROGRESS_FILE")"
    if awk -v a="$spent" -v b="$cap" 'BEGIN { exit !(a+0 >= b+0) }'; then
      err "cost cap reached (\$${spent} >= \$${cap}); aborting cleanly"
      return 3
    fi

    # human_checkpoint gate
    local hc
    hc="$(task_field "$task_list" "$id" human_checkpoint)"
    if [[ "$hc" == "true" ]]; then
      if ! approval_satisfied "$task_list_dir" "$id"; then
        log "task ${id}: human_checkpoint=true and no approval found; skipping"
        mark_blocked "$id" "human_checkpoint requires approvals.json entry"
        consecutive="$(jq -r '.consecutive_failures' "$PROGRESS_FILE")"
        [[ "$consecutive" -ge "$MAX_CONSECUTIVE_FAILURES" ]] \
          && { err "$MAX_CONSECUTIVE_FAILURES consecutive failures; aborting"; return 4; }
        continue
      fi
    fi

    set_in_flight "$id"
    log "task ${id}: starting"

    if ! run_agent_for_task "$task_list" "$id"; then
      mark_blocked "$id" "agent did not emit completion signal"
      consecutive="$(jq -r '.consecutive_failures' "$PROGRESS_FILE")"
      [[ "$consecutive" -ge "$MAX_CONSECUTIVE_FAILURES" ]] \
        && { err "$MAX_CONSECUTIVE_FAILURES consecutive failures; aborting"; return 4; }
      continue
    fi

    if ! run_verification_gate "$task_list" "$id"; then
      mark_blocked "$id" "verification gate failed"
      consecutive="$(jq -r '.consecutive_failures' "$PROGRESS_FILE")"
      [[ "$consecutive" -ge "$MAX_CONSECUTIVE_FAILURES" ]] \
        && { err "$MAX_CONSECUTIVE_FAILURES consecutive failures; aborting"; return 4; }
      continue
    fi

    local mrc=0
    run_monitor_gate "$task_list" "$id" || mrc=$?
    if [[ $mrc -eq 2 ]]; then
      mark_blocked "$id" "monitor LLM verdict: halt"
      return 5
    elif [[ $mrc -ne 0 ]]; then
      mark_blocked "$id" "monitor gate error rc=$mrc"
      consecutive="$(jq -r '.consecutive_failures' "$PROGRESS_FILE")"
      [[ "$consecutive" -ge "$MAX_CONSECUTIVE_FAILURES" ]] \
        && { err "$MAX_CONSECUTIVE_FAILURES consecutive failures; aborting"; return 4; }
      continue
    fi

    # qa audit gate (ADR-0013) — runs after monitor, before commit.
    local qrc=0
    run_qa_gate "$task_list" "$id" || qrc=$?
    if [[ $qrc -eq 2 ]]; then
      mark_blocked "$id" "qa gate: majors found — halting loop for human review"
      return 6
    elif [[ $qrc -ne 0 ]]; then
      mark_blocked "$id" "qa gate: blockers found or audit refused"
      consecutive="$(jq -r '.consecutive_failures' "$PROGRESS_FILE")"
      [[ "$consecutive" -ge "$MAX_CONSECUTIVE_FAILURES" ]] \
        && { err "$MAX_CONSECUTIVE_FAILURES consecutive failures; aborting"; return 4; }
      continue
    fi

    if ! commit_task "$task_list" "$id"; then
      mark_blocked "$id" "git commit failed"
      consecutive="$(jq -r '.consecutive_failures' "$PROGRESS_FILE")"
      [[ "$consecutive" -ge "$MAX_CONSECUTIVE_FAILURES" ]] \
        && { err "$MAX_CONSECUTIVE_FAILURES consecutive failures; aborting"; return 4; }
      continue
    fi

    mark_completed "$id"
    log "task ${id}: done"
  done
}

# ------------------------------------------------------------ status / cancel

cmd_status() {
  [[ -f "$PROGRESS_FILE" ]] || fatal "no active session (no progress.json)"
  jq . "$PROGRESS_FILE"
}

cmd_cancel() {
  [[ -f "$PROGRESS_FILE" ]] || fatal "no active session to cancel"
  jq '. + {cancelled_at: (now | strftime("%FT%TZ"))}' "$PROGRESS_FILE" \
    > "${PROGRESS_FILE}.tmp" && mv "${PROGRESS_FILE}.tmp" "$PROGRESS_FILE"
  log "session marked cancelled; final report at $PROGRESS_FILE"
}

# ------------------------------------------------------------ entry

require_jq

case "$MODE" in
  status) cmd_status; exit 0 ;;
  cancel) cmd_cancel; exit 0 ;;
  resume)
    [[ -f "$PROGRESS_FILE" ]] || fatal "no progress.json to resume from"
    TASK_LIST="$(jq -r '.task_list' "$PROGRESS_FILE")"
    LOG_FILE="${SESSION_DIR}/loop-resume-$(date -u +%Y%m%dT%H%M%SZ).log"
    touch "$LOG_FILE"
    log "resuming session against $TASK_LIST"
    validate_task_list "$TASK_LIST"
    assert_clean_unrelated_tree
    run_loop "$TASK_LIST"
    ;;
  run)
    [[ -n "$TASK_LIST" ]] || fatal "task list path required"
    validate_task_list "$TASK_LIST"
    assert_clean_unrelated_tree
    bootstrap_session "$TASK_LIST"
    run_loop "$TASK_LIST"
    ;;
esac

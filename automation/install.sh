#!/usr/bin/env bash
# automation/install.sh — installs cc-sdd skills for both Claude Code and Codex.
#
# Idempotent: re-running detects already-installed skills and skips network installs
# unless --force is passed. Use --check to verify a previous install without running
# any network calls.
#
# Usage:
#   ./automation/install.sh           # full install (one-shot, idempotent)
#   ./automation/install.sh --check   # verify skills are present; no network calls
#   ./automation/install.sh --force   # reinstall even if skills appear present

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_SKILLS_DIR="${REPO_ROOT}/.claude/skills"
CODEX_SKILLS_DIR="${REPO_ROOT}/.codex/skills"

# The kiro skills cc-sdd installs. If any are missing, install is incomplete.
KIRO_SKILLS=(
  "kiro-discovery"
  "kiro-spec-init"
  "kiro-spec-requirements"
  "kiro-spec-design"
  "kiro-spec-tasks"
  "kiro-impl"
  "kiro-steering"
  "kiro-validate-gap"
  "kiro-spec-batch"
)

MODE="install"
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    --force) MODE="force" ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "unknown flag: $arg" >&2
      exit 64
      ;;
  esac
done

log() { printf '[install] %s\n' "$*"; }
err() { printf '[install] ERROR: %s\n' "$*" >&2; }

verify_skills() {
  local target_dir="$1"
  local label="$2"
  local missing=0
  if [[ ! -d "$target_dir" ]]; then
    err "$label skills dir not found: $target_dir"
    return 1
  fi
  for skill in "${KIRO_SKILLS[@]}"; do
    if [[ ! -d "$target_dir/$skill" && ! -f "$target_dir/$skill.md" ]]; then
      err "$label missing skill: $skill"
      missing=$((missing + 1))
    fi
  done
  if [[ $missing -gt 0 ]]; then
    err "$label: $missing skill(s) missing under $target_dir"
    return 1
  fi
  log "$label: all ${#KIRO_SKILLS[@]} kiro skills present under $target_dir"
  return 0
}

run_install() {
  local flag="$1"   # --claude-skills | --codex-skills
  local label="$2"
  log "running: npx cc-sdd@latest $flag"
  if ! npx --yes cc-sdd@latest "$flag"; then
    err "$label install failed"
    return 1
  fi
  log "$label install completed"
}

case "$MODE" in
  check)
    log "verify-only mode (no network)"
    fail=0
    verify_skills "$CLAUDE_SKILLS_DIR" "claude" || fail=1
    verify_skills "$CODEX_SKILLS_DIR" "codex" || fail=1
    if [[ $fail -ne 0 ]]; then
      err "verification failed; run without --check to install"
      exit 1
    fi
    log "verification passed"
    exit 0
    ;;
  install|force)
    if [[ "$MODE" == "install" ]]; then
      claude_ok=0
      codex_ok=0
      verify_skills "$CLAUDE_SKILLS_DIR" "claude" >/dev/null 2>&1 && claude_ok=1
      verify_skills "$CODEX_SKILLS_DIR" "codex" >/dev/null 2>&1 && codex_ok=1
      if [[ $claude_ok -eq 1 && $codex_ok -eq 1 ]]; then
        log "skills already present for claude and codex; nothing to do"
        log "use --force to reinstall, or --check to re-verify"
        exit 0
      fi
    fi

    if ! command -v npx >/dev/null 2>&1; then
      err "npx not found in PATH; install Node.js (>=20.11.0) and pnpm/npm first"
      exit 127
    fi

    failures=0
    run_install --claude-skills "claude" || failures=$((failures + 1))
    run_install --codex-skills  "codex"  || failures=$((failures + 1))
    if [[ $failures -gt 0 ]]; then
      err "one or more installs failed; refusing to proceed"
      exit 1
    fi

    log "post-install verification"
    fail=0
    verify_skills "$CLAUDE_SKILLS_DIR" "claude" || fail=1
    verify_skills "$CODEX_SKILLS_DIR" "codex" || fail=1
    if [[ $fail -ne 0 ]]; then
      err "post-install verification failed; investigate before running ralph.sh"
      exit 1
    fi
    log "install + verification complete"
    exit 0
    ;;
esac

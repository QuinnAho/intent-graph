#!/usr/bin/env bash
# automation/qa-lib.sh — shared helpers for /qa surfaces.
#
# Sourced by automation/qa.sh; the interactive /qa command body points
# contributors at this file too. Functions are side-effect-free unless the
# name says otherwise.
#
# Source pattern:
#   source "$(dirname "${BASH_SOURCE[0]}")/qa-lib.sh"
#
# Functions exposed:
#   resolve_codex_binary           prints absolute path to codex; returns 1 if not found
#   compute_diff_size <root>       prints (additions+deletions on tracked) + (wc -l on untracked)
#   extract_qa_counts <file>       prints "<b> <maj> <min> <nit>"; returns 1 if no count line

# ------------------------------------------------------------ codex resolver
# Source-of-truth for finding the codex binary. ADR-0008 verified the flag
# set; this function only finds the executable. Order of search:
#   1. $CODEX_BIN (explicit override)
#   2. PATH
#   3. Windows npm shim ($APPDATA\npm\codex.cmd)
#   4. Unix npm-global ($HOME/.npm-global/bin/codex)

resolve_codex_binary() {
  if [[ -n "${CODEX_BIN:-}" && -x "$CODEX_BIN" ]]; then
    printf '%s\n' "$CODEX_BIN"
    return 0
  fi
  if command -v codex >/dev/null 2>&1; then
    command -v codex
    return 0
  fi
  # Windows .cmd shims: MSYS bash reports them as not-executable even when
  # they run correctly via Windows ShellExecute, so check -f instead of -x.
  if [[ -n "${APPDATA:-}" && -f "$APPDATA/npm/codex.cmd" ]]; then
    printf '%s\n' "$APPDATA/npm/codex.cmd"
    return 0
  fi
  if [[ -x "$HOME/.npm-global/bin/codex" ]]; then
    printf '%s\n' "$HOME/.npm-global/bin/codex"
    return 0
  fi
  return 1
}

# ------------------------------------------------------------ diff size
# Sum of additions+deletions across tracked files plus wc -l of each untracked
# file. Caller passes the repo root so the function is testable from anywhere.

compute_diff_size() {
  local root="${1:-.}"
  local tracked untracked f total
  tracked="$(git -C "$root" diff HEAD --numstat | awk '{a+=$1+0; d+=$2+0} END{print (a+d)+0}')"
  untracked=0
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    [[ -f "$root/$f" ]] || continue
    untracked=$((untracked + $(wc -l < "$root/$f" 2>/dev/null || echo 0)))
  done < <(git -C "$root" ls-files --others --exclude-standard)
  total=$((tracked + untracked))
  printf '%d\n' "$total"
}

# ------------------------------------------------------------ count parser
# Codex sometimes emits the COUNT_* trailer twice (the structured reply, then
# a tail re-emit). Take the last match; print four space-separated integers;
# return 1 if no line matches.

extract_qa_counts() {
  local file="$1"
  local line
  line="$(grep -E '^COUNT_BLOCKER=[0-9]+ COUNT_MAJOR=[0-9]+ COUNT_MINOR=[0-9]+ COUNT_NIT=[0-9]+' "$file" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi
  local b maj min n
  b="${line#COUNT_BLOCKER=}";   b="${b%% *}"
  maj="${line#*COUNT_MAJOR=}";  maj="${maj%% *}"
  min="${line#*COUNT_MINOR=}";  min="${min%% *}"
  n="${line#*COUNT_NIT=}";      n="${n%% *}"
  printf '%d %d %d %d\n' "$b" "$maj" "$min" "$n"
}

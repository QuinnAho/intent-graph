#!/usr/bin/env bash
# automation/hooks/guard-eslint-config.sh — PreToolUse hook.
#
# Refuses Edit/Write against eslint.config.mjs (and its base/overrides) unless
# the surrounding change context references an ADR (e.g. "ADR-0014" or
# "docs/adr/0014-..."). The intent: the AgentRunner-only chokepoint and the
# other lint rules in eslint.config.mjs are load-bearing for ADR-0005's
# "faithfulness via architecture" claim. Relaxing them is an ADR-level
# decision, not a lint fix.
#
# Hook input: Claude Code passes a JSON payload on stdin describing the
# pending tool call. We read the file_path from `tool_input.file_path` and the
# new content from `tool_input.new_string` (Edit) or `tool_input.content`
# (Write). If the file is an ESLint config and no ADR reference appears in
# the surrounding session context (passed via the optional CLAUDE_HOOK_CONTEXT
# env var, populated by Claude Code at PreToolUse time), we exit non-zero with
# a message; the harness blocks the tool call.
#
# Exit codes:
#   0  — allow the tool call
#   2  — block (Claude Code surfaces stderr to the agent so it can adjust)
set -euo pipefail

PAYLOAD="$(cat)"

file_path="$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.file_path // .tool_input.path // empty')"
[[ -z "$file_path" ]] && exit 0

case "$file_path" in
  *eslint.config.mjs|*eslint.config.cjs|*eslint.config.js|*.eslintrc*|*eslint-rules/*) ;;
  *) exit 0 ;;
esac

# ADR reference can appear in the new content, the user prompt context, or an
# explicit override env var set by a maintainer.
context="$(printf '%s' "$PAYLOAD" | jq -r '[.tool_input.new_string, .tool_input.content, .tool_input.old_string] | map(select(. != null)) | join("\n")')"
context="${context}
${CLAUDE_HOOK_CONTEXT:-}"

if printf '%s' "$context" | grep -Eq 'ADR[- ]?[0-9]{4}|docs/adr/[0-9]{4}-'; then
  exit 0
fi

cat >&2 <<'MSG'
[guard-eslint-config] BLOCKED: edits to eslint.config.* require an ADR reference.

The lint rules in eslint.config.mjs (notably intentgraph/agent-runner-only) are
load-bearing for ADR-0005's "faithfulness via architecture" guarantee. Relaxing
them is an architectural decision, not a lint fix.

To proceed:
  1. Open the relevant ADR (or draft a new one via /intentgraph-adr).
  2. Reference it by number (e.g. "ADR-0014") in the edit's diff or commit message.
  3. Re-attempt the edit.

If the change is a typo or comment fix that does not relax any rule, include
the ADR number of the rule's owning decision in a comment in the diff.
MSG
exit 2

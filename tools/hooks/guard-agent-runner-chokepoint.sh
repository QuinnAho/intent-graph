#!/usr/bin/env bash
# automation/hooks/guard-agent-runner-chokepoint.sh — PreToolUse hook.
#
# Refuses Edit/Write that introduces an import from the `ai` SDK
# (generateText, streamText, generateObject, streamObject, embed, embedMany)
# into any file outside packages/skill/src/agent-runner/. This is the
# AgentRunner-only chokepoint from ADR-0005, currently enforced at lint time
# by eslint.config.mjs's intentgraph/agent-runner-only rule. The hook moves
# the same check earlier — into the tool-call gate — so the failing diff is
# never written in the first place.
#
# The hook only blocks when the new content adds an import that wasn't already
# there. Editing a file that already imports from `ai` (e.g. inside
# agent-runner/) is fine. Removing such an import is fine.
#
# Exit codes:
#   0  — allow
#   2  — block, with stderr surfaced to the agent
set -euo pipefail

PAYLOAD="$(cat)"

file_path="$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.file_path // .tool_input.path // empty')"
[[ -z "$file_path" ]] && exit 0

# Allow anything inside the AgentRunner package itself.
case "$file_path" in
  *packages/skill/src/agent-runner/*) exit 0 ;;
esac

# Only TypeScript / JavaScript files can carry an `ai` import.
case "$file_path" in
  *.ts|*.tsx|*.mts|*.cts|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac

new_content="$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.new_string // .tool_input.content // empty')"
[[ -z "$new_content" ]] && exit 0

# Match ESM and CJS forms importing the forbidden symbols from the `ai` package.
# Forbidden symbols are the model-call entrypoints listed in ADR-0005.
forbidden='generateText|streamText|generateObject|streamObject|embed|embedMany'

if printf '%s' "$new_content" | grep -Eq "from[[:space:]]+['\"]ai['\"]"; then
  if printf '%s' "$new_content" | grep -Eq "(${forbidden})" ; then
    cat >&2 <<MSG
[guard-agent-runner-chokepoint] BLOCKED: $file_path is outside packages/skill/src/agent-runner/ but the pending edit imports model-call entrypoints from \`ai\`.

ADR-0005 requires every model call to traverse AgentRunner so a trace_event
row is recorded. The eslint rule intentgraph/agent-runner-only enforces this
at lint time; this hook enforces it before the file is written.

To proceed, route the call through packages/skill/src/agent-runner/ and import
the AgentRunner wrapper from there. If you genuinely need to add a new
chokepoint exception, that requires an ADR amendment to ADR-0005 and a change
to eslint.config.mjs (which is itself guarded — see automation/hooks/guard-eslint-config.sh).
MSG
    exit 2
  fi
fi

if printf '%s' "$new_content" | grep -Eq "require\\(['\"]ai['\"]\\)"; then
  if printf '%s' "$new_content" | grep -Eq "(${forbidden})" ; then
    cat >&2 <<MSG
[guard-agent-runner-chokepoint] BLOCKED: $file_path is outside packages/skill/src/agent-runner/ but the pending edit requires model-call entrypoints from \`ai\` (CJS form).

See ADR-0005 and eslint.config.mjs's intentgraph/agent-runner-only rule.
MSG
    exit 2
  fi
fi

exit 0

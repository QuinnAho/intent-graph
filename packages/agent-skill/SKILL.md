---
name: intentgraph
description: Spec-driven graph of intent, constraints, decisions, and rationale. Provides MCP tools for querying, mutating, and verifying the IntentGraph for the current workspace.
allowed-tools:
  - graph.query
  - graph.get_node
  - graph.upsert_node
  - graph.upsert_edge
  - graph.delete
  - graph.diff_against_code
  - retrieval.search
  - task.create
  - task.lease
  - task.heartbeat
  - task.release
  - task.propose_patch
  - task.accept_patch
  - task.reject_patch
  - verify.run
  - trace.query
disable-model-invocation: false
---

# IntentGraph Skill

Activate this skill when the user asks about intents, constraints, decisions, drift, or wants to propose or verify a code change. The skill connects to the IntentGraph subprocess for the current workspace and exposes MCP tools listed above.

Default flow:

1. `retrieval.search` to find relevant intent/constraint/concept nodes for the user's request.
2. `graph.get_node` to expand context for the top hits.
3. If proposing a change: `task.create` → `task.lease` → make edits in a shadow worktree → `task.propose_patch` → preview, then `task.accept_patch` or `task.reject_patch`.
4. `verify.run` against affected obligations before accepting any patch.
5. Always cite the node IDs you traversed in your final response — the retrieval IS the externalized reasoning.

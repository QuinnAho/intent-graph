---
allowed-tools: [Bash(codex:*), Read, Glob, Grep]
description: Delegate a focused task to Codex CLI for isolated analysis or implementation.
argument-hint: <bounded task description>
---

Delegate a focused, bounded task to the Codex CLI in a sandboxed read-only run, then return a filtered summary to the parent Claude Code session.

This command is **explicit-only**. It is never auto-invoked from context matching — invocation is the user's deliberate choice to spend tokens on a Codex run, per the controllability argument in https://paddo.dev/blog/claude-skills-controllability-problem/. The `description` above is for the slash-command menu only; do not treat it as a `when_to_use` signal.

The command does not write code. The Codex run is `--sandbox read-only`, full stop. Any write work goes through the normal Ralph loop with human checkpoints, not through `/codex`.

## Inputs

- `$ARGUMENTS` — the bounded task. Required. If empty, ask the user for one and stop.

## Refuse the run when

Stop and report back to the user without invoking Codex if any of these is true:

1. **The task scope is not clearly bounded.** Vague tasks ("look at the auth code", "what do you think of this design") produce vague Codex runs that burn tokens. The task must name (a) the package or files in scope, and (b) the specific question or output. If unclear, ask one clarifying question.
2. **The task touches `tech-spec.md` phases 3, 4, or 6.** These phases (MCP server + bidir sync; drift detection + AgentRunner + monitor; hardening + first external users) carry mandatory human checkpoints per ADR-0007. Architectural decisions, schema work, and hardening are not delegated — they go through `intentgraph-architect` and an ADR.
3. **The task asks for write work.** Codex would have to be in `workspace-write` to apply changes; this command refuses that on principle. Redirect to `/intentgraph-ralph` or a manual implementer pass.
4. **The user wants the result in IntentGraph's own monitor-LLM trace later.** Codex runs are outside the trace store at this stage (Phase 3+ may register Codex as an MCP capability — see ADR-0008). If faithfulness-tracking matters for the artifact, run the work through AgentRunner instead.

When refusing, state the specific rule and suggest the right tool.

## Steps when running

1. **Verify the codex binary is on PATH.** Run `codex --version`. If it errors, fall back to the npm-installed shim path (`$APPDATA/npm/codex.cmd` on Windows, `~/.npm-global/bin/codex` on Unix). If neither works, report "codex CLI not installed; `npm i -g @openai/codex` to install" and stop.

2. **Verify current flags.** Run `codex exec --help` once and confirm the flags below still match. Codex's CLI changes between releases. If a flag has changed, use the current name and note the discrepancy in the run summary so the next maintainer can update this file (and ADR-0008).

3. **Gather minimal project context.** Use `Glob` and `Read` (no `Agent` calls — keep this cheap) to determine:
   - Which package or directory the task is in scope for (`packages/extension/`, `packages/webview/`, `packages/skill/`, `packages/shared/`, `automation/`, `/spec/`, `/docs/adr/`).
   - The 1–5 files most directly relevant.
   - The relevant `tech-spec.md` section number (read the section's heading; do not paste its body).
   Keep this gathering under ~30s — if the task needs more discovery, it's not bounded enough; refuse per rule (1).

4. **Build the prompt.** Compose a single string with this shape:
   ```
   You are running as Codex in read-only sandbox mode, invoked from a Claude Code parent session as a focused subtask. Return a tight, structured answer; no preamble.

   Project: IntentGraph (TypeScript monorepo, pnpm). Authoritative spec: tech-spec.md §<N> (<short heading>).
   In scope: <package or path list>
   Reference files: <bulleted list of 1–5 paths>
   Hard rules that apply: AgentRunner-only model calls; no JSON-as-storage; TS strict; no second graph model. See CLAUDE.md.

   Task: <$ARGUMENTS>

   Output format:
   - Findings: bullet list of concrete observations with file:line citations.
   - Answer: ≤200 words directly answering the task.
   - Open questions: anything you couldn't resolve from read-only inspection.
   ```

5. **Execute Codex.** Run, with the prompt passed via stdin to avoid shell-quoting issues:
   ```bash
   printf '%s' "<prompt>" | codex exec \
     -C "<project-root>" \
     -s read-only \
     --color never \
     --skip-git-repo-check \
     -
   ```

   Flag rationale (verified against `codex exec --help` on codex-cli 0.121.0 — re-verify per step 2):
   - `-C <project-root>` — pin the working root so Codex sees the monorepo, not whatever `cwd` happens to be.
   - `-s read-only` — sandbox policy: no writes, no network mutations.
   - `--color never` — clean stdout for the parent to parse.
   - `--skip-git-repo-check` — defensive; we are in a git repo, but this guards against edge cases.
   - **No approval flag.** `codex exec` is non-interactive by default — there is no human prompt to escalate to, so there is no `-a never` flag on `exec` (it exists only on the interactive `codex` entrypoint). An earlier draft of this command included `-a never`; that errored as `unexpected argument '-a'` and has been removed.
   - **Not used:** `--full-auto` (it implies `--sandbox workspace-write`, which contradicts read-only — see ADR-0008). Never write `--full-auto`, `--sandbox workspace-write`, `--sandbox danger-full-access`, or `--dangerously-bypass-approvals-and-sandbox` in this command, even commented out.
   - **Not used:** `--search` — it exists on `codex` (interactive) but is not accepted by `codex exec` in current versions. The paddo.dev post showed it; the current CLI does not. If the task genuinely needs web search, refuse and tell the user to run Codex interactively.

   Capture stdout, stderr, and exit code. Bound the run to 5 minutes (kill the process if it exceeds).

6. **Filter the output.** From Codex's stdout, surface to the parent session:
   - The `Findings`, `Answer`, and `Open questions` blocks, verbatim, inside a single fenced block prefixed `> [codex]:` so it is unambiguous which thoughts came from where.
   - Drop Codex's own session metadata, telemetry, and any chain-of-thought lines.
   - If Codex errored, surface stderr's last 30 lines and stop — do not synthesize an answer to cover the error.

7. **Log the invocation.** Append one JSON line to `automation/codex-log.jsonl`:
   ```json
   {"ts":"<ISO-8601>","task":"<first 200 chars of $ARGUMENTS>","scope":"<package/path>","exit":<int>,"duration_ms":<int>,"tokens":{"input":<int|null>,"output":<int|null>}}
   ```
   If the directory does not exist, create it. Token counts come from Codex's own report when emitted; if absent, write `null`.

8. **Report.** End with a one-line summary: `Codex run complete (<duration>s, exit <code>). Output above is read-only analysis — apply nothing without human review.`

## Output discipline in the parent session

- Codex's answer is presented as a quoted block, never paraphrased silently. The parent session may add a one-paragraph commentary after the quote, but the quote itself is preserved.
- Do not chain `/codex` calls inside one user turn. One delegation per turn — if the answer raises a follow-up, surface it as an "Open question" and let the user decide whether to spend another run.
- Codex's output is **not** authoritative. Treat it like a second-opinion review, not a decision.

## Hard rules (enforced by reading this file before invocation)

- Never write `--full-auto` or any `workspace-write` / `danger-full-access` flag.
- Never auto-invoke this command from context matching; the user must type `/codex`.
- Never run for tech-spec phases 3, 4, or 6.
- Never push, publish, or otherwise mutate shared state from inside the Codex run.
- Always log to `automation/codex-log.jsonl`.

# IntentGraph: Technical Specification & Build Plan

> Working name. Forks from QuinnAho/claudemap (MIT). Target: a spec-driven IDE plugin where developers work in a living graph of intent, constraints, decisions, and rationale; AI continuously syncs implementation to the graph in both directions. v1 = TypeScript-only, VS Code-first, dogfoodable in 8–10 weeks.

---

## 1. Executive summary & architecture

**Thesis.** Code becomes a verifiable projection of intent. The product wedge is *persistent program theory plus structured verification*, justified by GitClear/CodeRabbit data showing AI-generated code has 1.7× more issues, refactor share collapsed from 25% to <10% of changed lines, and METR's −19% senior-dev productivity finding for current AI tooling. We don't fix this by training prettier reasoning; we fix it by **architecture that records concrete artifacts** (Anthropic May 2025; Emmons et al. 2507.05246; Korbak et al. 2507.11473).

**v1 stack, decided.** TypeScript everywhere. VS Code extension + WebView panel (React Flow v12 + ELK + Zustand + TipTap + Yjs-per-node-text). Skill subprocess (Node.js) owning SQLite (better-sqlite3, WAL) + sqlite-vec + tree-sitter native + Drizzle ORM. MCP over stdio between extension and skill, between skill and Claude Code/Codex CLIs. Vercel AI SDK at the model boundary; Inngest as durable orchestrator; advisory leases with fence tokens + per-row OCC version. Cheap-monitor LLM (Llama 3.3 70B on Groq) on every commit. Reserve `probe_results` for Goodfire Ember in v2+.

**Architecture (text diagram).**

```
                         ┌────────────────────── VS Code window ──────────────────────┐
                         │                                                            │
  ┌──────────────────┐   │   ┌─────────── Extension Host (Node.js) ───────────┐       │
  │  Webview Panel   │◀──┼──▶│  IntentGraphController                          │       │
  │  React Flow v12  │   │   │  • vscode-messenger relay                       │       │
  │  Zustand store   │   │   │  • workspace.onDidSave/Change/RenameFiles       │       │
  │  TipTap + Yjs    │   │   │  • LSP client (executeXxxProvider piggyback)    │       │
  │  ELK in worker   │   │   │  • CodeLens / Status bar / Diff view            │       │
  └──────────────────┘   │   │  • MCP client (stdio | Streamable HTTP)         │       │
                         │   └──────────────────┬──────────────────────────────┘       │
                         │                      │ MCP JSON-RPC + notifications/*       │
                         └──────────────────────┼──────────────────────────────────────┘
                                                ▼
        ┌────────────────────────── Skill Subprocess (Node.js) ──────────────────────┐
        │  MCP Server (@modelcontextprotocol/sdk)                                    │
        │  ┌─────────────┐   ┌──────────────┐   ┌──────────────────────────────────┐ │
        │  │ Graph Store │   │ Parser       │   │ Orchestrator (Inngest)           │ │
        │  │ better-     │   │ tree-sitter  │   │  • Tasks = graph nodes           │ │
        │  │ sqlite3 WAL │   │ native       │   │  • AgentRunner (Vercel AI SDK)   │ │
        │  │ Drizzle ORM │   │ GumTree diff │   │  • Lease/Fence + OCC             │ │
        │  │ sqlite-vec  │   │ SCIP cache   │   │  • Worktree shadow workspace     │ │
        │  │ event_log + │   │ executeXxx   │   │  • Tier-0/1/2 model routing      │ │
        │  │ row_audit   │   │ via ext host │   └──────────────────────────────────┘ │
        │  └─────────────┘   └──────────────┘                                        │
        │  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────────┐   │
        │  │ Retrieval        │  │ Verifiers        │  │ Trace Store             │   │
        │  │ vec top-K → PPR  │  │ in-proc:         │  │ trace_event             │   │
        │  │ via graphology   │  │  fast-check, tsc │  │ + monitor_verdict       │   │
        │  │ + voyage embeds  │  │ MCP-pluggable:   │  │ + reasoning low-trust   │   │
        │  │ (cloud) or Qwen3 │  │  Verus, dmypy    │  │ + chain hash            │   │
        │  │ (offline)        │  │  + counterex HDD │  │                         │   │
        │  └──────────────────┘  └──────────────────┘  └─────────────────────────┘   │
        └────────────────────────────────────────────────────────────────────────────┘
                          ▲                                          ▲
                          │ same stdio MCP surface                   │
                ┌─────────┴─────────┐                       ┌────────┴─────────┐
                │ Claude Code CLI   │                       │ Codex CLI        │
                │ .claude/skills/   │                       │ .codex/skills/   │
                │ intentgraph/      │                       │ intentgraph/     │
                └───────────────────┘                       └──────────────────┘
```

**Key invariants.** (1) The graph is the truth; JSON exports are dumps, never sources. (2) Every agent action wraps in a task node and emits a trace event with concrete artifacts. (3) AI cannot produce a patch without traversing specific intent/constraint nodes — the retrieval IS the externalized reasoning. (4) Code is a projection: the verifier backplane decides whether intent is still satisfied.

---

## 2. The five architectural pillars, with concrete recommendations

### Pillar 1 — Plugin-first, not standalone IDE
- **VS Code extension** (`activationEvents: ["onCommand:intentgraph.openGraph"]`) with a primary `WebviewPanel` (`ViewColumn.Beside`), a sidebar `WebviewView` for outline/drift inbox, and a `CustomEditorProvider` for `.intent.json` snapshots.
- **Singleton per workspace folder**, `WebviewPanelSerializer` for restore, `retainContextWhenHidden: true` only on the panel.
- **Skill subprocess** packaged as a single Agent Skills directory consumed identically by Claude Code (`.claude/skills/intentgraph/`) and Codex (`.codex/skills/intentgraph/` + `agents/openai.yaml`). Skills became an open standard in Dec 2025.
- **One MCP server, three clients** (Codex CLI, Claude Code CLI, VS Code extension). The extension is just the richest client; do not fork it.

### Pillar 2 — Relational graph store as substrate
- **better-sqlite3 + WAL** (sync API, 1 writer / N readers — the canonical IDE-plugin shape). Pragmas on open: `journal_mode=WAL, synchronous=NORMAL, mmap_size=268435456, temp_store=MEMORY, foreign_keys=ON, busy_timeout=5000`.
- **sqlite-vec** for embeddings (single file, single backup, single transaction with the graph; brute-force is sub-100ms at 100k vectors with int8 quantization; DiskANN ANN now in alpha).
- **Drizzle ORM** for schema-as-TS + timestamped migration files; **Atlas** as a CI-time linter for destructive-change detection. Always copy `.db → .db.bak.<version>` before migrate; no `down.sql`, restore-from-backup instead.
- **Hybrid append-only audit**: semantic `event_log` (hash-chained) + CDC `row_audit` (trigger-written). Treat current-state tables as a deterministic *projection* of `event_log`; rollback = append compensating events, not physical revert.
- **Storage port abstraction** so libSQL/LanceDB swap is a one-day change when (a) replication becomes a product requirement, (b) Turso Database hits GA, or (c) corpus exceeds ~1M vectors and pure-vector workloads dominate.
- KuzuDB archived Oct 2025; Cozo bus-factor risk; libSQL on a strategic pivot — none load-bearing.

### Pillar 3 — Spec-driven loop is the backbone
- **Forward sync**: edit intent → orchestrator routes to a generation agent → agent runs in a `git worktree` shadow workspace under `.intentgraph/shadow/<task-id>` → produces a `proposed_patch` graph node → previewed via `vscode.diff` → applied via `WorkspaceEdit` (free user-level undo).
- **Backward sync**: `onDidSaveTextDocument` → tree-sitter incremental reparse → AST-grain diff (4-tier ladder: signature hash → body normalized hash → GumTree edit script via mergiraf crate → optional LLM behavior classifier) → drift events emitted on affected intent nodes.
- **Verification backplane** (Lahiri spectrum): obligations attached to intent nodes, runners pluggable.
  - Tier-1 in-process: fast-check (TS), `ts.createIncrementalProgram` for tsc diagnostics. Python (v1.1+) via `dmypy` daemon.
  - Tier-2 MCP plugins: Verus reference adapter (most production-credible 2025 functional verifier), Dafny, dmypy, optional pyright LSP. Everything cross-language goes over MCP, not gRPC.
  - **Counterexample minimization**: PBT shrinking (free) → optional HDD (picireny-style on tree-sitter grammar) under a 5s budget. Counterexamples become first-class graph nodes with one-click "promote to regression test."
- **LLM-generated property tests** follow TestGen-LLM's filter cascade (Alshahwan FSE 2024; Vikram 2307.04346 baseline ~42% sound): build → passes-on-current → coverage-delta → optional mutation kill.

### Pillar 4 — Agent orchestration is first-class
- **Inngest as durable runner**, not LangGraph/Mastra/CrewAI/AutoGen. The orchestrator's task graph IS the IntentGraph task subgraph; we refuse a second graph model. Self-hosted Dev Server in dev, Cloud or self-hosted runner in prod. Cognition's "Don't build multi-agents" thesis is respected because our agents are *specialized task-runners over a shared persistent graph*, not collaborators in a single trace — the graph is the shared context.
- **AgentRunner over Vercel AI SDK v6** as the single chokepoint to model providers; ESLint custom rule blocks `import { generateText } from "ai"` outside `core/agent-runner/`. Trace recording happens inside AgentRunner — there is no other path.
- **Three-tier routing**:
  - **T0 (hot):** Gemini 2.5 Flash-Lite ($0.10 / $0.40, 1M ctx) default; Groq Llama 3.3 70B for sub-500ms latency budgets; Cerebras Llama-3.1-8B (>2k t/s) reserved for the monitor LLM.
  - **T1 (warm):** Claude Haiku 4.5 ($1 / $5) default, GPT-5.4 mini fallback. Single-file edits, property-test scaffolding, structured spec extraction.
  - **T2 (frontier):** Sonnet 4.6 default; Opus 4.6 / GPT-5.5 escalation only for multi-file refactor proposals or hard verification.
  - Routing function: deterministic by `task.kind` for T0; RouteLLM-style classifier between T1↔T2.
- **Capability matching**: declared static table → embedding fallback over capability descriptors (Anthropic Skills-style progressive disclosure) → bandit later. Static-first keeps the routing layer human-readable.
- **Lease primitives**: advisory `(node_id, scope)` lease with TTL + monotonic **fence token** + per-row OCC version on `node`. Fence tokens close the Kleppmann gap; CAS makes lost-update impossible even on lease bugs.
- **Speculative execution + 5-second undo** = git worktree shadow + WorkspaceEdit + durable inverse-mutation log. Cursor's experience (shadow workspace shipped then quietly removed for memory pressure) is the warning: bound shadow lifetime to the task and GC eagerly.

### Pillar 5 — Faithfulness via architecture, not training
- The four-paper synthesis: CoT reveal-rate <20% in 2025 frontier models (Anthropic 2505.05410); a *weaker* monitor LLM detects reward hacking on a stronger reasoner (Baker 2503.11926); CoT-as-computation is monitorable when reasoning is *necessary* (Emmons 2507.05246); monitorability is fragile and architecture-dependent (Korbak et al. 2507.11473, 40+ co-signers).
- **Concrete recording, not pretty rationales.** Every agent action stores tool calls, retrieved node IDs, model + version, prompt hash (full text opt-in), reasoning text in a separate TTL-bounded low-trust column, verifier outcomes, downstream mutations, monitor verdict, usage, latency, cost.
- **Monitor-LLM gate** on every commit phase + 5% sample on model_calls + always on `safety_critical` mutations. Default: Llama 3.3 70B on Groq (~$0.10–0.20/dev/day at typical traffic). Output JSON: `{flagged, score, categories[reward_hack|intent_drift|hallucinated_spec|capability_misuse|obfuscation], evidence, recommended_action[allow|require_human_review|block]}`. The monitor's flag becomes a graph node edged from the trace and the task.
- **Hard rule**: never train any IntentGraph component against the monitor's signal — this is the obfuscation tax Baker et al. specifically warn about.
- **Goodfire Ember** SAE feature probing: `trace_event.probe_results` reserved; integration deferred to v2+ when Tier-0 monitor is live and we have ≥10K labeled verdicts to run contrastive search on.

---

## 3. Component specifications

### 3.1 Storage layer (skill side)
- Drizzle schema in `server/src/db/schema.ts`, migrations under `server/migrations/`. Atlas in CI: `atlas migrate lint --dev-url 'sqlite://dev?mode=memory' --latest 1`.
- Backup-before-migrate at app start; refuse to start if backup write fails.
- Snapshot strategy: opportunistic snapshots every N events or on user request, materialized into separate ATTACH'd DBs (`snap_2026-04-27.db`); cap at "last N snapshots + one per week beyond that." Quarterly partition rotate on `event_log` to keep replay tractable.

### 3.2 Parsing & analysis
- **Two parsers, one source of truth.** Extension owns the live CST per open file (incremental `tree.edit`); skill owns project-wide CST cache for non-open files. Avoid double-parsing.
- **LSP layered**: Layer 0 = tree-sitter skeleton always-on; Layer 1 = `vscode.commands.executeCommand('vscode.executeDefinitionProvider', …)` etc. piggybacks the user's existing tsserver/pyright on demand (no second LSP instance); Layer 2 = SCIP indices (scip-typescript, scip-python) ingested in CI for cold/whole-repo + cross-repo identity.
- **Symbol identity** = SCIP-first when available → composite-heuristic (signature 0.30 + body 0.35 + outgoing-call 0.20 + name 0.15) with thresholds 0.85 confident / 0.65 tentative; embeddings as tiebreaker only at 0.65–0.85 (cosine ≥ 0.92 promotes); LSP rename events as hard overrides.
- **Semantic diff** via mergiraf's GumTree (Rust, 33 languages including TS as of v0.14.0 Sept 2025) with the 4-tier filter ladder above. Hyperparameters fixed per language — never auto-tune in the inner loop.

### 3.3 Orchestration runtime
- Inngest functions for each agent capability (`intent.extract`, `code.gen`, `drift.check`, `verify.run`, `monitor.check`, `counterexample.minimize`).
- Each `step.run` writes a `trace_event` row in the same step body (dual record: Inngest's UI + our store).
- Task lifecycle: `proposed → leased → running → produced_patch → monitor_pending → committed | rejected | rolled_back`.
- Concurrency policy: `concurrency: { key: "event.data.intentNodeId", limit: 1 }` per node; orchestrator-level fairness policy keeps drift-checkers from being starved by long-running generation.

### 3.4 Verification backplane
- `Verifier` interface (in-process for first-party, MCP for third-party):
  ```ts
  interface Verifier {
    id: string;
    obligationKinds: ('property'|'typecheck'|'formal'|'example'|'metamorphic')[];
    capabilities: { canShrink: boolean; canExplain: boolean; isDeterministic: boolean };
    costClass: 'sub-ms' | 'ms' | 's' | 'minutes';
    run(o: Obligation, ctx: VerifierContext): Promise<VerifierResult>;
  }
  ```
- Scheduler respects `costClass`; user-interactive paths can never block on `s`/`minutes` verifiers — those run in background and post results to graph asynchronously.

### 3.5 Rendering
- React Flow v12, kept; adopt Contextual Zoom LOD (3 tiers tied to `useViewport()` zoom), `onlyRenderVisibleElements`, memoized `nodeTypes`, narrow Zustand selectors, sub-flows for concept boundaries (`extent: 'parent'`).
- ELK in a dedicated WebWorker with `org.eclipse.elk.portConstraints: FIXED_ORDER`. Re-layout only on structural commits or explicit "Reformat"; debounce 200 ms. Phase 2 = incremental local placement for single-node mutations.
- Lazy-mount TipTap only on node focus. Mention extension drives `@`/`/` triggers; mentions serialize to typed pointers `{type:'mention', kind:'constraint', id:'auth-required'}`.
- Yjs only at the *node-text* granularity — full graph CRDT is overkill for one webview.

### 3.6 Webview transport
- `vscode-messenger` typed RPC envelopes. Initial `snapshot.init` is msgpack `ArrayBuffer`; subsequent `graph.delta` ops keyed by id.
- Coalesce upserts at the skill side; token-bucket (60 ops/s sustained, 240 burst); webview ACKs by `seq`; >1024 outstanding triggers a fresh snapshot.
- Real-time channel: MCP `notifications/intentgraph/delta` and `…/drift` over stdio; Streamable HTTP (Mcp-Session-Id resume) when `intentgraph.skill.remoteUrl` is set. SSE-only is deprecated by 2025-03 spec.

### 3.7 Retrieval & memory
- **Hybrid pipeline**: structural code graph (LocAgent-style; tree-sitter + LSP edges contain/import/invoke/inherit) + OpenIE on natural-language intent nodes only (HippoRAG 2 style — don't pay LLM OpenIE on code).
- **PPR in-process** via `graphology` + `graphology-metrics` pagerank, seeded by sqlite-vec top-K with weights = similarity. ~10 iters × ~10ms/iter for 100k-node graphs. No Python sidecar, no recursive CTEs.
- **Embeddings**: cloud = voyage-code-3 (1024-dim int8) for code + voyage-3-large for intent; offline = single Qwen3-Embedding-0.6B (MRL-truncate to 512) for both, ONNX in a Node worker.
- **Eval harness** runs nightly in CI: CoIR-CSN-CCR NDCG@10 + LocAgent Loc-Bench Acc@5 + custom dogfood multi-hop set (200 hand-curated queries) + masked Recall@10 on dogfood + 20-task agent pass rate. Persist to `eval_runs(commit, date, metric, value)`; Slack-alert on >3% regression.
- **Posture**: retrieval-first to ~50K tokens, frontier reasoning within. Long-context-first reserved for one explicit "summarize all my intent" UX path. RULER-class evidence and cost economics both rule out long-context-first as the spine.

### 3.8 Trace store
- DDL in §4.7. Prompt text: SHA-256 by default; full text opt-in per workspace setting. Reasoning text: separate column, 30-day TTL by default, full opt-in. Tool *results* containing source code: hash by default.
- `monitor_verdict` is updated *in place* on the same trace_event row when monitor finishes (typical lag 1–3s on Groq).

---

## 4. Schema specifications (SQLite DDL)

> Conventions: `STRICT`, `WITHOUT ROWID` where keys are stable, ULIDs as TEXT, JSON as `TEXT` (Drizzle's `.$type<T>()` gives compile-time safety). Timestamps are integer epoch ms.

### 4.1 Nodes (heterogeneous, 9 kinds + task)
```sql
CREATE TABLE node (
  id            TEXT PRIMARY KEY,                    -- ULID
  kind          TEXT NOT NULL CHECK (kind IN
                  ('intent','constraint','rationale','decision','concept',
                   'code_module','code_symbol','counterexample','task')),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,                       -- JSON; per-kind shape below
  confidence    TEXT NOT NULL CHECK (confidence IN
                  ('extracted','inferred','semantic','asserted')),
  parent_id     TEXT REFERENCES node(id),            -- concept boundary parent
  version       INTEGER NOT NULL DEFAULT 0,          -- OCC
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER                              -- soft delete; NULL = live
) STRICT;
CREATE INDEX node_kind_updated ON node(kind, updated_at);
CREATE INDEX node_parent       ON node(parent_id);

-- Per-kind body shape (validated by Zod at the application layer):
-- intent       : { description, owner_node?, target_kinds[], priority? }
-- constraint   : { predicate_kind:'property'|'type'|'logical'|'example', expr, scope_node }
-- rationale    : { text, references_node[] }
-- decision     : { context, alternatives[], chosen, consequences }
-- concept      : { description, regeneration_scope:'atomic'|'cooperative' }   -- Jackson concept
-- code_module  : { uri, language, file_hash, scip_symbol? }
-- code_symbol  : { uri, range, qualified_name, signature_hash, body_hash, scip_symbol? }
-- counterexample: { obligation_id, input_repr, input_hash, shrink_steps,
--                   shrinker:'fast-check'|'hypothesis'|'hdd', reproducer, observed, expected? }
-- task         : { goal, status:'proposed'|'leased'|'running'|'produced'|'committed'|'rejected'|'rolled_back',
--                   capability_id, parent_task_id?, budget }
```

### 4.2 Edges (9 typed)
```sql
CREATE TABLE edge (
  id          TEXT PRIMARY KEY,
  src         TEXT NOT NULL REFERENCES node(id),
  dst         TEXT NOT NULL REFERENCES node(id),
  kind        TEXT NOT NULL CHECK (kind IN
                ('realizes','constrains','decides','justifies','supersedes',
                 'syncs_with','depends_on','produced_by','references')),
  weight      REAL NOT NULL DEFAULT 1.0,
  body        TEXT,                                  -- optional JSON
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER
) STRICT;
CREATE UNIQUE INDEX edge_unique ON edge(src, dst, kind) WHERE deleted_at IS NULL;
CREATE INDEX edge_src ON edge(src, kind);
CREATE INDEX edge_dst ON edge(dst, kind);
```

### 4.3 Obligations
```sql
CREATE TABLE obligation (
  id              TEXT PRIMARY KEY,
  intent_node_id  TEXT NOT NULL REFERENCES node(id),
  kind            TEXT NOT NULL CHECK (kind IN
                    ('property','typecheck','formal','example','metamorphic')),
  source          TEXT NOT NULL CHECK (source IN ('llm','human','mined')),
  test_code       TEXT NOT NULL,
  rationale       TEXT,
  status          TEXT NOT NULL CHECK (status IN
                    ('pending','verified','failed','rejected')) DEFAULT 'pending',
  filters_passed  TEXT NOT NULL DEFAULT '[]',        -- JSON string[]
  counterexample_node_id TEXT REFERENCES node(id),
  last_run_at     INTEGER,
  created_at      INTEGER NOT NULL
) STRICT;
CREATE INDEX obligation_intent ON obligation(intent_node_id);
```

### 4.4 Leases
```sql
CREATE TABLE lease (
  node_id      TEXT NOT NULL REFERENCES node(id),
  scope        TEXT NOT NULL CHECK (scope IN ('mutate','drift-fix','verify','plan')),
  holder       TEXT NOT NULL,                        -- agent_id + run_id
  reason       TEXT,
  expires_at   INTEGER NOT NULL,
  acquired_at  INTEGER NOT NULL,
  fence_token  INTEGER NOT NULL,
  PRIMARY KEY (node_id, scope)
) STRICT;
CREATE INDEX lease_expiry ON lease(expires_at);
CREATE TABLE fence_seq (next INTEGER NOT NULL) STRICT;
INSERT INTO fence_seq(next) VALUES (1);
```

### 4.5 Tasks (specialization view)
Tasks live in `node` (`kind='task'`); for fast scheduling queries materialize a view:
```sql
CREATE VIEW task_active AS
  SELECT id, json_extract(body,'$.status')        AS status,
         json_extract(body,'$.capability_id')     AS capability_id,
         json_extract(body,'$.parent_task_id')    AS parent_task_id,
         updated_at
  FROM   node
  WHERE  kind='task' AND deleted_at IS NULL
    AND  json_extract(body,'$.status') IN ('proposed','leased','running','produced','monitor_pending');
```

### 4.6 Actions (semantic event log)
```sql
CREATE TABLE event_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  actor       TEXT NOT NULL,                         -- 'user' | 'agent:<id>' | 'verifier:<id>' | 'monitor'
  kind        TEXT NOT NULL,                         -- e.g. 'agent.proposed_change','user.accepted_patch','monitor.flagged'
  task_id     TEXT REFERENCES node(id),
  trace_id    TEXT,
  payload     BLOB NOT NULL,                         -- canonical JSON/CBOR
  prev_hash   BLOB,
  hash        BLOB NOT NULL                          -- sha256(prev_hash || canonical(payload))
) STRICT;
CREATE INDEX event_log_ts   ON event_log(ts);
CREATE INDEX event_log_task ON event_log(task_id);
```

### 4.7 Trace events
```sql
CREATE TABLE trace_event (
  trace_id           TEXT PRIMARY KEY,
  parent_trace_id    TEXT REFERENCES trace_event(trace_id),
  task_node_id       TEXT NOT NULL REFERENCES node(id),
  agent_id           TEXT NOT NULL,
  capability_id      TEXT NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN
                       ('model_call','tool_call','retrieval','verifier','monitor','mutation')),
  model              TEXT,
  model_version      TEXT,
  provider           TEXT,
  prompt_hash        TEXT,
  prompt_text        TEXT,                           -- nullable; policy-gated
  reasoning_hash     TEXT,
  reasoning_text     TEXT,                           -- LOW-TRUST; TTL 30d default
  tool_calls         TEXT,                           -- JSON [{name,args_hash,args?,result_hash,result?,ts}]
  retrieved_node_ids TEXT,                           -- JSON string[]
  produced_mutations TEXT,                           -- JSON
  verifier_outcomes  TEXT,                           -- JSON
  monitor_verdict    TEXT,                           -- JSON {flagged,score,categories[],evidence,recommended_action,monitor_model}
  probe_results      TEXT,                           -- reserved for Goodfire Ember v2+
  usage              TEXT NOT NULL,                  -- JSON {in,out,reasoning_tokens?,cached_in?}
  cost_usd           REAL NOT NULL,
  latency_ms         INTEGER NOT NULL,
  ttft_ms            INTEGER,
  status             TEXT NOT NULL CHECK (status IN ('ok','error','guardrail_tripped')),
  error              TEXT,
  started_at         INTEGER NOT NULL,
  ended_at           INTEGER NOT NULL
) STRICT;
CREATE INDEX te_task    ON trace_event(task_node_id, started_at);
CREATE INDEX te_parent  ON trace_event(parent_trace_id);
CREATE INDEX te_flagged ON trace_event(json_extract(monitor_verdict,'$.flagged'));
```

### 4.8 Retrievals (PPR queries cached)
```sql
CREATE TABLE retrieval (
  id            TEXT PRIMARY KEY,
  trace_id      TEXT REFERENCES trace_event(trace_id),
  query_hash    TEXT NOT NULL,                       -- canonical query hash
  query_text    TEXT,                                -- optional; gated
  seed_node_ids TEXT NOT NULL,                       -- JSON: [{node_id, similarity}]
  ppr_top_k     TEXT NOT NULL,                       -- JSON: [{node_id, score}]
  algorithm     TEXT NOT NULL,                       -- 'vec_only'|'vec+ppr'|'bm25'|'hybrid'
  embedding_model TEXT,
  k             INTEGER NOT NULL,
  latency_ms    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
) STRICT;
CREATE INDEX retrieval_query_hash ON retrieval(query_hash);
```

### 4.9 Row audit (CDC)
```sql
CREATE TABLE row_audit (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  tx_id   INTEGER,                                   -- correlate with event_log.id
  tbl     TEXT NOT NULL,
  op      TEXT NOT NULL CHECK (op IN ('I','U','D')),
  rowid   INTEGER,
  before  TEXT,
  after   TEXT
) STRICT;
-- One AFTER trigger per tracked table writes row_audit.
```

### 4.10 Vector tables (sqlite-vec virtual)
```sql
-- One vec0 table per embedding-bearing kind, joined by node id (rowid).
CREATE VIRTUAL TABLE vec_intent USING vec0(
  node_rowid INTEGER PRIMARY KEY,
  embedding  FLOAT[1024] DISTANCE_METRIC=cosine
);
CREATE VIRTUAL TABLE vec_code USING vec0(
  node_rowid INTEGER PRIMARY KEY,
  embedding  FLOAT[1024] DISTANCE_METRIC=cosine
);
```

---

## 5. MCP tool surface

**Five families.** Inputs/outputs declared as Zod schemas inside `server/src/mcp/tools/`; every tool emits a `trace_event` row. All tools accept an optional `idempotency_key` and `parent_trace_id`.

### 5.1 Graph (read/write)
| Tool | Input | Output |
|---|---|---|
| `graph.query` | `{dsl:string} \| {sql:string} \| {kind?, parent?, limit?, cursor?}` | `{nodes[], edges[], next_cursor?}` |
| `graph.get_node` | `{id}` | `{node, edges_in[], edges_out[]}` |
| `graph.upsert_node` | `{id?, kind, title, body, confidence, parent_id?, expected_version?}` | `{node, version}` |
| `graph.upsert_edge` | `{src, dst, kind, weight?, body?}` | `{edge}` |
| `graph.delete` | `{id, kind:'node'\|'edge', expected_version?}` | `{ok}` |
| `graph.snapshot` | `{event_id?: int}` | `{snapshot_uri}`  (point-in-time projection) |
| `graph.diff_against_code` | `{repo_path?}` | `{drifts:[{symbol_id, intent_id?, kind:'orphan_symbol'\|'orphan_intent'\|'signature_changed'\|'body_semantic'\|'moved'}]}` |

### 5.2 Retrieval
| Tool | Input | Output |
|---|---|---|
| `retrieval.search` | `{query, k?, scope?:'all'\|'intent'\|'code', algorithm?:'vec+ppr'\|'vec_only'\|'bm25'\|'hybrid'}` | `{hits:[{node_id, score, snippet}]}` |
| `retrieval.embed` | `{text, model?}` | `{embedding[]}`  (rarely used directly; for diagnostics) |

### 5.3 Orchestration
| Tool | Input | Output |
|---|---|---|
| `task.create` | `{goal, capability_id, parent_task_id?, budget?}` | `{task_node}` |
| `task.lease` | `{node_id, scope, ttl_ms}` | `{lease, fence_token}` |
| `task.heartbeat` | `{node_id, scope, fence_token, ttl_ms}` | `{ok, expires_at}` |
| `task.release` | `{node_id, scope, fence_token}` | `{ok}` |
| `task.propose_patch` | `{task_id, files:[{uri, before_hash, after}], rationale}` | `{patch_node_id, diagnostics}` |
| `task.accept_patch` | `{patch_node_id}` | `{applied:true, mutation_log_id}` |
| `task.reject_patch` | `{patch_node_id, reason?}` | `{ok}` |
| `task.rollback` | `{count\|to_event_id}` | `{rolled_back:[event_ids]}` |

### 5.4 Verification
| Tool | Input | Output |
|---|---|---|
| `verify.run` | `{obligation_ids?, scope?:nodeId, verifier_id?}` | `{results:[{obligation_id, status, evidence_ref, latency_ms}]}` |
| `verify.register` | `{manifest: VerifierManifest}` | `{verifier_id}`  (third-party MCP plugins) |
| `verify.shrink` | `{counterexample_id, budget_ms?}` | `{shrunk_repr, steps}` |
| `verify.propose_property` | `{intent_id}` | `{proposals:[ObligationProposal]}` |  // LLM-generated, pre-filter

### 5.5 Trace / audit / monitor
| Tool | Input | Output |
|---|---|---|
| `trace.append` | `{TraceEnvelope}` | `{trace_id}`  (typically called only by AgentRunner) |
| `trace.query` | `{task_id?, since?, monitor_flagged?, kind?, limit?}` | `{events[]}` |
| `monitor.review` | `{trace_id}` | `{verdict:{flagged, score, categories[], evidence, recommended_action}}` |
| `audit.replay` | `{from_event_id, to_event_id?}` | `{snapshot_db_uri}` |

**Streamable notifications** (server → client): `notifications/intentgraph/delta`, `…/drift`, `…/monitor_flagged`, `…/verifier_completed`, `notifications/progress`.

---

## 6. Phase-by-phase build plan

> Assumes 2–3 senior engineers + author dogfooding daily. Phases gate on dogfooding maturity (L0–L3), not feature count. Total runway estimate: **~9–11 months to L3 + paying-customer-ready v1**, **~14–16 months to v1.1 (Python)**, **~20–22 months to v2 (Go *or* Rust + first multi-repo features)**.

### Phase 0 — Spec-as-markdown (Week 0, 1 eng-week)
- `/spec/intents/*.md`, `/spec/constraints/*.md`, `/spec/decisions/*.md` with YAML frontmatter (`id, title, parent, verified_by`). ADR template committed.
- Reading list circulated (§8). Repo bootstrap (TS strict, Vitest, ESLint with the AgentRunner-only rule pre-added).
- **Gate:** every team member can write an intent in markdown and find it via grep. No tool yet.

### Phase 1 — Fork & cleanup (Weeks 1–2, ~3 eng-weeks)
- Fork ClaudeMap; convert JS → TS strict; pin `@xyflow/react` v12.10+, `elkjs`, `zustand`. Strip the LLM-only architecture subagent.
- Day-1 verification: confirm package.json, read `contracts/`, read `skill/SKILL.md` frontmatter, inspect `agents/` (subagent caveats from research brief).
- Replace custom bundler with **Vite** for `app/` and **tsup** for `server/`. Add Vitest + fast-check. Adopt Drizzle.
- **Gate:** `pnpm dev` opens the React Flow shell; CI runs lint + Vitest + fast-check (against an empty ObligationProposal pipeline).

### Phase 2 — Static graph build → L0 (Weeks 3–4, ~6 eng-weeks)
- `server/src/build-graph.ts`: tree-sitter native walk of `src/`, parse `/spec/*.md`, emit `graph.json` plus a SQLite seeded from it.
- App reads `graph.json` (still file-based for L0). Add Contextual Zoom LOD, sub-flows for concepts, ELK in worker.
- Coverage Verifier (every Intent has ≥1 `realizes` and every Constraint has a `verified_by`).
- **Gate (L0): `pnpm build && open app/dist/index.html` shows IntentGraph's own intents and code modules.** New team member finds an intent visually within 60s.

### Phase 3 — MCP server + bidirectional markdown sync → L1 (Weeks 5–6, ~6 eng-weeks)
- TS MCP server (`@modelcontextprotocol/sdk`): `graph.query`, `graph.get_node`, `graph.upsert_node`, `graph.upsert_edge`, `graph.diff_against_code`, `verify.run`. Single SKILL.md packaged for both `.claude/skills/` and `.codex/skills/`.
- `intent.upsert` writes back to markdown; chokidar rebuilds the SQLite projection. Markdown remains canonical commit-tracked artifact.
- VS Code extension v0.1: `WebviewPanel` with `vscode-messenger`; `intentgraph.openGraph` command; activation event lazy-starts skill subprocess (`StdioClientTransport`); `WebviewPanelSerializer` restore.
- Adopt msgpack snapshot + delta protocol; ACK + token-bucket back-pressure.
- TipTap node editor (lazy-mounted on focus); `@`/`/` mention triggers; mentions resolve via `retrieval.search`.
- **Gate (L1): Editing `/spec/intents/auth.md` in VS Code updates the on-screen graph within 2s without restart.** `git diff` after a UI edit shows clean human-readable markdown.

### Phase 4 — Drift detection + AgentRunner + monitor → L2 (Weeks 7–10, ~12 eng-weeks)
- `onDidSaveTextDocument` → tree-sitter incremental reparse → 4-tier semantic diff (mergiraf via N-API) → drift events emitted.
- AgentRunner over Vercel AI SDK v6, with the ESLint chokepoint rule. Three tiers wired (Gemini Flash-Lite, Haiku 4.5, Sonnet 4.6). Vercel AI Gateway as default; direct provider SDKs as escape hatch.
- Inngest dev server bundled; first agent functions: `intent.extract`, `drift.check`, `verify.run`, `monitor.check`. Every step writes a `trace_event`.
- Lease + fence + OCC mutation enforcement.
- LLM-generated property proposal pipeline (TestGen-LLM filter cascade); counterexample minimization via fast-check shrinking + optional HDD.
- Monitor LLM (Llama 3.3 70B on Groq) on every commit + 5% sample; emits `monitor_flag` graph nodes; `block`/`require_human_review` gates wired to UI.
- VS Code CodeLens (`intent: …`, `✓ aligned`/`⚠ drift`/`✗ violation`); diff view via `intentgraph-proposed:` scheme; status bar drift summary.
- Patch proposal mode using git worktree shadow + WorkspaceEdit; durable inverse-mutation log; 5s undo window.
- **Gate (L2): In one week of normal team coding, ≥80% of symbol-vs-intent drift is auto-detected and ≥50% of suggestions are accepted as-is.**

### Phase 5 — Retrieval, evaluation, and self-refactor → L3 (Weeks 11–14, ~12 eng-weeks)
- sqlite-vec wired; voyage-code-3 + voyage-3-large in cloud mode; Qwen3-Embedding-0.6B in offline.
- HippoRAG-style PPR via graphology (`vec+ppr` algorithm), with structural code edges from LocAgent-style extraction. `retrieval.search` MCP tool.
- Eval harness in CI: CoIR-CSN-CCR + Loc-Bench Acc@5 + 200-query dogfood set + masked Recall@10 + 20-task agent pass rate. Slack regression alerts.
- Audit/replay: `audit.replay` tool; snapshot DBs; rollback over inverse-mutation log.
- Codex parity tests in CI (six-client matrix from research brief).
- **Gate (L3): CI fails when `verify.run --strict` shows any drift on the team's repo. Tool writes new intent stubs from PR commits (LLM-assisted) and asks the author to confirm. For 4 consecutive weeks, no merged PR contains an undocumented exported symbol.**

### Phase 6 — Hardening, packaging, first external users (Weeks 15–22, ~24 eng-weeks)
- VS Code Marketplace listing; `~/.codex/skills/intentgraph/` install flow; Claude Code plugin marketplace entry; `npx @intentgraph/install` CLI.
- Multi-workspace (`per-folder` policy default; bound to 4 concurrent skill processes).
- Streamable HTTP transport for Codespaces / remote dev.
- Performance hardening: incremental ELK placement, server-side ELK for >3k-node graphs, Sigma.js escape-hatch overview at <0.25 zoom.
- Privacy/policy controls for prompt + reasoning storage; secrets scrub on tool-call args.
- Verus reference adapter as the canonical formal-methods plugin example.
- **Gate (Beta-ready): three external pilot users dogfooding their own TS repos for two weeks each with no critical-severity bugs.**

### Phase 7 — Python (v1.1) (Months 6–8, ~24 eng-weeks)
- tree-sitter-python; pyright via LSP `executeXxxProvider`; dmypy daemon as type-check verifier; hypothesis as PBT runner; CodeRankEmbed/Qodo-Embed-1 evaluation for offline Python embedding.
- Python equivalents of TestGen-LLM filter cascade.
- Symbol identity: SCIP-Python ingestion; same composite-heuristic fallback.

### Phase 8 — Go *or* Rust (v2) (Months 9–14, ~36 eng-weeks)
- Customer-driven choice: Go (gopls + proptest-go via gopter) for infra/cloud customers, OR Rust (rust-analyzer + proptest, plus first-class Verus integration) for systems customers. **Do not add both in the same phase.**
- Begin first multi-repo features: cross-repo SCIP indices ingested, edges across repos, retrieval that respects repo boundaries.

### Effort summary
| Phase | Weeks | Eng-weeks | Dogfooding gate |
|---|---|---|---|
| 0 | 1 | 1 | — |
| 1 | 2 | 3 | — |
| 2 | 2 | 6 | **L0** |
| 3 | 2 | 6 | **L1** |
| 4 | 4 | 12 | **L2** |
| 5 | 4 | 12 | **L3** |
| 6 | 8 | 24 | Beta-ready |
| 7 | 12 | 24 | v1.1 (Python) |
| 8 | 24 | 36 | v2 (Go or Rust) |

---

## 7. Identified gaps, risks, and unresolved questions

**A. ClaudeMap repo-level facts to verify Day 1 (research subagent could not read source files directly).** Confirm the exact `package.json` of `claudemap` (versions of `@xyflow/react`, `elkjs`, `zustand`); read `contracts/` to learn whether the schema is JSON Schema, Zod, or hand-rolled; read `skill/SKILL.md` frontmatter (`allowed-tools`, `disable-model-invocation`); inspect `agents/`. The research brief's strong claim is that *ClaudeMap has no MCP server today* — only slash commands + filesystem JSON handoff. If true, the "MCP bridge" inheritance assumption needs rewriting; we build the MCP server ground-up.

**B. Symbol identity beyond SCIP.** SCIP IDs are type-resolved per language indexer; cross-commit identity ("same conceptual symbol after rename+move") still relies on the composite heuristic. The 0.30/0.35/0.20/0.15 weights and 0.85/0.65 thresholds are reasonable starting points but need empirical tuning per codebase. **Open call:** ship telemetry on heuristic-vs-confirmed match agreement for the first 3 months.

**C. ELK perf at scale.** Public benchmarks are scarce above ~1500 nodes. The escape-hatch design (Sigma.js overview ↔ React Flow edit-mode) is sound but unspecified. **Open call:** spike a 5k-node synthetic graph in Phase 2 and measure ELK timing before committing to the incremental layout strategy.

**D. Monitor-LLM precision/recall.** Baker et al.'s public results are on RL-trained CoT reasoners and synthetic reward-hacking tasks. Real-world precision on commercial coding agents at current frontier is unknown. **Open call:** maintain a labeled set of 200+ historical commits (50 ground-truth misbehaviors, 150 clean) and recompute monitor precision/recall quarterly. Ember integration is a viable v2+ path *if* the labeled set demonstrates the cheap monitor leaves enough recall on the table to justify it.

**E. Yjs at node-text granularity.** Per-node Y.Doc is conceptually clean but unbenchmarked at 1000+ docs in one webview. **Open call:** prototype 1000 Y.Docs in a stress page in Phase 3 before committing.

**F. HippoRAG OpenIE cost on large intent graphs.** OpenIE runs on creation/update of NL intent nodes; this is bounded but not free. **Open call:** budget the OpenIE cost in dollars/dev/day at typical traffic; if >$1, gate behind explicit user opt-in.

**G. Inngest dependency.** A self-hosted runner exists, but the operational story for users who don't want any Inngest dependency at all (security-sensitive enterprises) is unclear. **Open call:** keep the orchestrator interface thin so a BullMQ fallback is feasible; treat it as a switch, not a rewrite.

**H. Counterexample minimization for non-PBT failures.** Type errors, formal-method counterexamples, and runtime crashes don't have an obvious shrinker. HDD on tree-sitter grammar is a research opportunity (concrete IntentGraph contribution). v1 punts: minimize only PBT-shaped failures.

**I. Privacy on reasoning_text.** Storing reasoning text — even TTL-bounded — risks leaking proprietary code or PII. Default off for enterprise; per-workspace opt-in. **Open call:** legal review before any cloud telemetry sync of reasoning text.

**J. Tree-sitter grammar drift.** A TS 5.x feature may not parse on an older grammar. Pin grammar versions and treat ERROR/MISSING nodes as first-class "unknown skeleton" nodes rather than failing.

**K. Long-context regression risk.** The "retrieval-first to ~50K, frontier reasoning within" posture depends on retrieval quality. If F3's eval harness shows >5% regression in dogfood multi-hop, the architectural posture must shift toward larger context windows or rerank tiers.

**L. Forking the extension for non-VS Code IDEs.** JetBrains/Zed/Cursor parity is explicitly out of scope for v1; the architecture supports it (skill is the substrate; UI is the thin client) but a JetBrains plugin alone is ~3 eng-months.

---

## 8. Reading list (per phase)

**Before Phase 0:**
- Anthropic, "Reasoning Models Don't Always Say What They Think" — arXiv 2505.05410.
- Korbak et al., "Chain of Thought Monitorability" — arXiv 2507.11473.
- Cognition, "Don't build multi-agents" — cognition.ai/blog/dont-build-multi-agents.
- Daniel Jackson, "The Essence of Software" / concept design — arXiv 2508.14511.

**Before Phase 1 (fork + stack):**
- React Flow performance docs — reactflow.dev/learn/advanced-use/performance.
- ClaudeMap repo: README, `contracts/`, `skill/SKILL.md`, `agents/`.
- Anthropic Agent Skills overview — platform.claude.com/docs/en/agents-and-tools/agent-skills/overview.
- MCP Streamable HTTP spec (2025-03-26) — modelcontextprotocol.io/specification/2025-03-26/basic/transports.

**Before Phase 2 (parsing + storage):**
- Tree-sitter incremental parsing docs.
- "Modern tree-sitter" — Pulsar editor blog series.
- sqlite-vec docs and Marco Bambini's "State of vector search in SQLite" article.
- Drizzle ORM + Atlas migrations docs.

**Before Phase 3 (MCP + extension):**
- VS Code Webview API + UX guidelines.
- vscode-messenger docs + Comlink-MessagePort caveats.
- TipTap mention/suggestion docs.
- Sourcegraph SCIP announcement.

**Before Phase 4 (orchestration + verification + monitor):**
- Baker et al., OpenAI, "Monitoring Reasoning Models for Misbehavior…" — arXiv 2503.11926.
- Emmons et al., DeepMind, "When CoT is Necessary…" — arXiv 2507.05246.
- Inngest documentation; Vercel AI SDK 6 release notes.
- TestGen-LLM (Alshahwan et al., FSE 2024) and Vikram et al. arXiv 2307.04346.
- GumTree (Falleri 2014) and the 2024 ICSE refresh; mergiraf docs.
- RouteLLM — arXiv 2406.18665; BEST-Route ICML 2025.
- Cursor shadow workspace post-mortem analyses.

**Before Phase 5 (retrieval + eval):**
- Jiménez Gutiérrez et al., HippoRAG 2 — ICML 2025 (openreview LWH8yn4HS2).
- Chen et al., LocAgent — arXiv 2503.09089 (ACL 2025).
- Voyage code-3 / voyage-3-large blog posts.
- RULER — arXiv 2404.06654.
- CoIR — arXiv 2407.02883.

**Before Phase 6 (hardening + Codex parity):**
- Codex skills + Codex CLI plugin docs.
- VS Code `chatSkills` contribution point (Copilot integration).

**Before Phase 7 (Python):**
- Pyright as CLI vs as LSP server; dmypy daemon docs.
- Hypothesis docs; scip-python.

**Before Phase 8 (Go or Rust):**
- gopls / rust-analyzer LSP capability docs.
- Verus (verus-lang) tutorials; AutoVerus arXiv 2409.13082.

---

## Closing posture

The thesis stands or falls on whether AI's externalized fingerprints — tool calls, retrieved nodes, verifier outcomes — can carry the load that CoT text was hoped to carry but cannot (per the four 2025 faithfulness papers). Every architectural decision in this spec is downstream of that wager: SQLite-as-substrate so artifacts are queryable; PPR over a heterogeneous graph so retrieval IS the reasoning; Vercel AI SDK gated behind AgentRunner so no model call escapes the trace; lease+fence+OCC so the trace is causally consistent with state; cheap monitor LLM on every commit because Baker et al. showed weak monitors work and Korbak et al. showed monitorability is fragile *unless* the architecture forces it. The 9-week runway to L3 is aggressive but realistic because the dogfooding ladder makes each phase usable for the next phase's development — markdown intents become SQLite intents become graph-edited intents become drift-checked intents become tool-policed intents, on the team's own code, the whole way down.
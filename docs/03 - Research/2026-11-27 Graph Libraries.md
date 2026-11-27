---
type: research
updated: 2026-11-27
by: a research agent (sonnet), brief and synthesis by the orchestrator
---
# Graph pipeline libraries, state at 2026-11-27

Dates come from the GitHub and npm APIs and the repo pages, all opened 2026-11-27.

## Graphify

- **What it is.** Repo `Graphify-Labs/graphify` (the old `safishamsi/graphify` URL redirects there). PyPI `graphifyy`, CLI `graphify`. Python 3.11.5 to 3.14, Apache-2.0 per the GitHub license API (the README lists Apache-2.0 and MIT). Created 2026-04-03. About 154k stars. PyPI 0.9.121 was uploaded 2026-11-26, with 287 releases.
- **How it extracts.** Code goes through a local tree-sitter pass with no LLM. Docs, PDFs, images and video go through an LLM pass using the assistant's model or your API key. Each edge is tagged EXTRACTED or INFERRED.
- **Output and storage.** `graphify-out/` holds `graph.json`, `graph.html` and `GRAPH_REPORT.md`. No embeddings. Neo4j and FalkorDB push is optional.
- **Freshness.** `--update` re-extracts changed files. `graphify watch` and git hooks exist. The "always-on" live graph is the paid hosted product.
- **Proven.**
  - The AST build is free and fast. One reviewer indexed 153 PHP files in 3.4 to 3.8 s (vandeblaak, 2026-11-09).
  - Its own ERPNext test (n=6) shows 82.0% key-fact coverage against 70.8% for grep.
- **Only claimed.**
  - The 71x token reduction is one 52-file case. A six-file library showed about 1x.
  - Other numbers: 7.3x on FastAPI (a gist) and 7 to 8% saved over ten questions on browser-use.
  - A 360-trial study on Airflow, VS Code and Spring (Claude Code and Codex, 2026-10-16, by a contributor) found no clear accuracy or cost gain. Issue #985 says the same, and a second user reported 1.6 to 1.9x higher cost.
  - A blind spot: top-level code outside functions gets no edges.
  - No fully independent benchmark exists.
- **Fit for us.** It is Python, so it could only be a subprocess. Its tree-sitter extraction is no better than what we already have. Its value is the doc, PDF and image pass, which we do differently with intent specs. Verdict: borrow the EXTRACTED versus INFERRED edge tag. Do not depend on it.

## Shortlist

| Candidate | Does | License | Runtime | Last release | Incremental | Replaces | Cost | Main risk |
|---|---|---|---|---|---|---|---|---|
| colbymchenry/codegraph | Tree-sitter (Rust kernel) graph in SQLite with FTS5, MCP, npm API (`indexAll`, `getCallers`, `watch`) | MIT | Node 22.5+ | no date on page, about 79k stars | yes: OS watcher, 2 s debounce, hash reconcile | extract, freshness, retrieval | M | Its schema is not ours. TS/Vue synthesized edges can lag |
| code-review-graph | Tree-sitter graph in SQLite, blast radius, risk score, MCP | MIT | Python 3.10+ | v2.4.0, 2026-11-11 | yes, SHA-256 per file | extract, freshness, retrieval | M | Python subprocess. Benchmarks self-reported |
| codebase-memory-mcp (DeusData) | Pure C binary, SQLite, 164 grammars, Cypher-like queries | MIT | native binary | not seen | yes, watcher | extract, store | M | Opaque schema |
| GitNexus | Tree-sitter graph in LadybugDB with vectors, MCP | PolyForm Noncommercial | Node 22.18+ | v1.6.12, 2026-09-12 | yes | extract, store, retrieval | L | Noncommercial license. Out |
| CodeGraphContext | Tree-sitter plus optional SCIP into Kuzu, LadybugDB, FalkorDB or Neo4j | MIT | Python | v0.5.7, 2026-08-08 | yes | extract, store | M | Pre-1.0 |
| scip-typescript + SCIP | Compiler-accurate symbol and reference index for TS/JS | Apache-2.0 | Node | v0.6.2, 2026-11-10 | whole-project reindex | symbol identity | S to M | Slow on large repos. Protobuf index, so we write the loader |
| ast-grep | Structural search and rewrite on tree-sitter | MIT | Rust binary, npm wrapper | 0.51.3, 2026-11-16 | stateless | queries | S | Not a graph |
| LadybugDB (`@ladybugdb/core`) | Kuzu successor: Cypher, FTS, vector index | MIT | embedded, npm | v0.23.0, 2026-11-25 | n/a | store | M | Pre-1.0, small team |
| Graphiti | Temporal knowledge graph with an LLM per episode | Apache-2.0 | Python | mcp-v1.1.5, 2026-11-24 | yes | none | L | LLM on every ingest |
| LightRAG | Graph RAG with LLM entity extraction | MIT | Python | v1.5.8, 2026-11-23 | yes | retrieval for docs | L | Built for prose |
| Microsoft GraphRAG | Community-summary graph RAG | MIT | Python | v3.3.0, 2026-10-08 | partial | retrieval for docs | L | Heavy indexing cost |
| HippoRAG 2 | Personalized PageRank retrieval | MIT | Python | v1.0.0, 2025-02-27 | no | retrieval idea | M | Research code |
| Serena | LSP symbol tools over MCP | MIT and GPL-3.0 parts | Python | v2.1.0, 2026-10-19 | live, no stored graph | none | S | GPL. No persistent graph |
| stack-graphs | Name resolution on tree-sitter | Apache-2.0 | Rust | archived 2025-09 | n/a | none | n/a | Archived |

## Storage after Kuzu

- Kuzu was archived on 2025-10-10. LadybugDB is the maintained fork (v0.23.0 on 2026-11-25).
- FalkorDB is a Redis-module server, not embedded in Node. Out.
- SQLite stays sensible at 5k to 50k nodes. Recursive CTEs handle 2 to 3 hop neighbourhoods. Keep graphology in memory for PageRank. Nothing here needs Cypher.

## Drawing

| Library | Latest | Note |
|---|---|---|
| @xyflow/react | 13.0.3, 2026-11-23 | v13 is out. Breaking: `useStore` is split into separate hooks, React 18+ only, system colour mode by default, `getHandleConnections` removed. We are on v12 |
| Sigma | 4.0.6, 2026-11-10 | v4 shipped 2026-10-08. WebGL2 only, SDF labels, curved edges, node shapes |
| graphology | 0.26.0, 2025-01 | Stable, slow-moving |
| Cytoscape.js | 3.35.0, 2026-11-10 | Canvas. Comfortable to about 5k nodes |
| AntV G6 | 5.1.1, 2026-05-08 | Slower cadence |
| cosmos.gl | v3.6.0, 2026-11-04 | GPU force layout only, no hierarchical layout |
| Reagraph | 4.32.0, 2026-06-25 | Quiet since June |

## Verdicts

- **Extract: keep ours, borrow ideas.** Our tree-sitter walk plus the intent specs is the product. Use scip-typescript for symbol identity when needed. Borrow the EXTRACTED versus INFERRED edge tag, plus codegraph's hash reconcile on startup.
- **Store and query: keep ours.** SQLite and Drizzle fit one developer.
- **Freshness: borrow the idea.** A debounce of about 2 s, a per-file content hash, and a catch-up scan on start, as codegraph does. Do not adopt GumTree or mergiraf until there is a real need.
- **Retrieval: borrow the idea.** graphology personalized PageRank over our SQLite edges, plus sqlite-vec (v0.1.9, pre-1.0), exposed over MCP. No Python GraphRAG stacks.
- **Drawing: use as a dependency.** Keep React Flow with ELK for the detail view. Add Sigma 4 for an overview beyond about 5k nodes. Move to React Flow 13 only if the v12 pin hurts.
- **Before building more of extraction or freshness, test colbymchenry/codegraph on one real repo.** It is the only candidate that could replace part of it as a Node dependency.

## Sources, all opened 2026-11-27

- https://github.com/Graphify-Labs/graphify
- https://www.vandeblaak.com/blog/graphify-kennisgraaf-getest/ (2026-11-09)
- https://github.com/tirth8205/code-review-graph
- https://github.com/colbymchenry/codegraph
- https://github.com/DeusData/codebase-memory-mcp
- https://github.com/abhigyanpatwari/GitNexus
- https://github.com/CodeGraphContext/CodeGraphContext
- https://github.com/oraios/serena
- https://github.com/getzep/graphiti
- https://github.com/LadybugDB/ladybug
- https://thedataquarry.com/blog/from-kuzu-to-ladybug/ (2026-04-11)
- https://github.com/jacomyal/sigma.js/releases
- https://github.com/xyflow/xyflow/blob/main/packages/react/CHANGELOG.md
- https://github.com/cosmosgl/graph

## Not verified

- Only registry metadata, no README opened: scip-typescript, ast-grep, LightRAG, Microsoft GraphRAG, HippoRAG 2, Cognee, FalkorDB, G6, Cytoscape, Reagraph, sqlite-vec.
- Not checked at all: DuckPGQ, other Kuzu forks, mergiraf, GumTree.
- No release dates for codegraph or codebase-memory-mcp.
- No rendering benchmarks at 5k to 50k nodes in a webview.
- The 360-trial study itself and issue #985 were not opened.
- No tools launched since June 2026 were confirmed.

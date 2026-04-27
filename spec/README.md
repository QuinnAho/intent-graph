# /spec — the dogfooded intent graph

The team writes its own intents, constraints, and decisions here. The skill ingests this directory at startup and treats it as the source-of-truth seed for the graph.

- [`intents/`](./intents/) — what the system should do
- [`constraints/`](./constraints/) — verifiable narrowings of intents
- [`decisions/`](./decisions/) — in-spec decision records (not architectural — see `/docs/adr/` for those)

Every file is Markdown with YAML frontmatter. See each subdirectory's README for the schema.

> **Invariant.** The graph is the truth. JSON exports of `/spec/` are dumps, never sources. If the file and the graph disagree, the file is what we round-trip from — but neither side is authoritative without the other.

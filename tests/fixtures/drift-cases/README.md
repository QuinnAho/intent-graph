# Seeded drift cases

Each folder is one case. `node tools/drift.mjs` runs them all (or `--cases <dir>` for another set).

```
<case>/
  case.json             { "expect": "drift" | "aligned", "about": "one line" }
  spec/intents/<id>.md  a spec node with realized_by anchors (ADR-0030 format, fixtures only)
  before/<paths>        the code before the change
  after/<paths>         the code after the change
```

The runner builds a throwaway git repo per case in the OS temp folder (commit 1: spec + before, commit 2: spec + after) and runs the same pipeline as `--range`.

- `break-*` cases change behaviour the node promises. They should come back `drift`.
- `ok-*` cases do not (rename, reformat, comment, refactors that keep behaviour). They should come back `aligned`.

Reformat and comment cases are settled by the normalised hash with no model call. Add `--judge-all` to send them to the judge too.

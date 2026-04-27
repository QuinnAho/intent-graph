# Integration tests

Cross-package suites that spawn a real `@intentgraph/skill` subprocess and exercise end-to-end flows over MCP. Anything that needs to verify two packages cooperate belongs here; per-package unit tests live next to their package under `packages/<name>/tests/`.

Suites land under `suites/`. One file per scenario; suite names should describe a user-visible flow ("propose-and-accept-patch", "drift-fires-on-save").

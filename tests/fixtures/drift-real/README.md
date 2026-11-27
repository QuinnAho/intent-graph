# Proposed anchors for the real spec nodes

`anchors.json` binds thirteen real nodes under `/spec` to code, as an overlay, so `/spec` stays untouched while ADR-0030 is proposed.

These are the lane-2 builder's guesses (an agent), not confirmations. No target carries `@sig`: only a human confirmation writes one (ADR-0030 rule 3).

Run the check over the last 20 commits on `main` that touched these targets:

    node tools/drift.mjs --range 9e3b45e..main --anchors tests/fixtures/drift-real/anchors.json --last 20

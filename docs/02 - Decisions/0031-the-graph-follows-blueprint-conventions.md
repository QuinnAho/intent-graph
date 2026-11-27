# ADR 0031 — The graph follows Blueprint conventions

## Status

Accepted. Decided by the owner on 2026-11-27. Builds on ADR 0029 (visual first).

## Context

The graph is the main surface (ADR 0029). On 2026-11-27 its wires ran through boxes and labels, nodes had no visible connection points, and the flow ran top-down.

The owner's call, paraphrased: the Unreal Blueprint workflow is the goal to work toward for our node-based views. The exact words are kept in the owner's private notes.

## Decision

Node-based views follow the conventions of the Unreal Blueprint graph editor. They are adopted in this order. The ranking and its sources are in `docs/03 - Research/2026-11-27 Blueprint Style Graph.md`.

1. Pins on the sides of a node: inputs on the left, outputs on the right, flow from left to right.
2. Smooth wires between pins, coloured by kind. No wire through a label, and no wire that ends in empty space.
3. Node anatomy: a header strip coloured by kind, then rows.
4. Hover and selection make a node's wires stand out.
5. One pin per relation kind, with a label.
6. Editing by wire: drag from a pin to connect, and drop a wire on empty canvas to add a node.
7. Levels of detail when zoomed out, and reroute nodes.

Steps 1 to 4 are lane 4 of 2026-11-27. Each later step is its own lane and needs the owner's go.

## What this changes

- The layout runs left to right instead of top-down.
- A relation between spec nodes is shown as a wire between pins. This prepares editing relations on the canvas. A wire edit will write the spec file through the same writer as the side panel, with clean markdown and a conflict check, and only when a person makes it.

## Left out on purpose

- Blueprint's execution pins and compile step. A spec graph holds relations, not control flow.
- A pixel copy of the Unreal look. The conventions are followed and the visual style stays this project's own.
- Editing by wire, until the owner has seen step one.

## Fallback

If left-to-right wires read worse than the old view on real graphs, the direction is one layout option (`elk.direction`) and the wire component can be swapped per edge kind. Frames from before the change are kept in `docs/05 - Log/Frames/2026-11-27 Night 1/`.

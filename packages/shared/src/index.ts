// Barrel export for @intentgraph/shared. The only barrel allowed in this package
// — deeper folders use explicit per-file imports. Consumers should prefer the
// subpath exports (./schemas, ./types, ./protocol, ./ids) over this root barrel
// to keep tree-shaking friendly.

export * from './schemas/index.js';
export * from './types/index.js';
export * from './protocol/index.js';
export * from './ids/index.js';

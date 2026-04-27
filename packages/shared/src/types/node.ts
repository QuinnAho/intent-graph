// Derived TS types for graph nodes, inferred from the Zod row + body schemas
// in ../schemas/node.ts. Tech-spec §4.1.

export type {
  NodeKind,
  NodeConfidence,
  NodeBody,
  NodeRow,
  IntentBody,
  ConstraintBody,
  RationaleBody,
  DecisionBody,
  ConceptBody,
  CodeModuleBody,
  CodeSymbolBody,
  CounterexampleBody,
  TaskBody,
  TaskStatus,
  TaskActiveStatus,
} from '../schemas/node.js';

import type { NodeRow } from '../schemas/node.js';

// `Node` is the wire/db row shape; `body` stays as the JSON-encoded string
// that lives in the column. Application code parses `body` through the
// `NodeBodySchema` discriminated union.
export type Node = NodeRow;

// Derived TS types for obligations, inferred from ../schemas/obligation.ts.
// Tech-spec §4.3; ADR-0016 pins the kind enum.

export type {
  ObligationKind,
  ObligationSource,
  ObligationStatus,
  ObligationRow,
} from '../schemas/obligation.js';

import type { ObligationRow } from '../schemas/obligation.js';

export type Obligation = ObligationRow;

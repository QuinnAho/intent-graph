// Derived TS types for the lease + fence_seq tables. Tech-spec §4.4.

export type { LeaseScope, LeaseRow, FenceSeqRow } from '../schemas/lease.js';

import type { LeaseRow } from '../schemas/lease.js';

export type Lease = LeaseRow;

// ULID generation. All node, edge, task, and trace IDs flow through this module
// so we have a single place to change generation strategy if monotonic ordering
// or seed injection is needed.

import { ulid } from 'ulid';

export const newUlid = (): string => ulid();

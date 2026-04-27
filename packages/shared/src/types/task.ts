// Derived TS type for the materialized task_active view. Tech-spec §4.5.

export type { TaskActiveRow } from '../schemas/task.js';

import type { TaskActiveRow } from '../schemas/task.js';

export type Task = TaskActiveRow;

// Zod schema for the materialized `task_active` view (tech-spec §4.5). Tasks
// are stored in `node` rows where `kind='task'`; the view is a deterministic
// projection of the JSON body filtered to schedulable statuses.

import { z } from 'zod';

import { TaskActiveStatusSchema } from './node.js';

export const TaskActiveRowSchema = z.object({
  id: z.string(),
  status: TaskActiveStatusSchema,
  capability_id: z.string(),
  parent_task_id: z.string().nullable(),
  updated_at: z.number().int(),
});
export type TaskActiveRow = z.infer<typeof TaskActiveRowSchema>;

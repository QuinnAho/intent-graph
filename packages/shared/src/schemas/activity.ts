// Work in progress on the live graph: one entry per git worktree of the served repo,
// read from git and the run log. Paths are always from the served root, never absolute.

import { z } from 'zod';

// active: something changed inside the active window. idle: work is there, nobody touched it lately.
export const ActivityStateSchema = z.enum(['active', 'idle']);
export type ActivityState = z.infer<typeof ActivityStateSchema>;

/** One lane at work: a linked worktree, or the served checkout's own uncommitted files. */
export const LiveActivitySchema = z.object({
  /** the branch checked out there, or `detached <short sha>` */
  lane: z.string().min(1),
  /** the worktree folder as a path from the root, null for the served checkout */
  worktree: z.string().nullable(),
  state: ActivityStateSchema,
  /** ISO time of the newest change: a file time for uncommitted work or a commit time, null when nothing changed */
  changed_at: z.string().nullable(),
  /** files changed on the branch or not committed yet, counted once */
  files: z.number().int().nonnegative(),
  /** how many of those are not committed yet */
  uncommitted: z.number().int().nonnegative(),
  /** true when the lane changed more files than the server lists */
  cut: z.boolean(),
  /** from the newest run log line naming this worktree or lane, null when not known */
  role: z.string().nullable(),
  model: z.string().nullable(),
  effort: z.string().nullable(),
  task: z.string().nullable(),
});
export type LiveActivity = z.infer<typeof LiveActivitySchema>;

// changed: the node's own file changed. code_changed: a file that realizes or verifies it changed.
export const NodeTouchSchema = z.enum(['changed', 'code_changed']);
export type NodeTouch = z.infer<typeof NodeTouchSchema>;

/** One lane on a node. */
export const NodeActivitySchema = z.object({
  lane: z.string().min(1),
  state: ActivityStateSchema,
  touch: NodeTouchSchema,
});
export type NodeActivity = z.infer<typeof NodeActivitySchema>;

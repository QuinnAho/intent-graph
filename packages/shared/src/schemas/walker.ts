// Original to IntentGraph (the inline result type from claudemap/skill/lib/file-walker.js
// is split out as a shared schema so the skill and any future client share one shape).

import { z } from 'zod';

export const WalkerLanguageSchema = z.enum(['javascript', 'typescript', 'python']);
export type WalkerLanguage = z.infer<typeof WalkerLanguageSchema>;

export const WalkerFileRecordSchema = z.object({
  path: z.string(),
  relativePath: z.string(),
  name: z.string(),
  directory: z.string(),
  language: WalkerLanguageSchema,
  mtimeMs: z.number(),
  byteSize: z.number().int().nonnegative(),
});
export type WalkerFileRecord = z.infer<typeof WalkerFileRecordSchema>;

export const WalkerSnapshotSchema = z.object({
  repoRoot: z.string(),
  repoName: z.string(),
  branch: z.string(),
  generatedAt: z.string(),
  files: z.array(WalkerFileRecordSchema),
  totalFiles: z.number().int().nonnegative(),
});
export type WalkerSnapshot = z.infer<typeof WalkerSnapshotSchema>;

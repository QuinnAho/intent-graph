// Which source folders there are and which files a declared node already claims.
// Pure: the caller passes in the file list and the spec nodes.

import type { SpecNode } from '../drift/link.js';

export interface FolderPlan {
  readonly folder: string;
  /** Files no node claims. These are what the model reads. */
  readonly unclaimed: readonly string[];
  /** Files a node's realized_by already covers. */
  readonly claimed: readonly string[];
}

export function isSourceFolder(dir: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => new RegExp(p).test(dir));
}

/** True when a realized_by anchor path covers this file: the file itself, or a folder holding it. */
export function anchorCovers(anchorPath: string, file: string): boolean {
  const a = anchorPath.replace(/\/+$/, '');
  return file === a || file.startsWith(`${a}/`);
}

export function claimedBy(nodes: readonly SpecNode[], file: string): string[] {
  return nodes.filter((n) => n.realizedBy.some((a) => anchorCovers(a.path, file))).map((n) => n.id);
}

/** Group files by folder, keep the source folders that have at least one unclaimed file, in path order. */
export function planFolders(
  files: readonly { path: string; directory: string }[],
  nodes: readonly SpecNode[],
  patterns: readonly string[],
): FolderPlan[] {
  const byDir = new Map<string, string[]>();
  for (const f of files) {
    if (!isSourceFolder(f.directory, patterns)) continue;
    const list = byDir.get(f.directory) ?? [];
    list.push(f.path);
    byDir.set(f.directory, list);
  }
  const plans: FolderPlan[] = [];
  for (const folder of [...byDir.keys()].sort()) {
    const all = [...(byDir.get(folder) ?? [])].sort();
    const claimed = all.filter((p) => claimedBy(nodes, p).length > 0);
    const unclaimed = all.filter((p) => !claimed.includes(p));
    if (unclaimed.length > 0) plans.push({ folder, unclaimed, claimed });
  }
  return plans;
}

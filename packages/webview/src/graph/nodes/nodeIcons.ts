// Lifted from claudemap/app/src/components/graph/nodeIcons.js @ claudemap@vendored.
// Adapted: TS strict, typed map keyed by IntentGraph node kind (not by free-form
// icon name string). License: MIT (see /claudemap/LICENSE).
// See LIFT_LOG.md for the full lift record.

import {
  Code,
  Compass,
  FileText,
  GitBranch,
  Layers,
  Lightbulb,
  ListTree,
  ScrollText,
  ShieldCheck,
  Target,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export type NodeKind =
  | 'intent'
  | 'constraint'
  | 'rationale'
  | 'decision'
  | 'concept'
  | 'code_module'
  | 'code_symbol'
  | 'counterexample'
  | 'task';

const NODE_ICONS: Record<NodeKind, LucideIcon> = {
  intent: Target,
  constraint: ShieldCheck,
  rationale: Lightbulb,
  decision: GitBranch,
  concept: Compass,
  code_module: FileText,
  code_symbol: Code,
  counterexample: ScrollText,
  task: Wrench,
};

const FALLBACK_ICONS: Record<string, LucideIcon> = {
  layers: Layers,
  list: ListTree,
};

export function getNodeIcon(kind: NodeKind): LucideIcon {
  return NODE_ICONS[kind];
}

export function getFallbackIcon(name: keyof typeof FALLBACK_ICONS): LucideIcon {
  return FALLBACK_ICONS[name] ?? Layers;
}

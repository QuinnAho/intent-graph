// design numbers for the canvas. change them here, not in code.
export const VIEW_TUNING = {
  // vertical gap between the spec block and the code block in the layout
  specCodeGap: 240,
  // fixed width of a spec node. a 40 character title wraps to two lines with both marks beside it
  specNodeWidth: 420,
  // space between a concept's border and the intents inside it
  groupPad: 24,
  // room for the concept's own header above the intents inside it
  groupHeader: 64,
} as const;

// wires and pins, blueprint style (adr 0031). see docs/03 - Research/2026-11-27 Blueprint Style Graph.md
export const WIRE_TUNING = {
  // forward wire: control offset is half the run, held between these
  forwardMin: 40,
  forwardMax: 220,
  // backward wire: 60 plus a quarter of the run, held between these
  backBase: 60,
  backMin: 60,
  backMax: 240,
  stroke: 2,
  hoverStroke: 3,
  hitWidth: 16,
  opacity: 0.85,
  // dash for supersedes only
  dash: '6 4',
  // pin dot size and its centre from the node top, the middle of the header row
  pinSize: 10,
  pinTop: 22,
  // gap between a node's top and the "3 code" count above its pin
  countGap: 4,
  // stacking: boxes, then wires, then everything else
  zBox: 0,
  zWire: 1,
  zNode: 2,
} as const;

// wire colour by edge kind, the source pin takes the same colour
export const WIRE_COLORS: Readonly<Record<string, string>> = {
  realizes: '#78a9ff',
  constrains: '#d29922',
  decides: '#a371f7',
  justifies: '#3fb950',
  supersedes: '#8b949e',
  syncs_with: '#39c5cf',
  depends_on: '#db61a2',
  produced_by: '#6e7681',
  references: '#8b949e',
};
export const WIRE_DEFAULT_COLOR = '#8b949e';

// header strip tint by node kind
export const HEADER_COLORS: Readonly<Record<string, string>> = {
  intent: 'rgba(120, 169, 255, 0.16)',
  constraint: 'rgba(210, 153, 34, 0.16)',
  decision: 'rgba(163, 113, 247, 0.16)',
  rationale: 'rgba(63, 185, 80, 0.14)',
  concept: 'rgba(57, 197, 207, 0.12)',
  code_module: 'rgba(139, 148, 158, 0.14)',
  code_symbol: 'rgba(139, 148, 158, 0.10)',
  counterexample: 'rgba(248, 81, 73, 0.14)',
  task: 'rgba(219, 97, 162, 0.14)',
};

// elk options for every layout pass. right means left to right.
export const LAYOUT_TUNING = {
  direction: 'RIGHT',
  nodeNode: 64,
  betweenLayers: 120,
  padding: 30,
} as const;

// room a spec node's title needs, so the layout knows the node's real height.
// the node reserves room for both marks even when none shows yet, so a drift report
// arriving later never changes a node's size.
export const TITLE_TUNING = {
  // a safe average width of one character at 13px semibold, wider than real
  charPx: 7.8,
  lineHeight: 18,
  // header padding on both sides, the icon and the gaps between icon, title and marks
  headerChrome: 28 + 18 + 20,
  statusMarkPx: 100,
  driftMarkPx: 84,
  warningMarkPx: 52,
  // node height with a one line title
  baseHeight: 76,
} as const;

// the edit panel, and the room the graph keeps clear of it
export const PANEL_TUNING = {
  width: 380,
  margin: 12,
  // clear space between the panel and the node it edits
  gap: 20,
  // clear space at the other edges of the visible area
  pad: 24,
  minZoom: 0.1,
  // wait for the layout to settle after a selection before moving the view, ms
  settleMs: 250,
  // a new selection waits this long before the panel opens, so a double-click lands on the node twice, ms
  doubleClickMs: 250,
} as const;

// matching the second click of a double-click to the title the first one hit
export const EDIT_TIMING = {
  doubleClickMs: 500,
  samePointPx: 6,
} as const;

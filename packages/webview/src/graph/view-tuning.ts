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

// folded proposals (lane 12): one dashed row at a concept's foot, one box at the root for the rest
export const FOLD_TUNING = {
  // height of the row, and the room left under it to the concept's border
  rowPx: 28,
  rowGapPx: 8,
  // space between a concept's declared children and its unfolded proposals below them
  bandGap: 40,
  // the root box for proposals with no concept
  boxWidth: 320,
  boxHeight: 44,
  // the header of a concept stays this close to where it was when it folds or unfolds, px
  anchorPx: 40,
} as const;

// an intent opened in place to list its code (lane 13)
export const NEST_TUNING = {
  // height of one code row, and the room kept under the last row, px. an open node is as tall as its content,
  // so this room is the same on every node. the layout also reserves padPx per node, as spare room.
  rowPx: 26,
  padPx: 8,
  // height of the "2 code" line under the header, it fits the room a closed node already has
  togglePx: 24,
  // the title of a node that opens or closes stays this close to where it was on screen, px
  anchorPx: 40,
  // a click on a row in a browser tab brings the code node into view at this zoom at least
  revealZoom: 0.6,
  revealMs: 200,
} as const;

// fitting the graph to the canvas, the first time, on F and when the canvas changes size
export const FIT_TUNING = {
  padding: 0.2,
  maxZoom: 1.2,
  // low enough that a big graph still fits a narrow panel
  minZoom: 0.05,
  // a change of size smaller than this does not fit again, px
  refitPx: 8,
  // at most one fit again in this time, ms
  refitMs: 150,
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
  // the row of words under an inferred node's title, and the "same as" line when it restates one
  inferredRowPx: 30,
  sameAsRowPx: 20,
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

// editing by wire
export const WIRE_EDIT_TUNING = {
  // a press has to move this far before it counts as a drag, so a click stays a click, px
  dragThresholdPx: 5,
  // how near a pin a dragged wire snaps to it, px
  connectRadiusPx: 28,
  // how long a notice stays up, ms. it also goes on the next click or key
  noticeMs: 6000,
  // a graph update waits this long at most for a held node to be let go, ms
  dragHoldMaxMs: 15000,
  // a refused drop's notice is shorter, it has no button, ms
  refusedNoticeMs: 6000,
} as const;

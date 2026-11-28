// design numbers for the project state bar, the legend and the key hints (lane 11)
export const GLANCE_TUNING = {
  /** the bar is one row at the top of the page */
  barHeight: 36,
  /** the legend takes this much room right of the canvas, so it never sits on a node */
  legendWidth: 340,
  /** set once the legend has opened by itself, so it stays closed on later visits */
  legendSeenKey: 'intentgraph.legend.seen',
  /** a zero count is drawn this faint, never hidden */
  zeroOpacity: 0.45,
  robotSize: 12,
  /** room between a proposal and its key hint below it */
  hintGap: 6,
} as const;

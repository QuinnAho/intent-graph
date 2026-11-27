// choices the new-intent form offers. the kinds mirror the node kinds the server accepts
// (tests compare them with the shared schema), the default is the one preselected.
export const CREATE_TUNING = {
  targetKinds: ['intent', 'constraint', 'rationale', 'decision', 'concept', 'code_module', 'code_symbol', 'counterexample', 'task'],
  defaultTargetKinds: ['code_module'],
} as const;

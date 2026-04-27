// Monotonically increasing fence tokens, one sequence per (node_id, scope).
// Stored in SQLite to survive process restarts. Closes the Kleppmann gap;
// CAS at the row level makes lost-update impossible even on lease bugs.

export const ORCHESTRATOR_FENCE_TOKEN_SEQUENCER_PLACEHOLDER = 'fence-token-sequencer';

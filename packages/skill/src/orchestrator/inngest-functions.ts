// Inngest functions: one per task kind. Concurrency policy is
// `{ key: "event.data.intentNodeId", limit: 1 }` per node, with a fairness
// rule to prevent drift-checkers from being starved by long generation runs.

export const ORCHESTRATOR_INNGEST_FUNCTIONS_PLACEHOLDER = 'inngest-functions';

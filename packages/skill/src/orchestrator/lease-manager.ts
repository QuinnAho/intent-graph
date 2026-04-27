// Advisory (node_id, scope) lease lifecycle: acquire, heartbeat, release,
// expire. Cooperates with the fence-token sequencer; per-row OCC version
// CAS lives at the SQL layer.

export const ORCHESTRATOR_LEASE_MANAGER_PLACEHOLDER = 'lease-manager';

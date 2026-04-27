// Static-first capability matching. Declared table mapping task.kind →
// capability handler. Falls back to embedding similarity over capability
// descriptors at lookup miss; bandit selection is reserved for v2+.

export const ORCHESTRATOR_CAPABILITY_REGISTRY_PLACEHOLDER = 'capability-registry';

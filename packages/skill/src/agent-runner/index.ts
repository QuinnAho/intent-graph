// THE CHOKEPOINT.
//
// This is the only directory in the monorepo allowed to import the model-call
// surface from the `ai` package. The custom `intentgraph/agent-runner-only`
// ESLint rule enforces this at lint time.
//
// All trace recording — tool calls, retrieved node IDs, model + version,
// prompt hash, low-trust reasoning, downstream mutations, monitor verdict,
// usage, latency, cost — happens inside this module. There is no other path.

export const AGENT_RUNNER_PLACEHOLDER = 'agent-runner';

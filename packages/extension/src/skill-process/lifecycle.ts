// Lifecycle for the skill subprocess: spawn (using `intentgraph.skill.path`
// override or the bundled binary), monitor health via MCP ping, restart on
// unexpected exit with exponential backoff, kill on extension deactivate.

export const SKILL_PROCESS_LIFECYCLE_PLACEHOLDER = 'skill-process-lifecycle';

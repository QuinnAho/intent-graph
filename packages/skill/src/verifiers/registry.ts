// In-process registry of first-party verifiers. Built-ins under
// `./builtin/<name>.ts` register at module load via `register(verifier)`;
// this file imports each built-in once for its side effect.
//
// ADR-0016 §3 picks module-load side-effect registration over an explicit
// `registerBuiltins()` call at skill bootstrap. The duplicate-id guard plus
// a unit test gives us most of the safety; the cost saved is one bootstrap
// edit per new built-in.
//
// Third-party MCP plugins do NOT register here. They declare their verifier
// IDs in their MCP tool manifest at session start; the skill records them in
// a separate in-memory third-party registry, and `verify.run` delegates to
// the plugin over MCP. This file is for in-process verifiers only.

import type { Verifier } from './Verifier.js';

const verifiers = new Map<string, Verifier>();

/**
 * Register a built-in verifier. Throws on duplicate id — ADR-0016 §3 gives
 * us this as the safety against silent collisions in the side-effect-load
 * pattern.
 *
 * Idempotent for re-registering the same `Verifier` reference (the ESM
 * module cache normally prevents this, but test isolation that clears the
 * registry then re-imports a built-in module hits this path). Different
 * objects with the same id are always a collision.
 */
export function register(verifier: Verifier): void {
  const existing = verifiers.get(verifier.id);
  if (existing === verifier) {
    return; // same reference, already registered
  }
  if (existing !== undefined) {
    throw new Error(
      `verifier id collision: '${verifier.id}' is already registered. ` +
        `Each built-in under packages/skill/src/verifiers/builtin/ MUST have a unique id.`,
    );
  }
  verifiers.set(verifier.id, verifier);
}

/** Look up a registered verifier by id. Returns undefined for unknown ids. */
export function getVerifier(id: string): Verifier | undefined {
  return verifiers.get(id);
}

/**
 * Iterate all registered verifiers. Order is insertion order (Map iteration
 * order is spec-guaranteed). Used by the scheduler when an obligation does
 * not name a `verifier_id` and must be matched by `obligationKinds`.
 */
export function listVerifiers(): IterableIterator<Verifier> {
  return verifiers.values();
}

/** Test seam: clear the registry between tests. NOT for production use. */
export function _clearRegistryForTests(): void {
  verifiers.clear();
}

// Built-in registration. The registry owns the register() call to avoid the
// circular-import fragility of having each built-in import register() back
// from this file (which would still be initializing at the moment the
// built-in's top-level code ran).
//
// Adding a new built-in requires:
//   1. Create packages/skill/src/verifiers/builtin/<name>.ts that exports
//      `export const verifier: Verifier = { ... }`.
//   2. Add an import line below and a register() call.
import { coverageVerifier } from './builtin/coverage.js';

register(coverageVerifier);

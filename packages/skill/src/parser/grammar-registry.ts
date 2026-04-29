// Grammar registry for the skill-side tree-sitter walk.
//
// Tech-Spec §3.2 line 117: "Layer 0 = tree-sitter skeleton always-on" — every
// supported language has a pinned grammar that the skill loads at startup.
// Tech-Spec §7-J: "Pin grammar versions and treat ERROR/MISSING nodes as
// first-class 'unknown skeleton' nodes rather than failing." This module owns
// the pinning; the ERROR/MISSING tolerance lives in the parser walker.
//
// v1 covers TypeScript and JavaScript per the v1 stack decision (tech-spec.md:11
// "TypeScript everywhere"). Python lands in Phase 7 (tech-spec.md:483); a
// Python entry here would be premature.
//
// The registry is intentionally tiny. Capability descriptors (per tech-spec
// §2 Pillar 4 "Skills-style progressive disclosure") are noun-only — we name
// what each grammar can parse, not how to parse it. The walker in
// tree-sitter.ts decides traversal strategy per language.

import { createRequire } from 'node:module';

import type { WalkerLanguage } from '@intentgraph/shared/schemas';

export interface LanguageGrammar {
  /** Stable language id, matches WalkerLanguage from the shared schema. */
  readonly language: WalkerLanguage;
  /** File extensions this grammar should parse. The walker dispatches on this. */
  readonly extensions: readonly string[];
  /** Pinned npm package name (the grammar binding). */
  readonly packageName: string;
  /** Pinned package version — see package.json. Bumping is an ADR-level call. */
  readonly pinnedVersion: string;
  /**
   * Grammar handle returned by the package's default export. The native binding
   * is opaque to TypeScript; it is passed to `parser.setLanguage()`.
   */
  readonly grammar: unknown;
}

// Pinned versions live here for grep-ability. Bumping a grammar is a v1.x
// schema-affecting change because the AST shape changes — tech-spec §3.2 line
// 119 forbids auto-tuning hyperparameters in the inner loop, and grammar
// version is a hyperparameter. A future ADR may amend.
const PINNED_TYPESCRIPT_VERSION = '0.23.2';
const PINNED_JAVASCRIPT_VERSION = '0.23.1';

let cachedRegistry: ReadonlyMap<WalkerLanguage, LanguageGrammar> | null = null;

/**
 * Build the grammar registry. Loads the pinned grammar bindings synchronously
 * and stores them in a Map keyed by language. Idempotent — repeated calls
 * return the same Map instance, so the native bindings are loaded once per
 * process.
 *
 * Throws if a required grammar package is missing. The skill subprocess refuses
 * to start without grammars rather than degrading silently to a parser that
 * emits zero `code_symbol` rows (tech-spec.md:11 invariant 2: "Every agent
 * action wraps in a task node and emits a trace event with concrete artifacts"
 * — a parser with no grammars produces no artifacts and breaks the invariant).
 */
export function getGrammarRegistry(): ReadonlyMap<WalkerLanguage, LanguageGrammar> {
  if (cachedRegistry) return cachedRegistry;

  const tsModule = loadGrammarModule('tree-sitter-typescript');
  // tree-sitter-typescript exports two grammars: { typescript, tsx }. Both
  // share the same package version. The walker uses .typescript for .ts/.cts/.mts
  // and .tsx for .tsx — see ext-to-grammar dispatch in tree-sitter.ts.
  const typescriptGrammar = (tsModule as { typescript?: unknown }).typescript;
  const tsxGrammar = (tsModule as { tsx?: unknown }).tsx;
  if (!typescriptGrammar || !tsxGrammar) {
    throw new Error(
      `tree-sitter-typescript@${PINNED_TYPESCRIPT_VERSION} did not export the expected ` +
        `{ typescript, tsx } grammars. Pinned version may need updating.`,
    );
  }

  const javascriptModule = loadGrammarModule('tree-sitter-javascript');
  // tree-sitter-javascript exports the grammar as the module's default export.
  // Some versions also expose it as the module itself; handle both shapes.
  const javascriptGrammar =
    (javascriptModule as { default?: unknown }).default ?? javascriptModule;

  const registry = new Map<WalkerLanguage, LanguageGrammar>();
  registry.set('typescript', {
    language: 'typescript',
    // .tsx routes to the TSX variant via dispatchGrammarForExtension below; the
    // .ts/.cts/.mts list here is the non-TSX TypeScript surface.
    extensions: ['.ts', '.cts', '.mts'],
    packageName: 'tree-sitter-typescript',
    pinnedVersion: PINNED_TYPESCRIPT_VERSION,
    grammar: typescriptGrammar,
  });
  registry.set('javascript', {
    language: 'javascript',
    extensions: ['.js', '.cjs', '.mjs', '.jsx'],
    packageName: 'tree-sitter-javascript',
    pinnedVersion: PINNED_JAVASCRIPT_VERSION,
    grammar: javascriptGrammar,
  });

  cachedRegistry = registry;
  return registry;
}

/**
 * Resolve the grammar handle for a single file extension. .tsx specifically
 * routes to the TSX variant of tree-sitter-typescript even though both .ts
 * and .tsx live under the same WalkerLanguage='typescript' label.
 *
 * Returns null for extensions the registry does not cover (which the walker
 * treats as "skip this file" rather than "fail").
 */
export function dispatchGrammarForExtension(extension: string): unknown | null {
  const registry = getGrammarRegistry();
  if (extension === '.tsx') {
    // Special case: TSX uses the .tsx variant from tree-sitter-typescript.
    // Look up the registered TS grammar's package, then re-import to get the
    // TSX export. Cached because the module loader caches.
    const tsModule = loadGrammarModule('tree-sitter-typescript');
    const tsx = (tsModule as { tsx?: unknown }).tsx;
    return tsx ?? null;
  }
  for (const grammar of registry.values()) {
    if (grammar.extensions.includes(extension)) {
      return grammar.grammar;
    }
  }
  return null;
}

/** Test seam: clear the registry so a test can re-load grammars. */
export function _resetGrammarRegistryForTests(): void {
  cachedRegistry = null;
}

// CommonJS require via createRequire because tree-sitter grammar bindings are
// CJS native modules (binding.gyp / .node files) and ESM dynamic import of
// native CJS through the loader is fragile in Node 20.
const requireGrammarFn = createRequire(import.meta.url);

function loadGrammarModule(packageName: string): unknown {
  try {
    return requireGrammarFn(packageName);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load tree-sitter grammar '${packageName}'. ` +
        `Run 'pnpm install' to install pinned grammars. Underlying error: ${cause}`,
    );
  }
}

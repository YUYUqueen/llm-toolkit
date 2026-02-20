import type { ThinkingLevel } from "./types.js";
import { DEFAULT_THINKING_LEVEL_CHAIN } from "./defaults.js";

export type ThinkingDowngrader = {
  /** Get the current thinking level */
  current: () => ThinkingLevel;
  /** Try to downgrade to the next level. Returns true if downgraded, false if no more levels. */
  downgrade: () => boolean;
  /** Reset to initial level (e.g., when switching to a new provider/key) */
  reset: () => void;
};

/**
 * Creates a thinking level downgrader.
 * Uses a Set to track attempted levels, avoiding cycles.
 * Ported from OpenClaw's attemptedThinking pattern in run.ts.
 */
export function createThinkingDowngrader(params: {
  initial: ThinkingLevel;
  chain?: ThinkingLevel[];
}): ThinkingDowngrader {
  const chain = params.chain ?? DEFAULT_THINKING_LEVEL_CHAIN;
  let currentLevel = params.initial;
  const attempted = new Set<ThinkingLevel>();
  attempted.add(currentLevel);

  return {
    current() {
      return currentLevel;
    },

    downgrade() {
      // Find the current level's position in the chain
      const currentIdx = chain.indexOf(currentLevel);

      // Try each subsequent level in the chain
      const startIdx = currentIdx >= 0 ? currentIdx + 1 : 0;
      for (let i = startIdx; i < chain.length; i++) {
        const candidate = chain[i];
        if (!attempted.has(candidate)) {
          attempted.add(candidate);
          currentLevel = candidate;
          return true;
        }
      }

      return false;
    },

    reset() {
      currentLevel = params.initial;
      attempted.clear();
      attempted.add(currentLevel);
    },
  };
}

/**
 * Try to extract supported thinking levels from an error message.
 * Ported from OpenClaw's extractSupportedValues + pickFallbackThinkingLevel.
 *
 * Looks for patterns like: "supported values are: 'low', 'medium', 'high'"
 */
export function extractSupportedLevels(errorMessage: string): ThinkingLevel[] {
  const match =
    errorMessage.match(/supported values are:\s*([^\n.]+)/i) ??
    errorMessage.match(/supported values:\s*([^\n.]+)/i);

  if (!match?.[1]) return [];

  const fragment = match[1];

  // Try quoted values first: 'low', 'medium'
  const quoted = Array.from(fragment.matchAll(/['"]([^'"]+)['"]/g))
    .map((m) => m[1]?.trim())
    .filter((v): v is string => Boolean(v));

  if (quoted.length > 0) return quoted;

  // Fallback: comma/and separated
  return fragment
    .split(/,|\band\b/gi)
    .map((v) => v.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "").trim())
    .filter(Boolean);
}

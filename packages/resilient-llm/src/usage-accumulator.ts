import type { AccumulatedUsage, TokenUsage } from "./types.js";

/**
 * Normalize token usage from various SDK formats into a standard shape.
 * Handles 18+ field name variants across Anthropic, OpenAI, Google, etc.
 * Ported from OpenClaw's normalizeUsage in src/agents/usage.ts.
 */
export function normalizeUsage(raw: unknown): TokenUsage | null {
  if (!raw || typeof raw !== "object") return null;

  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

  const inputTokens =
    num(r.input) ??
    num(r.inputTokens) ??
    num(r.input_tokens) ??
    num(r.promptTokens) ??
    num(r.prompt_tokens);

  const outputTokens =
    num(r.output) ??
    num(r.outputTokens) ??
    num(r.output_tokens) ??
    num(r.completionTokens) ??
    num(r.completion_tokens);

  const cacheReadTokens =
    num(r.cacheRead) ??
    num(r.cache_read) ??
    num(r.cache_read_input_tokens) ??
    num(r.cacheReadInputTokens);

  const cacheWriteTokens =
    num(r.cacheWrite) ??
    num(r.cache_write) ??
    num(r.cache_creation_input_tokens) ??
    num(r.cacheCreationInputTokens);

  const totalTokens =
    num(r.total) ??
    num(r.totalTokens) ??
    num(r.total_tokens);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined
  ) {
    return null;
  }

  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens };
}

/**
 * Derive prompt tokens (input + cacheRead + cacheWrite) from usage.
 * This represents the actual context window utilization.
 * Ported from OpenClaw's derivePromptTokens.
 */
export function derivePromptTokens(usage: TokenUsage | null | undefined): number {
  if (!usage) return 0;
  return (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
}

export type UsageAccumulator = {
  merge: (usage: TokenUsage | null | undefined, isLastCall?: boolean) => void;
  getResult: () => AccumulatedUsage;
};

/**
 * Creates a usage accumulator that correctly handles multi-call scenarios.
 *
 * Key insight from OpenClaw (run.ts lines 895-902):
 * In tool-use loops, each API call reports cacheRead ≈ current_context_size.
 * Naively summing N calls gives N * context_size — meaningless.
 * Instead: output tokens are accumulated, prompt tokens use only the last call.
 */
export function createUsageAccumulator(): UsageAccumulator {
  let totalOutput = 0;
  let callCount = 0;
  let lastCallUsage: TokenUsage | undefined;

  return {
    merge(usage: TokenUsage | null | undefined, isLastCall = true) {
      if (!usage) return;
      callCount++;
      totalOutput += usage.outputTokens ?? 0;
      if (isLastCall) {
        lastCallUsage = usage;
      }
    },

    getResult(): AccumulatedUsage {
      return {
        totalOutputTokens: totalOutput,
        promptTokens: derivePromptTokens(lastCallUsage),
        callCount,
        lastCallUsage,
        accumulatedOutputTokens: totalOutput,
      };
    },
  };
}

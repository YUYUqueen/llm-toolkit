import type { Message, BudgetConfig, BudgetStatus, ContextBudget } from "./types.js";
import { DEFAULT_RESERVE_OUTPUT_TOKENS, DEFAULT_CHARS_PER_TOKEN } from "./defaults.js";

/**
 * Get total character count from a message's content.
 */
function getMessageChars(msg: Message): number {
  const { content } = msg;
  if (typeof content === "string") {
    return content.length;
  }
  if (!Array.isArray(content)) {
    return 0;
  }
  let total = 0;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") {
      total += b.text.length;
    } else if (b.type === "tool_result" || b.type === "tool_use") {
      // Count nested text content
      const nested = b.content ?? b.input;
      if (typeof nested === "string") {
        total += nested.length;
      } else if (typeof nested === "object") {
        total += JSON.stringify(nested).length;
      }
    }
  }
  return total;
}

/**
 * Estimate token count for an array of messages.
 * Uses a simple chars-per-token heuristic (default: 4 chars ≈ 1 token).
 */
export function estimateMessageTokens(
  messages: Message[],
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN,
): number {
  let totalChars = 0;
  for (const msg of messages) {
    totalChars += getMessageChars(msg);
  }
  return Math.ceil(totalChars / charsPerToken);
}

/**
 * Create a context budget checker.
 */
export function createContextBudget(config: BudgetConfig): ContextBudget {
  const { contextWindowTokens } = config;
  const reserveOutput = config.reserveOutputTokens ?? DEFAULT_RESERVE_OUTPUT_TOKENS;
  const charsPerToken = config.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN;
  const availableForInput = contextWindowTokens - reserveOutput;

  return {
    check(messages: Message[]): BudgetStatus {
      const estimatedTokens = estimateMessageTokens(messages, charsPerToken);
      const availableTokens = Math.max(0, availableForInput - estimatedTokens);
      const withinBudget = estimatedTokens <= availableForInput;
      const utilizationPercent =
        availableForInput > 0
          ? Math.min(100, Math.round((estimatedTokens / availableForInput) * 100))
          : 100;

      return { estimatedTokens, availableTokens, withinBudget, utilizationPercent };
    },

    estimateTokens(messages: Message[]): number {
      return estimateMessageTokens(messages, charsPerToken);
    },
  };
}

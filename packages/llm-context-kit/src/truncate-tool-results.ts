import type {
  ContentBlock,
  Message,
  TruncationConfig,
  TruncationResult,
  ToolResultTruncator,
} from "./types.js";
import { truncateText } from "./truncate-text.js";
import {
  MAX_TOOL_RESULT_CONTEXT_SHARE,
  HARD_MAX_TOOL_RESULT_CHARS,
  MIN_KEEP_CHARS,
  DEFAULT_TRUNCATION_SUFFIX,
} from "./defaults.js";

/**
 * Default tool result detection.
 * Handles both Anthropic format (content blocks with type "tool_result")
 * and OpenAI format (role "tool").
 */
function defaultIsToolResult(msg: Message): boolean {
  // OpenAI format
  if (msg.role === "tool") {
    return true;
  }
  // Anthropic format: user message containing tool_result blocks
  if (msg.role === "user" && Array.isArray(msg.content)) {
    return msg.content.some(
      (block) =>
        block && typeof block === "object" && block.type === "tool_result",
    );
  }
  return false;
}

/**
 * Get total text character count from content blocks.
 * Handles both flat text blocks and nested tool_result blocks (Anthropic format).
 */
function getBlocksTextLength(blocks: unknown[]): number {
  let total = 0;
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") {
      total += b.text.length;
    } else if (b.type === "tool_result") {
      // Anthropic format: tool_result has nested content
      const nested = b.content;
      if (typeof nested === "string") {
        total += nested.length;
      } else if (Array.isArray(nested)) {
        total += getBlocksTextLength(nested);
      }
    }
  }
  return total;
}

/**
 * Get total text character count from a message's content.
 */
function getMessageTextLength(msg: Message): number {
  const { content } = msg;
  if (typeof content === "string") {
    return content.length;
  }
  if (!Array.isArray(content)) {
    return 0;
  }
  return getBlocksTextLength(content);
}

/**
 * Recursively truncate text blocks within a content block array.
 * Handles both flat text blocks and nested tool_result content.
 */
function truncateBlocks(
  blocks: unknown[],
  totalTextChars: number,
  maxChars: number,
  minKeepChars: number,
  truncationSuffix: string,
): unknown[] {
  return blocks.map((block) => {
    if (!block || typeof block !== "object") return block;
    const b = block as Record<string, unknown>;

    if (b.type === "text" && typeof b.text === "string") {
      const blockShare = b.text.length / totalTextChars;
      const blockBudget = Math.max(
        minKeepChars,
        Math.floor(maxChars * blockShare),
      );
      return {
        ...b,
        text: truncateText(b.text, blockBudget, {
          minKeepChars,
          truncationSuffix,
        }),
      };
    }

    if (b.type === "tool_result") {
      const nested = b.content;
      if (typeof nested === "string" && nested.length > maxChars) {
        return {
          ...b,
          content: truncateText(nested, maxChars, {
            minKeepChars,
            truncationSuffix,
          }),
        };
      }
      if (Array.isArray(nested)) {
        return {
          ...b,
          content: truncateBlocks(
            nested,
            totalTextChars,
            maxChars,
            minKeepChars,
            truncationSuffix,
          ),
        };
      }
    }

    return block;
  });
}

/**
 * Truncate a single message's text content blocks to fit within maxChars.
 * Returns a new message (does not mutate the original).
 *
 * Ported from OpenClaw's truncateToolResultMessage.
 */
function truncateMessage(
  msg: Message,
  maxChars: number,
  minKeepChars: number,
  truncationSuffix: string,
): Message {
  const { content } = msg;

  // String content
  if (typeof content === "string") {
    if (content.length <= maxChars) {
      return msg;
    }
    return {
      ...msg,
      content: truncateText(content, maxChars, {
        minKeepChars,
        truncationSuffix,
      }),
    };
  }

  if (!Array.isArray(content)) {
    return msg;
  }

  const totalTextChars = getMessageTextLength(msg);
  if (totalTextChars <= maxChars) {
    return msg;
  }

  // Distribute budget proportionally among text blocks (handles nesting)
  const newContent = truncateBlocks(
    content,
    totalTextChars,
    maxChars,
    minKeepChars,
    truncationSuffix,
  );

  return { ...msg, content: newContent as ContentBlock[] };
}

/**
 * Create a tool result truncator.
 *
 * Ported from OpenClaw's tool-result-truncation.ts.
 * Strips OpenClaw-specific session management; operates on message arrays.
 */
export function createToolResultTruncator(
  config?: TruncationConfig,
): ToolResultTruncator {
  const maxContextShare =
    config?.maxContextShare ?? MAX_TOOL_RESULT_CONTEXT_SHARE;
  const hardMax = config?.hardMaxChars ?? HARD_MAX_TOOL_RESULT_CHARS;
  const minKeep = config?.minKeepChars ?? MIN_KEEP_CHARS;
  const suffix = config?.truncationSuffix ?? DEFAULT_TRUNCATION_SUFFIX;
  const isToolResult = config?.isToolResult ?? defaultIsToolResult;

  function calculateMaxChars(contextWindowTokens: number): number {
    const maxTokens = Math.floor(contextWindowTokens * maxContextShare);
    const maxChars = maxTokens * 4;
    return Math.min(maxChars, hardMax);
  }

  function isOversized(
    message: Message,
    contextWindowTokens: number,
  ): boolean {
    if (!isToolResult(message)) {
      return false;
    }
    const textLength = getMessageTextLength(message);
    return textLength > calculateMaxChars(contextWindowTokens);
  }

  function truncate(
    messages: Message[],
    contextWindowTokens: number,
  ): TruncationResult {
    const maxChars = calculateMaxChars(contextWindowTokens);
    let truncatedCount = 0;

    const newMessages = messages.map((msg) => {
      if (!isToolResult(msg)) {
        return msg;
      }
      const textLength = getMessageTextLength(msg);
      if (textLength <= maxChars) {
        return msg;
      }
      truncatedCount++;
      return truncateMessage(msg, maxChars, minKeep, suffix);
    });

    return { messages: newMessages, truncatedCount };
  }

  return { truncate, isOversized, calculateMaxChars };
}

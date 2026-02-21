import type {
  Message,
  CompressionConfig,
  CompressionResult,
  ContextCompressor,
} from "./types.js";
import {
  DEFAULT_PRESERVE_RECENT_TURNS,
  DEFAULT_COMPRESSION_TIMEOUT_MS,
  DEFAULT_SUMMARY_SYSTEM_PROMPT,
  COMPRESSION_MARKER,
} from "./defaults.js";

/**
 * Check if a message contains image content blocks.
 */
function hasImageContent(msg: Message): boolean {
  if (!Array.isArray(msg.content)) return false;
  return msg.content.some(
    (block) =>
      block &&
      typeof block === "object" &&
      (block.type === "image" || block.type === "image_url"),
  );
}

/**
 * Strip image blocks from a message, keeping only text.
 * Returns null if the message has no text content after stripping.
 */
function stripImages(msg: Message): Message | null {
  if (typeof msg.content === "string") return msg;
  if (!Array.isArray(msg.content)) return msg;

  const textBlocks = msg.content.filter(
    (block) =>
      block &&
      typeof block === "object" &&
      block.type === "text",
  );

  if (textBlocks.length === 0) return null;
  return { ...msg, content: textBlocks };
}

/**
 * Count conversation turns from the end.
 * A turn is a user message + the following assistant message(s),
 * including any tool_use/tool_result exchanges within that turn.
 *
 * Returns the index (exclusive) where the "recent" section begins.
 */
function findRecentTurnBoundary(
  messages: Message[],
  preserveTurns: number,
): number {
  if (preserveTurns <= 0) return messages.length;

  let turnsFound = 0;
  let i = messages.length - 1;

  while (i >= 0 && turnsFound < preserveTurns) {
    // Skip assistant messages and tool messages (they belong to the current turn)
    while (i >= 0 && messages[i].role !== "user") {
      i--;
    }

    if (i < 0) break;

    // Found a user message — this is the start of a turn
    // But if this user message only contains tool_result blocks (Anthropic format),
    // it's part of a tool exchange, not a real user turn
    const msg = messages[i];
    const isToolResultOnly =
      Array.isArray(msg.content) &&
      msg.content.length > 0 &&
      msg.content.every(
        (block) =>
          block && typeof block === "object" && block.type === "tool_result",
      );

    if (!isToolResultOnly) {
      turnsFound++;
    }

    i--;
  }

  // i + 1 is where the recent section starts
  return i + 1;
}

/**
 * Ensure tool_use/tool_result pairs are not split.
 * If the boundary falls in the middle of a tool exchange,
 * move it backward to include the full exchange.
 */
function adjustBoundaryForToolPairs(
  messages: Message[],
  boundary: number,
): number {
  // If boundary is at the start, nothing to adjust
  if (boundary <= 0) return 0;

  // Check if the message at boundary is a tool_result (user msg with tool_result blocks)
  // or a tool message — if so, we need to include the preceding assistant tool_use
  let adjusted = boundary;
  while (adjusted > 0) {
    const msg = messages[adjusted];
    const isToolRelated =
      msg.role === "tool" ||
      (msg.role === "user" &&
        Array.isArray(msg.content) &&
        msg.content.some(
          (block) =>
            block && typeof block === "object" && block.type === "tool_result",
        ));

    if (!isToolRelated) break;
    adjusted--;
  }

  return adjusted;
}

/**
 * Create a context compressor that summarizes old conversation messages.
 *
 * Ported from OpenClaw's compact.ts core algorithm.
 * Provider-agnostic: user provides their own LLM summarization callback.
 *
 * @example
 * ```typescript
 * const compressor = createContextCompressor({
 *   summarize: async ({ messages, systemPrompt, signal }) => {
 *     const response = await anthropic.messages.create({
 *       model: "claude-haiku-4-5-20251001",
 *       max_tokens: 4096,
 *       system: systemPrompt,
 *       messages: messages.map(m => ({ role: m.role, content: m.content })),
 *     });
 *     return response.content[0].text;
 *   },
 * });
 *
 * const result = await compressor.compress(messages);
 * if (result.compressed) {
 *   messages = result.messages; // Use compressed messages
 * }
 * ```
 */
export function createContextCompressor(
  config: CompressionConfig,
): ContextCompressor {
  const {
    summarize,
    preserveRecentTurns = DEFAULT_PRESERVE_RECENT_TURNS,
    timeoutMs = DEFAULT_COMPRESSION_TIMEOUT_MS,
    summarySystemPrompt = DEFAULT_SUMMARY_SYSTEM_PROMPT,
    logger,
  } = config;

  return {
    async compress(messages: Message[]): Promise<CompressionResult> {
      // 1. Separate system messages
      const systemMessages: Message[] = [];
      const conversation: Message[] = [];
      for (const msg of messages) {
        if (msg.role === "system") {
          systemMessages.push(msg);
        } else {
          conversation.push(msg);
        }
      }

      // 2. Find boundary between old (compressible) and recent (preserved)
      let boundary = findRecentTurnBoundary(conversation, preserveRecentTurns);
      boundary = adjustBoundaryForToolPairs(conversation, boundary);

      const oldMessages = conversation.slice(0, boundary);
      const recentMessages = conversation.slice(boundary);

      // 3. Check if there's anything to compress
      if (oldMessages.length === 0) {
        return {
          messages,
          compressed: false,
          removedCount: 0,
          description: "No messages to compress — conversation is short enough",
        };
      }

      // 4. Prepare messages for summarization (strip images)
      const messagesToSummarize = oldMessages
        .map(stripImages)
        .filter((m): m is Message => m !== null);

      if (messagesToSummarize.length === 0) {
        return {
          messages: [...systemMessages, ...recentMessages],
          compressed: true,
          removedCount: oldMessages.length,
          description: "Old messages contained only images — removed without summary",
        };
      }

      // 5. Call summarize with timeout
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let summary: string;
      try {
        summary = await summarize({
          messages: messagesToSummarize,
          systemPrompt: summarySystemPrompt,
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        const isTimeout =
          error instanceof Error && error.name === "AbortError";
        const reason = isTimeout
          ? "Compression timed out"
          : `Compression failed: ${error instanceof Error ? error.message : String(error)}`;
        logger?.warn?.(reason);
        return {
          messages,
          compressed: false,
          removedCount: 0,
          description: reason,
        };
      }
      clearTimeout(timer);

      // 6. Build compressed message array
      const summaryMessage: Message = {
        role: "user",
        content: `${COMPRESSION_MARKER}\n\n${summary}`,
      };

      const compressedMessages = [
        ...systemMessages,
        summaryMessage,
        ...recentMessages,
      ];

      logger?.info?.(
        `Compressed ${oldMessages.length} messages into summary (${summary.length} chars)`,
      );

      return {
        messages: compressedMessages,
        compressed: true,
        summary,
        removedCount: oldMessages.length,
        description: `Compressed ${oldMessages.length} messages into summary`,
      };
    },
  };
}

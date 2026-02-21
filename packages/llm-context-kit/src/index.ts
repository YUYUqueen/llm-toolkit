// Factory functions
export { createToolResultTruncator } from "./truncate-tool-results.js";
export { createContextCompressor } from "./compress-conversation.js";
export { createContextBudget, estimateMessageTokens } from "./context-budget.js";

// Pure utility
export { truncateText } from "./truncate-text.js";

// Constants
export {
  MAX_TOOL_RESULT_CONTEXT_SHARE,
  HARD_MAX_TOOL_RESULT_CHARS,
  MIN_KEEP_CHARS,
  DEFAULT_COMPRESSION_TIMEOUT_MS,
  DEFAULT_PRESERVE_RECENT_TURNS,
} from "./defaults.js";

// Types
export type {
  // Message types
  Message,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ContentBlock,
  // Truncation
  TruncateTextOptions,
  TruncationConfig,
  TruncationResult,
  ToolResultTruncator,
  // Compression
  SummaryFn,
  CompressionConfig,
  CompressionResult,
  ContextCompressor,
  // Budget
  BudgetConfig,
  BudgetStatus,
  ContextBudget,
  // Common
  Logger,
} from "./types.js";

// ===== Content Blocks =====

export type TextBlock = {
  type: "text";
  text: string;
};

export type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};

export type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content?: string | ContentBlock[];
};

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | { type: string; [key: string]: unknown };

// ===== Message =====

/**
 * Provider-agnostic message format.
 * Compatible with Anthropic and OpenAI message shapes.
 */
export type Message = {
  role: "user" | "assistant" | "system" | "tool" | (string & {});
  content: string | ContentBlock[];
  name?: string;
  tool_use_id?: string;
  [key: string]: unknown;
};

// ===== Tool Result Truncation =====

export type TruncateTextOptions = {
  /** Minimum characters to keep (default: 2_000) */
  minKeepChars?: number;
  /** Suffix appended to truncated text */
  truncationSuffix?: string;
  /** Threshold for newline-boundary optimization (default: 0.8) */
  newlineCutThreshold?: number;
};

export type TruncationConfig = {
  /** Max share of context window for a single tool result (default: 0.3) */
  maxContextShare?: number;
  /** Hard character cap for any single tool result (default: 400_000) */
  hardMaxChars?: number;
  /** Minimum characters to keep when truncating (default: 2_000) */
  minKeepChars?: number;
  /** Custom suffix appended to truncated results */
  truncationSuffix?: string;
  /** Custom function to identify tool result messages */
  isToolResult?: (msg: Message) => boolean;
};

export type TruncationResult = {
  messages: Message[];
  truncatedCount: number;
};

export type ToolResultTruncator = {
  /** Truncate oversized tool results in a message array */
  truncate: (
    messages: Message[],
    contextWindowTokens: number,
  ) => TruncationResult;
  /** Check if a single message is an oversized tool result */
  isOversized: (message: Message, contextWindowTokens: number) => boolean;
  /** Calculate max chars allowed for a given context window */
  calculateMaxChars: (contextWindowTokens: number) => number;
};

// ===== Conversation Compression =====

/**
 * User-provided LLM callback for generating summaries.
 * Provider-agnostic: user brings their own LLM client.
 */
export type SummaryFn = (params: {
  messages: Message[];
  systemPrompt: string;
  signal?: AbortSignal;
}) => Promise<string>;

export type CompressionConfig = {
  /** User-provided LLM function for summarization */
  summarize: SummaryFn;
  /** Number of recent conversation turns to preserve (default: 4) */
  preserveRecentTurns?: number;
  /** Timeout in ms for summarization call (default: 300_000) */
  timeoutMs?: number;
  /** Custom system prompt for the summarization LLM call */
  summarySystemPrompt?: string;
  /** Logger */
  logger?: Logger;
};

export type CompressionResult = {
  messages: Message[];
  compressed: boolean;
  /** Summary text that replaced old messages */
  summary?: string;
  /** How many messages were removed */
  removedCount: number;
  /** Description of what happened */
  description?: string;
};

export type ContextCompressor = {
  /** Compress a conversation by summarizing old messages */
  compress: (messages: Message[]) => Promise<CompressionResult>;
};

// ===== Context Budget =====

export type BudgetConfig = {
  /** Total context window size in tokens */
  contextWindowTokens: number;
  /** Reserve tokens for output (default: 4_096) */
  reserveOutputTokens?: number;
  /** Chars-per-token ratio for estimation (default: 4) */
  charsPerToken?: number;
};

export type BudgetStatus = {
  /** Estimated total tokens used */
  estimatedTokens: number;
  /** Available tokens remaining */
  availableTokens: number;
  /** Whether messages fit within budget */
  withinBudget: boolean;
  /** Utilization percentage (0-100) */
  utilizationPercent: number;
};

export type ContextBudget = {
  /** Check if messages fit within the context window */
  check: (messages: Message[]) => BudgetStatus;
  /** Estimate token count for messages */
  estimateTokens: (messages: Message[]) => number;
};

// ===== Logger =====

export type Logger = {
  debug?: (message: string) => void;
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

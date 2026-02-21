// ===== Tool Result Truncation =====

export const MAX_TOOL_RESULT_CONTEXT_SHARE = 0.3;

export const HARD_MAX_TOOL_RESULT_CHARS = 400_000;

export const MIN_KEEP_CHARS = 2_000;

export const DEFAULT_TRUNCATION_SUFFIX =
  "\n\n[Content truncated — original was too large for the model's context window. " +
  "The content above is a partial view. If you need more, request specific sections or use " +
  "offset/limit parameters to read smaller chunks.]";

export const NEWLINE_CUT_THRESHOLD = 0.8;

// ===== Conversation Compression =====

export const DEFAULT_PRESERVE_RECENT_TURNS = 4;

export const DEFAULT_COMPRESSION_TIMEOUT_MS = 300_000;

export const DEFAULT_SUMMARY_SYSTEM_PROMPT =
  "You are a conversation summarizer. Summarize the following conversation, preserving:\n" +
  "- Key facts and decisions made\n" +
  "- User preferences and requirements\n" +
  "- Current task state and progress\n" +
  "- Important file paths, code snippets, or technical details\n" +
  "- Any errors encountered and their resolutions\n\n" +
  "Be concise but comprehensive. Do not lose critical context.";

export const COMPRESSION_MARKER = "[Previous conversation compressed]";

// ===== Context Budget =====

export const DEFAULT_RESERVE_OUTPUT_TOKENS = 4_096;

export const DEFAULT_CHARS_PER_TOKEN = 4;

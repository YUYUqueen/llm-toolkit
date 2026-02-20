import type { ErrorClassification, ErrorClassifier, FailoverReason } from "./types.js";

// Regex patterns ported from OpenClaw's pi-embedded-helpers/errors.ts.

const RATE_LIMIT_PATTERNS: Array<RegExp | string> = [
  /rate[_ ]?limit|too many requests|429/i,
  "exceeded your current quota",
  "resource has been exhausted",
  "quota exceeded",
  "resource_exhausted",
  "usage limit",
  "throttl",
  /requests per (?:minute|hour|day)/i,
];

const AUTH_PATTERNS: Array<RegExp | string> = [
  /invalid[_ ]?api[_ ]?key/i,
  "incorrect api key",
  "invalid token",
  "authentication",
  "re-authenticate",
  "unauthorized",
  "forbidden",
  "access denied",
  "expired",
  "token has expired",
  /\b401\b/,
  /\b403\b/,
  "no credentials found",
  "no api key found",
];

const BILLING_PATTERNS: Array<RegExp | string> = [
  /(?:status|code)\s*[:=]\s*402\b|\bhttp\s*402\b|(?:got|returned|received)\s+(?:a\s+)?402\b/i,
  "payment required",
  "insufficient credits",
  "credit balance",
  "plans & billing",
  "insufficient balance",
];

const CONTEXT_OVERFLOW_PATTERNS: Array<RegExp | string> = [
  /context.*overflow/i,
  /prompt.*too (?:large|long)/i,
  /request_too_large/i,
  /request size exceeds/i,
  /context length exceeded/i,
  /maximum context length/i,
  /exceeds model context window/i,
  /input.*(?:too (?:large|long)|exceed|limit|max)/i,
];

const THINKING_UNSUPPORTED_PATTERNS: Array<RegExp | string> = [
  /thinking.*supported values/i,
  /unsupported.*thinking/i,
  /thinking.*not.*supported/i,
];

const TIMEOUT_PATTERNS: Array<RegExp | string> = [
  /timeout|timed out|deadline exceeded/i,
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNABORTED",
  "socket hang up",
];

const TRANSIENT_STATUS_CODES = new Set([500, 502, 503, 521, 522, 523, 524, 529]);

function matchesAny(text: string, patterns: Array<RegExp | string>): boolean {
  for (const pattern of patterns) {
    if (typeof pattern === "string") {
      if (text.toLowerCase().includes(pattern.toLowerCase())) return true;
    } else {
      if (pattern.test(text)) return true;
    }
  }
  return false;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    if (typeof e.error === "string") return e.error;
    if (e.error && typeof e.error === "object") {
      const inner = e.error as Record<string, unknown>;
      if (typeof inner.message === "string") return inner.message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as Record<string, unknown>;
  for (const key of ["status", "statusCode", "status_code", "code"]) {
    const val = e[key];
    if (typeof val === "number" && val >= 100 && val < 600) return val;
  }
  return undefined;
}

/**
 * Built-in error classifier.
 * Handles common SDK error shapes from Anthropic, OpenAI, Google, and generic HTTP errors.
 * Ported from OpenClaw's classifyFailoverReason + error pattern matching.
 */
export function builtinClassifyError(error: unknown): ErrorClassification {
  const message = extractErrorMessage(error);
  const status = extractStatusCode(error);

  // Status code shortcut
  if (status === 429) {
    return { reason: "rate_limit", status, message, retryable: true };
  }
  if (status === 401 || status === 403) {
    return { reason: "auth", status, message, retryable: true };
  }
  if (status === 402) {
    return { reason: "billing", status, message, retryable: true };
  }
  if (status && TRANSIENT_STATUS_CODES.has(status)) {
    return { reason: "timeout", status, message, retryable: true };
  }

  // Pattern matching on message (order matters — more specific first)
  if (matchesAny(message, CONTEXT_OVERFLOW_PATTERNS)) {
    return { reason: "context_overflow", status, message, retryable: true };
  }
  if (matchesAny(message, THINKING_UNSUPPORTED_PATTERNS)) {
    return { reason: "thinking_unsupported", status, message, retryable: true };
  }
  if (matchesAny(message, RATE_LIMIT_PATTERNS)) {
    return { reason: "rate_limit", status, message, retryable: true };
  }
  if (matchesAny(message, BILLING_PATTERNS)) {
    return { reason: "billing", status, message, retryable: true };
  }
  if (matchesAny(message, TIMEOUT_PATTERNS)) {
    return { reason: "timeout", status, message, retryable: true };
  }
  if (matchesAny(message, AUTH_PATTERNS)) {
    return { reason: "auth", status, message, retryable: true };
  }

  return { reason: "unknown", status, message, retryable: false };
}

/**
 * Creates a composite classifier: user classifier first, fallback to builtin.
 */
export function createClassifier(custom?: ErrorClassifier): (error: unknown) => ErrorClassification {
  if (!custom) return builtinClassifyError;
  return (error: unknown) => {
    const result = custom(error);
    if (result) return result;
    return builtinClassifyError(error);
  };
}

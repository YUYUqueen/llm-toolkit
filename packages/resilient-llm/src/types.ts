// ===== Error Classification =====

export type FailoverReason =
  | "rate_limit"
  | "auth"
  | "billing"
  | "context_overflow"
  | "thinking_unsupported"
  | "timeout"
  | "unknown";

export type ErrorClassification = {
  reason: FailoverReason;
  status?: number;
  message: string;
  retryable: boolean;
};

// ===== API Key & Provider =====

export type ApiKey = {
  id: string;
  value: string;
  label?: string;
};

export type ProviderConfig = {
  name: string;
  keys: ApiKey[];
  model: string;
  contextWindowTokens?: number;
};

// ===== Thinking Level =====

export type ThinkingLevel = string;

// ===== Token Usage =====

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
};

export type AccumulatedUsage = {
  totalOutputTokens: number;
  promptTokens: number;
  callCount: number;
  lastCallUsage?: TokenUsage;
  accumulatedOutputTokens: number;
};

// ===== LLM Call Adapter =====

export type CallContext = {
  provider: string;
  model: string;
  apiKey: ApiKey;
  thinkingLevel: ThinkingLevel;
  attemptNumber: number;
  providerIndex: number;
  signal?: AbortSignal;
};

export type CallResult<TResponse = unknown> = {
  response: TResponse;
  usage?: TokenUsage | Record<string, unknown>;
  lastCallUsage?: TokenUsage | Record<string, unknown>;
};

export type LLMCallFn<TResponse = unknown> = (
  ctx: CallContext,
) => Promise<CallResult<TResponse>>;

// ===== Context Compression =====

export type ContextCompressor = () => Promise<{
  compressed: boolean;
  description?: string;
} | null>;

// ===== Error Classifier =====

export type ErrorClassifier = (error: unknown) => ErrorClassification | null;

// ===== Configuration =====

export type CooldownConfig = {
  strategy: "exponential" | "fixed";
  baseMs: number;
  maxMs: number;
  factor: number;
};

export type BillingCooldownConfig = {
  baseMs: number;
  maxMs: number;
};

export type Logger = {
  debug?: (message: string) => void;
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

export type ResilientConfig = {
  providers: ProviderConfig[];
  cooldown?: Partial<CooldownConfig>;
  billingCooldown?: Partial<BillingCooldownConfig>;
  thinkingLevelChain?: ThinkingLevel[];
  maxContextCompressionAttempts?: number;
  contextCompressor?: ContextCompressor;
  timeoutMs?: number;
  classifyError?: ErrorClassifier;
  normalizeUsage?: (raw: unknown) => TokenUsage | null;
  logger?: Logger;
  onAttempt?: (record: AttemptRecord) => void;
};

export type CallOptions = {
  thinkingLevel?: ThinkingLevel;
  timeoutMs?: number;
  contextCompressor?: ContextCompressor;
  signal?: AbortSignal;
  skipProviders?: string[];
};

// ===== Result =====

export type AttemptRecord = {
  provider: string;
  model: string;
  keyId: string;
  thinkingLevel: ThinkingLevel;
  durationMs: number;
  error?: {
    reason: FailoverReason;
    message: string;
    status?: number;
  };
};

export type ResilientResult<TResponse = unknown> = {
  response: TResponse;
  provider: string;
  model: string;
  keyId: string;
  usage: AccumulatedUsage;
  thinkingLevel: ThinkingLevel;
  attempts: AttemptRecord[];
};

export type KeyHealthEntry = {
  id: string;
  provider: string;
  label?: string;
  status: "healthy" | "cooldown" | "disabled";
  cooldownUntilMs?: number;
  errorCount: number;
  lastFailureReason?: FailoverReason;
};

export type KeyHealthReport = {
  keys: KeyHealthEntry[];
};

// ===== Public API =====

export type ResilientLLM = {
  call: <TResponse = unknown>(
    callFn: LLMCallFn<TResponse>,
    options?: CallOptions,
  ) => Promise<ResilientResult<TResponse>>;
  getKeyHealth: () => KeyHealthReport;
  resetKeyCooldown: (keyId: string) => void;
  resetAllCooldowns: () => void;
};

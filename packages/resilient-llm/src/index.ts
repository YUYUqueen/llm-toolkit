export { createResilientLLM } from "./create-resilient.js";
export { ResilientError } from "./executor.js";
export { builtinClassifyError } from "./error-classifier.js";
export { normalizeUsage, derivePromptTokens } from "./usage-accumulator.js";
export { extractSupportedLevels } from "./thinking-downgrade.js";
export { calculateCooldownMs, calculateBillingCooldownMs } from "./key-tracker.js";

export type {
  // Core
  ResilientLLM,
  ResilientConfig,
  ResilientResult,
  CallOptions,
  // Adapter
  LLMCallFn,
  CallContext,
  CallResult,
  // Types
  ProviderConfig,
  ApiKey,
  ThinkingLevel,
  TokenUsage,
  AccumulatedUsage,
  // Error handling
  FailoverReason,
  ErrorClassification,
  ErrorClassifier,
  ContextCompressor,
  // Diagnostics
  AttemptRecord,
  KeyHealthReport,
  KeyHealthEntry,
  // Config
  CooldownConfig,
  BillingCooldownConfig,
  Logger,
} from "./types.js";

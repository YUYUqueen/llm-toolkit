import type { BillingCooldownConfig, CooldownConfig, ThinkingLevel } from "./types.js";

export const DEFAULT_COOLDOWN: CooldownConfig = {
  strategy: "exponential",
  baseMs: 60_000,     // 1 minute
  maxMs: 3_600_000,   // 1 hour
  factor: 5,          // 1m → 5m → 25m → 1h
};

export const DEFAULT_BILLING_COOLDOWN: BillingCooldownConfig = {
  baseMs: 18_000_000,  // 5 hours
  maxMs: 86_400_000,   // 24 hours
};

export const DEFAULT_THINKING_LEVEL_CHAIN: ThinkingLevel[] = [
  "high",
  "medium",
  "low",
  "off",
];

export const DEFAULT_MAX_CONTEXT_COMPRESSION_ATTEMPTS = 3;

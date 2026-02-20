import type {
  BillingCooldownConfig,
  CooldownConfig,
  FailoverReason,
  KeyHealthEntry,
  KeyHealthReport,
} from "./types.js";
import { DEFAULT_BILLING_COOLDOWN, DEFAULT_COOLDOWN } from "./defaults.js";

type KeyState = {
  provider: string;
  label?: string;
  errorCount: number;
  cooldownUntilMs: number;
  disabledUntilMs: number;
  lastFailureReason?: FailoverReason;
  lastFailureAt?: number;
};

/**
 * Calculate cooldown duration using exponential backoff.
 * Ported from OpenClaw's calculateAuthProfileCooldownMs.
 *
 * With defaults (base=60s, factor=5, max=1h):
 *   error 1 → 1 min
 *   error 2 → 5 min
 *   error 3 → 25 min
 *   error 4+ → 1 hour (capped)
 */
export function calculateCooldownMs(
  errorCount: number,
  config: CooldownConfig,
): number {
  const normalized = Math.max(1, errorCount);
  if (config.strategy === "fixed") {
    return Math.min(config.maxMs, config.baseMs);
  }
  const exponent = Math.min(normalized - 1, 3);
  const raw = config.baseMs * config.factor ** exponent;
  return Math.min(config.maxMs, raw);
}

/**
 * Calculate billing error cooldown (longer, uses power-of-2 backoff).
 * Ported from OpenClaw's calculateAuthProfileBillingDisableMsWithConfig.
 *
 * With defaults (base=5h, max=24h):
 *   error 1 → 5 hours
 *   error 2 → 10 hours
 *   error 3+ → 24 hours (capped)
 */
export function calculateBillingCooldownMs(
  errorCount: number,
  config: BillingCooldownConfig,
): number {
  const normalized = Math.max(1, errorCount);
  const baseMs = Math.max(60_000, config.baseMs);
  const maxMs = Math.max(baseMs, config.maxMs);
  const exponent = Math.min(normalized - 1, 10);
  const raw = baseMs * 2 ** exponent;
  return Math.min(maxMs, raw);
}

export type KeyTracker = {
  markFailure: (keyId: string, reason: FailoverReason) => void;
  markSuccess: (keyId: string) => void;
  isInCooldown: (keyId: string) => boolean;
  getHealth: () => KeyHealthReport;
  resetCooldown: (keyId: string) => void;
  resetAll: () => void;
};

export function createKeyTracker(params: {
  keys: Array<{ id: string; provider: string; label?: string }>;
  cooldown?: Partial<CooldownConfig>;
  billingCooldown?: Partial<BillingCooldownConfig>;
}): KeyTracker {
  const cooldownConfig: CooldownConfig = {
    ...DEFAULT_COOLDOWN,
    ...params.cooldown,
  };
  const billingConfig: BillingCooldownConfig = {
    ...DEFAULT_BILLING_COOLDOWN,
    ...params.billingCooldown,
  };

  const states = new Map<string, KeyState>();
  for (const key of params.keys) {
    states.set(key.id, {
      provider: key.provider,
      label: key.label,
      errorCount: 0,
      cooldownUntilMs: 0,
      disabledUntilMs: 0,
    });
  }

  function getOrCreate(keyId: string): KeyState {
    let state = states.get(keyId);
    if (!state) {
      state = {
        provider: "unknown",
        errorCount: 0,
        cooldownUntilMs: 0,
        disabledUntilMs: 0,
      };
      states.set(keyId, state);
    }
    return state;
  }

  return {
    markFailure(keyId: string, reason: FailoverReason) {
      const state = getOrCreate(keyId);
      state.errorCount++;
      state.lastFailureReason = reason;
      state.lastFailureAt = Date.now();

      if (reason === "billing") {
        const durationMs = calculateBillingCooldownMs(state.errorCount, billingConfig);
        state.disabledUntilMs = Date.now() + durationMs;
      } else {
        const durationMs = calculateCooldownMs(state.errorCount, cooldownConfig);
        state.cooldownUntilMs = Date.now() + durationMs;
      }
    },

    markSuccess(keyId: string) {
      const state = getOrCreate(keyId);
      state.errorCount = 0;
      state.cooldownUntilMs = 0;
      // Don't reset disabledUntilMs — billing errors need explicit time to pass
    },

    isInCooldown(keyId: string): boolean {
      const state = states.get(keyId);
      if (!state) return false;
      const now = Date.now();
      return now < state.cooldownUntilMs || now < state.disabledUntilMs;
    },

    getHealth(): KeyHealthReport {
      const now = Date.now();
      const keys: KeyHealthEntry[] = [];
      for (const [id, state] of states) {
        const inCooldown = now < state.cooldownUntilMs;
        const disabled = now < state.disabledUntilMs;
        keys.push({
          id,
          provider: state.provider,
          label: state.label,
          status: disabled ? "disabled" : inCooldown ? "cooldown" : "healthy",
          cooldownUntilMs: disabled
            ? state.disabledUntilMs
            : inCooldown
              ? state.cooldownUntilMs
              : undefined,
          errorCount: state.errorCount,
          lastFailureReason: state.lastFailureReason,
        });
      }
      return { keys };
    },

    resetCooldown(keyId: string) {
      const state = states.get(keyId);
      if (state) {
        state.errorCount = 0;
        state.cooldownUntilMs = 0;
        state.disabledUntilMs = 0;
        state.lastFailureReason = undefined;
      }
    },

    resetAll() {
      for (const state of states.values()) {
        state.errorCount = 0;
        state.cooldownUntilMs = 0;
        state.disabledUntilMs = 0;
        state.lastFailureReason = undefined;
      }
    },
  };
}

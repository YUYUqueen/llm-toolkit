import type { CallOptions, LLMCallFn, ResilientConfig, ResilientLLM } from "./types.js";
import { createKeyTracker } from "./key-tracker.js";
import { executeResilient } from "./executor.js";

/**
 * Create a resilient LLM caller with automatic key rotation,
 * provider fallback, thinking downgrade, and context overflow recovery.
 *
 * @example
 * ```typescript
 * const resilient = createResilientLLM({
 *   providers: [
 *     {
 *       name: 'anthropic',
 *       model: 'claude-sonnet-4-20250514',
 *       keys: [
 *         { id: 'key-1', value: process.env.ANTHROPIC_KEY_1! },
 *         { id: 'key-2', value: process.env.ANTHROPIC_KEY_2! },
 *       ],
 *     },
 *   ],
 * })
 *
 * const result = await resilient.call(async (ctx) => {
 *   const client = new Anthropic({ apiKey: ctx.apiKey.value })
 *   const response = await client.messages.create({
 *     model: ctx.model,
 *     max_tokens: 1024,
 *     messages: [{ role: 'user', content: 'Hello!' }],
 *   })
 *   return { response, usage: response.usage }
 * })
 * ```
 */
export function createResilientLLM(config: ResilientConfig): ResilientLLM {
  if (!config.providers.length) {
    throw new Error("At least one provider must be configured");
  }

  // Flatten all keys for the tracker
  const allKeys = config.providers.flatMap((p) =>
    p.keys.map((k) => ({ id: k.id, provider: p.name, label: k.label })),
  );

  const keyTracker = createKeyTracker({
    keys: allKeys,
    cooldown: config.cooldown,
    billingCooldown: config.billingCooldown,
  });

  return {
    async call<TResponse>(callFn: LLMCallFn<TResponse>, options?: CallOptions) {
      return executeResilient(callFn, options, {
        providers: config.providers,
        keyTracker,
        thinkingLevelChain: config.thinkingLevelChain,
        maxContextCompressionAttempts: config.maxContextCompressionAttempts,
        defaultTimeoutMs: config.timeoutMs,
        classifyError: config.classifyError,
        customNormalizeUsage: config.normalizeUsage,
        logger: config.logger,
        onAttempt: config.onAttempt,
      });
    },

    getKeyHealth() {
      return keyTracker.getHealth();
    },

    resetKeyCooldown(keyId: string) {
      keyTracker.resetCooldown(keyId);
    },

    resetAllCooldowns() {
      keyTracker.resetAll();
    },
  };
}

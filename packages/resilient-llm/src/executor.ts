import type {
  AttemptRecord,
  CallContext,
  CallOptions,
  CallResult,
  ContextCompressor,
  ErrorClassification,
  LLMCallFn,
  Logger,
  ProviderConfig,
  ResilientResult,
  ThinkingLevel,
} from "./types.js";
import type { KeyTracker } from "./key-tracker.js";
import { createClassifier } from "./error-classifier.js";
import { createUsageAccumulator, normalizeUsage } from "./usage-accumulator.js";
import { createThinkingDowngrader } from "./thinking-downgrade.js";
import { DEFAULT_MAX_CONTEXT_COMPRESSION_ATTEMPTS } from "./defaults.js";
import type { ErrorClassifier } from "./types.js";

export type ExecutorParams = {
  providers: ProviderConfig[];
  keyTracker: KeyTracker;
  thinkingLevelChain?: ThinkingLevel[];
  maxContextCompressionAttempts?: number;
  defaultTimeoutMs?: number;
  classifyError?: ErrorClassifier;
  customNormalizeUsage?: (raw: unknown) => import("./types.js").TokenUsage | null;
  logger?: Logger;
  onAttempt?: (record: AttemptRecord) => void;
};

/**
 * Core execution engine. Implements the resilient while(true) loop
 * ported from OpenClaw's run.ts:418-991.
 *
 * Loop structure:
 *   for each provider in fallback chain:
 *     for each key (skip cooldown):
 *       attempt call → classify error → recover or advance
 */
export async function executeResilient<TResponse>(
  callFn: LLMCallFn<TResponse>,
  options: CallOptions | undefined,
  params: ExecutorParams,
): Promise<ResilientResult<TResponse>> {
  const classify = createClassifier(params.classifyError);
  const log = params.logger ?? {};
  const maxCompressionAttempts =
    options?.contextCompressor || params.maxContextCompressionAttempts !== undefined
      ? (params.maxContextCompressionAttempts ?? DEFAULT_MAX_CONTEXT_COMPRESSION_ATTEMPTS)
      : 0;

  const usageAcc = createUsageAccumulator();
  const attempts: AttemptRecord[] = [];
  let attemptNumber = 0;
  let compressionAttempts = 0;

  const skipProviders = new Set(options?.skipProviders ?? []);

  for (let providerIdx = 0; providerIdx < params.providers.length; providerIdx++) {
    const provider = params.providers[providerIdx];
    if (skipProviders.has(provider.name)) continue;

    const thinkingDowngrader = createThinkingDowngrader({
      initial: options?.thinkingLevel ?? "off",
      chain: params.thinkingLevelChain,
    });

    for (const key of provider.keys) {
      if (params.keyTracker.isInCooldown(key.id)) {
        log.debug?.(`[resilient-llm] Skipping key ${key.id} (in cooldown)`);
        continue;
      }

      // Reset thinking for each new key
      thinkingDowngrader.reset();

      // Inner retry loop for thinking downgrade + context compression
      while (true) {
        attemptNumber++;
        const startedAt = Date.now();
        const thinkingLevel = thinkingDowngrader.current();

        const ctx: CallContext = {
          provider: provider.name,
          model: provider.model,
          apiKey: key,
          thinkingLevel,
          attemptNumber,
          providerIndex: providerIdx,
          signal: createSignal(options?.timeoutMs ?? params.defaultTimeoutMs, options?.signal),
        };

        let result: CallResult<TResponse>;
        try {
          result = await callFn(ctx);
        } catch (error) {
          const durationMs = Date.now() - startedAt;
          const classification = classify(error);

          const record: AttemptRecord = {
            provider: provider.name,
            model: provider.model,
            keyId: key.id,
            thinkingLevel,
            durationMs,
            error: {
              reason: classification.reason,
              message: classification.message,
              status: classification.status,
            },
          };
          attempts.push(record);
          params.onAttempt?.(record);

          const recovered = await tryRecover({
            classification,
            keyId: key.id,
            keyTracker: params.keyTracker,
            thinkingDowngrader,
            contextCompressor: options?.contextCompressor,
            compressionAttempts,
            maxCompressionAttempts,
            log,
          });

          if (recovered === "retry_same_key") {
            if (recovered === "retry_same_key" && classification.reason === "context_overflow") {
              compressionAttempts++;
            }
            continue; // Retry with same key (thinking downgraded or context compressed)
          }
          if (recovered === "next_key") {
            break; // Try next key
          }
          if (recovered === "next_provider") {
            break; // Will fall through to next provider
          }
          // "give_up" — throw
          throw new ResilientError(
            `All recovery strategies exhausted: ${classification.message}`,
            { attempts, lastClassification: classification },
          );
        }

        // Success!
        const durationMs = Date.now() - startedAt;
        const resolvedUsage = params.customNormalizeUsage
          ? params.customNormalizeUsage(result.usage)
          : normalizeUsage(result.usage);
        const lastCallUsage = result.lastCallUsage
          ? (params.customNormalizeUsage
              ? params.customNormalizeUsage(result.lastCallUsage)
              : normalizeUsage(result.lastCallUsage))
          : resolvedUsage;

        usageAcc.merge(lastCallUsage, true);

        const record: AttemptRecord = {
          provider: provider.name,
          model: provider.model,
          keyId: key.id,
          thinkingLevel,
          durationMs,
        };
        attempts.push(record);
        params.onAttempt?.(record);

        params.keyTracker.markSuccess(key.id);

        return {
          response: result.response,
          provider: provider.name,
          model: provider.model,
          keyId: key.id,
          usage: usageAcc.getResult(),
          thinkingLevel,
          attempts,
        };
      }
    }
  }

  // All providers/keys exhausted
  throw new ResilientError("All providers and keys exhausted", {
    attempts,
    lastClassification: attempts.at(-1)?.error
      ? {
          reason: attempts.at(-1)!.error!.reason,
          message: attempts.at(-1)!.error!.message,
          status: attempts.at(-1)!.error!.status,
          retryable: false,
        }
      : undefined,
  });
}

type RecoveryAction = "retry_same_key" | "next_key" | "next_provider" | "give_up";

async function tryRecover(params: {
  classification: ErrorClassification;
  keyId: string;
  keyTracker: KeyTracker;
  thinkingDowngrader: ReturnType<typeof createThinkingDowngrader>;
  contextCompressor: ContextCompressor | undefined;
  compressionAttempts: number;
  maxCompressionAttempts: number;
  log: Logger;
}): Promise<RecoveryAction> {
  const { classification, keyId, keyTracker, thinkingDowngrader, log } = params;

  switch (classification.reason) {
    case "thinking_unsupported": {
      // Try downgrading thinking level
      if (thinkingDowngrader.downgrade()) {
        log.warn?.(
          `[resilient-llm] Thinking level unsupported, downgrading to "${thinkingDowngrader.current()}"`,
        );
        return "retry_same_key";
      }
      // Can't downgrade further, try next key
      log.warn?.(`[resilient-llm] No more thinking levels to try for key ${keyId}`);
      return "next_key";
    }

    case "context_overflow": {
      // Try context compression
      if (params.contextCompressor && params.compressionAttempts < params.maxCompressionAttempts) {
        log.warn?.(
          `[resilient-llm] Context overflow, attempting compression (attempt ${params.compressionAttempts + 1}/${params.maxCompressionAttempts})`,
        );
        try {
          const result = await params.contextCompressor();
          if (result?.compressed) {
            log.info?.(
              `[resilient-llm] Compression succeeded: ${result.description ?? "done"}`,
            );
            return "retry_same_key";
          }
        } catch (err) {
          log.warn?.(
            `[resilient-llm] Compression failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      return "give_up";
    }

    case "rate_limit": {
      keyTracker.markFailure(keyId, "rate_limit");
      log.warn?.(`[resilient-llm] Rate limited on key ${keyId}, rotating`);
      return "next_key";
    }

    case "auth": {
      keyTracker.markFailure(keyId, "auth");
      log.warn?.(`[resilient-llm] Auth failure on key ${keyId}, rotating`);
      return "next_key";
    }

    case "billing": {
      keyTracker.markFailure(keyId, "billing");
      log.warn?.(`[resilient-llm] Billing error on key ${keyId}, trying next provider`);
      return "next_provider";
    }

    case "timeout": {
      // Treat timeout as possible rate limit (like OpenClaw does)
      keyTracker.markFailure(keyId, "timeout");
      log.warn?.(`[resilient-llm] Timeout on key ${keyId}, rotating`);
      return "next_key";
    }

    default:
      return "give_up";
  }
}

function createSignal(timeoutMs?: number, externalSignal?: AbortSignal): AbortSignal | undefined {
  if (!timeoutMs && !externalSignal) return undefined;

  const controller = new AbortController();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
      return controller.signal;
    }
    externalSignal.addEventListener("abort", () => controller.abort(externalSignal.reason), {
      once: true,
    });
  }

  if (timeoutMs) {
    const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
    // Clean up timer if signal is aborted for another reason
    controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  }

  return controller.signal;
}

// ===== Custom Error =====

export class ResilientError extends Error {
  readonly attempts: AttemptRecord[];
  readonly lastClassification?: ErrorClassification;

  constructor(
    message: string,
    opts: { attempts: AttemptRecord[]; lastClassification?: ErrorClassification },
  ) {
    super(message);
    this.name = "ResilientError";
    this.attempts = opts.attempts;
    this.lastClassification = opts.lastClassification;
  }
}

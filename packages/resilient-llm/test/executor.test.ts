import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createResilientLLM } from "../src/create-resilient.js";
import { ResilientError } from "../src/executor.js";
import type { CallContext } from "../src/types.js";

function makeConfig(overrides?: Record<string, unknown>) {
  return {
    providers: [
      {
        name: "provider-a",
        model: "model-a",
        keys: [
          { id: "a1", value: "key-a1" },
          { id: "a2", value: "key-a2" },
        ],
      },
      {
        name: "provider-b",
        model: "model-b",
        keys: [{ id: "b1", value: "key-b1" }],
      },
    ],
    ...overrides,
  };
}

describe("executor — happy path", () => {
  it("returns result on first success", async () => {
    const resilient = createResilientLLM(makeConfig());

    const result = await resilient.call(async (ctx) => ({
      response: { text: "hello" },
      usage: { input_tokens: 10, output_tokens: 5 },
    }));

    expect(result.response).toEqual({ text: "hello" });
    expect(result.provider).toBe("provider-a");
    expect(result.keyId).toBe("a1");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].error).toBeUndefined();
  });

  it("passes correct context to callFn", async () => {
    const resilient = createResilientLLM(makeConfig());
    let captured: CallContext | null = null;

    await resilient.call(async (ctx) => {
      captured = ctx;
      return { response: "ok" };
    });

    expect(captured!.provider).toBe("provider-a");
    expect(captured!.model).toBe("model-a");
    expect(captured!.apiKey.id).toBe("a1");
    expect(captured!.apiKey.value).toBe("key-a1");
    expect(captured!.attemptNumber).toBe(1);
  });
});

describe("executor — key rotation on rate limit", () => {
  it("rotates to next key on rate limit", async () => {
    const resilient = createResilientLLM(makeConfig());
    let callCount = 0;

    const result = await resilient.call(async (ctx) => {
      callCount++;
      if (ctx.apiKey.id === "a1") {
        throw new Error("rate limit exceeded");
      }
      return { response: { text: "from a2" } };
    });

    expect(result.keyId).toBe("a2");
    expect(callCount).toBe(2);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].error?.reason).toBe("rate_limit");
  });

  it("falls through to next provider when all keys rate limited", async () => {
    const resilient = createResilientLLM(makeConfig());

    const result = await resilient.call(async (ctx) => {
      if (ctx.provider === "provider-a") {
        throw new Error("rate limit exceeded");
      }
      return { response: { text: "from provider-b" } };
    });

    expect(result.provider).toBe("provider-b");
    expect(result.keyId).toBe("b1");
  });
});

describe("executor — auth failure rotation", () => {
  it("rotates key on auth error", async () => {
    const resilient = createResilientLLM(makeConfig());

    const result = await resilient.call(async (ctx) => {
      if (ctx.apiKey.id === "a1") {
        throw { status: 401, message: "unauthorized" };
      }
      return { response: "ok" };
    });

    expect(result.keyId).toBe("a2");
  });
});

describe("executor — billing error", () => {
  it("skips to next provider on billing error", async () => {
    const resilient = createResilientLLM(makeConfig());

    const result = await resilient.call(async (ctx) => {
      if (ctx.provider === "provider-a") {
        throw { status: 402, message: "payment required" };
      }
      return { response: "ok" };
    });

    expect(result.provider).toBe("provider-b");
  });
});

describe("executor — thinking level downgrade", () => {
  it("downgrades thinking level on unsupported error", async () => {
    const resilient = createResilientLLM(
      makeConfig({ thinkingLevelChain: ["high", "medium", "off"] }),
    );
    const levels: string[] = [];

    const result = await resilient.call(
      async (ctx) => {
        levels.push(ctx.thinkingLevel);
        if (ctx.thinkingLevel === "high") {
          throw new Error("thinking: supported values are: 'medium', 'off'");
        }
        return { response: "ok" };
      },
      { thinkingLevel: "high" },
    );

    expect(levels).toEqual(["high", "medium"]);
    expect(result.thinkingLevel).toBe("medium");
  });
});

describe("executor — context overflow + compression", () => {
  it("retries after successful compression", async () => {
    let compressed = false;
    const resilient = createResilientLLM(
      makeConfig({ maxContextCompressionAttempts: 3 }),
    );
    let callCount = 0;

    const result = await resilient.call(
      async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("context length exceeded");
        }
        return { response: "ok" };
      },
      {
        contextCompressor: async () => {
          compressed = true;
          return { compressed: true, description: "removed old messages" };
        },
      },
    );

    expect(compressed).toBe(true);
    expect(result.response).toBe("ok");
    expect(callCount).toBe(2);
  });

  it("gives up when compression fails", async () => {
    const resilient = createResilientLLM(
      makeConfig({ maxContextCompressionAttempts: 1 }),
    );

    await expect(
      resilient.call(
        async () => {
          throw new Error("context length exceeded");
        },
        {
          contextCompressor: async () => ({ compressed: false }),
        },
      ),
    ).rejects.toThrow(ResilientError);
  });
});

describe("executor — all exhausted", () => {
  it("throws ResilientError when all providers fail", async () => {
    const resilient = createResilientLLM(makeConfig());

    try {
      await resilient.call(async () => {
        throw new Error("some unknown permanent error");
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ResilientError);
      const re = err as ResilientError;
      expect(re.attempts.length).toBeGreaterThan(0);
    }
  });
});

describe("executor — onAttempt callback", () => {
  it("calls onAttempt for each attempt", async () => {
    const records: unknown[] = [];
    const resilient = createResilientLLM(
      makeConfig({ onAttempt: (r: unknown) => records.push(r) }),
    );

    await resilient.call(async (ctx) => {
      if (ctx.apiKey.id === "a1") throw new Error("rate limit");
      return { response: "ok" };
    });

    expect(records).toHaveLength(2);
  });
});

describe("executor — key health", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("reports key health after failures", async () => {
    const resilient = createResilientLLM(makeConfig());

    await resilient.call(async (ctx) => {
      if (ctx.apiKey.id === "a1") throw new Error("rate limit");
      return { response: "ok" };
    });

    const health = resilient.getKeyHealth();
    const a1 = health.keys.find((k) => k.id === "a1")!;
    expect(a1.status).toBe("cooldown");
    expect(a1.lastFailureReason).toBe("rate_limit");
  });

  it("resetAllCooldowns clears everything", async () => {
    const resilient = createResilientLLM(makeConfig());

    await resilient.call(async (ctx) => {
      if (ctx.apiKey.id === "a1") throw new Error("rate limit");
      return { response: "ok" };
    });

    resilient.resetAllCooldowns();
    const health = resilient.getKeyHealth();
    expect(health.keys.every((k) => k.status === "healthy")).toBe(true);
  });
});

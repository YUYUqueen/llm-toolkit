import { describe, it, expect } from "vitest";
import {
  normalizeUsage,
  derivePromptTokens,
  createUsageAccumulator,
} from "../src/usage-accumulator.js";

describe("normalizeUsage", () => {
  it("normalizes Anthropic format", () => {
    const result = normalizeUsage({
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 80,
      cache_creation_input_tokens: 20,
    });
    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 80,
      cacheWriteTokens: 20,
      totalTokens: undefined,
    });
  });

  it("normalizes OpenAI format", () => {
    const result = normalizeUsage({
      prompt_tokens: 200,
      completion_tokens: 100,
      total_tokens: 300,
    });
    expect(result).toEqual({
      inputTokens: 200,
      outputTokens: 100,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
      totalTokens: 300,
    });
  });

  it("normalizes camelCase format", () => {
    const result = normalizeUsage({
      inputTokens: 150,
      outputTokens: 75,
    });
    expect(result).toEqual({
      inputTokens: 150,
      outputTokens: 75,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
      totalTokens: undefined,
    });
  });

  it("returns null for empty/invalid input", () => {
    expect(normalizeUsage(null)).toBeNull();
    expect(normalizeUsage(undefined)).toBeNull();
    expect(normalizeUsage({})).toBeNull();
    expect(normalizeUsage({ foo: "bar" })).toBeNull();
  });

  it("ignores non-finite numbers", () => {
    expect(normalizeUsage({ input_tokens: NaN })).toBeNull();
    expect(normalizeUsage({ input_tokens: Infinity })).toBeNull();
  });
});

describe("derivePromptTokens", () => {
  it("sums input + cacheRead + cacheWrite", () => {
    expect(
      derivePromptTokens({ inputTokens: 100, cacheReadTokens: 80, cacheWriteTokens: 20 }),
    ).toBe(200);
  });

  it("handles missing fields", () => {
    expect(derivePromptTokens({ inputTokens: 100 })).toBe(100);
    expect(derivePromptTokens(null)).toBe(0);
    expect(derivePromptTokens(undefined)).toBe(0);
  });
});

describe("createUsageAccumulator", () => {
  it("accumulates output tokens across calls", () => {
    const acc = createUsageAccumulator();
    acc.merge({ inputTokens: 100, outputTokens: 50 });
    acc.merge({ inputTokens: 100, outputTokens: 30 });
    const result = acc.getResult();
    expect(result.accumulatedOutputTokens).toBe(80); // 50 + 30
    expect(result.callCount).toBe(2);
  });

  it("uses last call for prompt tokens (not accumulated)", () => {
    const acc = createUsageAccumulator();
    // Call 1: 1000 prompt tokens
    acc.merge({ inputTokens: 1000, outputTokens: 50, cacheReadTokens: 500 });
    // Call 2: 1200 prompt tokens (context grew)
    acc.merge({ inputTokens: 1200, outputTokens: 30, cacheReadTokens: 600 });

    const result = acc.getResult();
    // Prompt tokens should be from last call only (1200 + 600 = 1800)
    // NOT accumulated (1000 + 500 + 1200 + 600 = 3300 — that's the bug!)
    expect(result.promptTokens).toBe(1800);
  });

  it("returns zero for no calls", () => {
    const acc = createUsageAccumulator();
    const result = acc.getResult();
    expect(result.callCount).toBe(0);
    expect(result.promptTokens).toBe(0);
    expect(result.totalOutputTokens).toBe(0);
  });

  it("ignores null usage", () => {
    const acc = createUsageAccumulator();
    acc.merge(null);
    acc.merge(undefined);
    expect(acc.getResult().callCount).toBe(0);
  });
});

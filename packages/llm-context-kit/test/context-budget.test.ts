import { describe, it, expect } from "vitest";
import { createContextBudget, estimateMessageTokens } from "../src/context-budget.js";
import type { Message } from "../src/types.js";

function makeMsg(role: string, text: string): Message {
  return { role, content: text };
}

describe("estimateMessageTokens", () => {
  it("estimates tokens from string content", () => {
    const messages = [makeMsg("user", "a".repeat(400))];
    // 400 chars / 4 = 100 tokens
    expect(estimateMessageTokens(messages)).toBe(100);
  });

  it("estimates tokens from block array content", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "a".repeat(800) },
        ],
      },
    ];
    // 800 chars / 4 = 200 tokens
    expect(estimateMessageTokens(messages)).toBe(200);
  });

  it("sums across multiple messages", () => {
    const messages = [
      makeMsg("user", "a".repeat(400)),
      makeMsg("assistant", "b".repeat(400)),
    ];
    // 800 chars / 4 = 200 tokens
    expect(estimateMessageTokens(messages)).toBe(200);
  });

  it("uses configurable charsPerToken", () => {
    const messages = [makeMsg("user", "a".repeat(300))];
    // 300 chars / 3 = 100 tokens
    expect(estimateMessageTokens(messages, 3)).toBe(100);
  });

  it("returns 0 for empty messages", () => {
    expect(estimateMessageTokens([])).toBe(0);
  });
});

describe("createContextBudget", () => {
  describe("check", () => {
    it("returns withinBudget: true when messages fit", () => {
      const budget = createContextBudget({ contextWindowTokens: 100_000 });
      const messages = [makeMsg("user", "a".repeat(4_000))]; // ~1000 tokens
      const status = budget.check(messages);
      expect(status.withinBudget).toBe(true);
      expect(status.estimatedTokens).toBe(1_000);
    });

    it("returns withinBudget: false when messages overflow", () => {
      const budget = createContextBudget({ contextWindowTokens: 1_000 });
      // 1000 tokens context - 4096 reserve = negative available
      // Any message will overflow
      const messages = [makeMsg("user", "a".repeat(4_000))];
      const status = budget.check(messages);
      expect(status.withinBudget).toBe(false);
    });

    it("accounts for reserveOutputTokens", () => {
      const budget = createContextBudget({
        contextWindowTokens: 10_000,
        reserveOutputTokens: 2_000,
      });
      // Available: 10_000 - 2_000 = 8_000 tokens
      const messages = [makeMsg("user", "a".repeat(32_000))]; // 8_000 tokens
      const status = budget.check(messages);
      expect(status.withinBudget).toBe(true);
      expect(status.availableTokens).toBe(0);
    });

    it("calculates correct utilizationPercent", () => {
      const budget = createContextBudget({
        contextWindowTokens: 10_000,
        reserveOutputTokens: 0,
      });
      // 10_000 available, use 5_000
      const messages = [makeMsg("user", "a".repeat(20_000))]; // 5_000 tokens
      const status = budget.check(messages);
      expect(status.utilizationPercent).toBe(50);
    });

    it("handles edge case of 0 messages", () => {
      const budget = createContextBudget({ contextWindowTokens: 100_000 });
      const status = budget.check([]);
      expect(status.withinBudget).toBe(true);
      expect(status.estimatedTokens).toBe(0);
      expect(status.utilizationPercent).toBe(0);
    });
  });
});

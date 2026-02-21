import { describe, it, expect, vi } from "vitest";
import { createContextCompressor } from "../src/compress-conversation.js";
import type { Message, SummaryFn } from "../src/types.js";
import { COMPRESSION_MARKER } from "../src/defaults.js";

function makeMsg(role: string, content: string): Message {
  return { role, content };
}

function makeToolExchange(): Message[] {
  return [
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "call_1",
          name: "read_file",
          input: { path: "/tmp/test.txt" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "call_1",
          content: [{ type: "text", text: "file contents here" }],
        },
      ],
    },
  ];
}

const mockSummarize: SummaryFn = vi.fn(async ({ messages }) => {
  return `Summary of ${messages.length} messages`;
});

function buildConversation(turnCount: number): Message[] {
  const messages: Message[] = [makeMsg("system", "You are a helpful assistant.")];
  for (let i = 0; i < turnCount; i++) {
    messages.push(makeMsg("user", `Question ${i + 1}`));
    messages.push(makeMsg("assistant", `Answer ${i + 1}`));
  }
  return messages;
}

describe("createContextCompressor", () => {
  describe("compress", () => {
    it("preserves system message at index 0", async () => {
      const compressor = createContextCompressor({
        summarize: mockSummarize,
        preserveRecentTurns: 2,
      });
      const messages = buildConversation(6);
      const result = await compressor.compress(messages);
      expect(result.compressed).toBe(true);
      expect(result.messages[0]).toBe(messages[0]); // system msg preserved
      expect(result.messages[0].role).toBe("system");
    });

    it("preserves recent N turns", async () => {
      const compressor = createContextCompressor({
        summarize: mockSummarize,
        preserveRecentTurns: 2,
      });
      const messages = buildConversation(6);
      const result = await compressor.compress(messages);
      expect(result.compressed).toBe(true);
      // Last 4 messages (2 turns) should be preserved
      const lastOriginal = messages.slice(-4);
      const lastCompressed = result.messages.slice(-4);
      expect(lastCompressed).toEqual(lastOriginal);
    });

    it("calls summarize with old messages", async () => {
      const spy = vi.fn<SummaryFn>(async () => "summary");
      const compressor = createContextCompressor({
        summarize: spy,
        preserveRecentTurns: 1,
      });
      const messages = buildConversation(4);
      await compressor.compress(messages);

      expect(spy).toHaveBeenCalledOnce();
      const call = spy.mock.calls[0][0];
      // Should receive old messages (not system, not recent 1 turn)
      expect(call.messages.length).toBeGreaterThan(0);
      expect(call.systemPrompt).toBeDefined();
    });

    it("replaces old messages with compression marker + summary", async () => {
      const compressor = createContextCompressor({
        summarize: async () => "This is the summary.",
        preserveRecentTurns: 1,
      });
      const messages = buildConversation(4);
      const result = await compressor.compress(messages);

      // Find the summary message
      const summaryMsg = result.messages.find(
        (m) =>
          typeof m.content === "string" &&
          m.content.includes(COMPRESSION_MARKER),
      );
      expect(summaryMsg).toBeDefined();
      expect(summaryMsg!.content).toContain("This is the summary.");
      expect(summaryMsg!.role).toBe("user");
    });

    it("handles tool_use/tool_result pairs atomically", async () => {
      const spy = vi.fn<SummaryFn>(async () => "summary");
      const compressor = createContextCompressor({
        summarize: spy,
        preserveRecentTurns: 1,
      });

      const messages: Message[] = [
        makeMsg("system", "system prompt"),
        makeMsg("user", "old question"),
        makeMsg("assistant", "old answer"),
        // Tool exchange
        ...makeToolExchange(),
        // Recent turn
        makeMsg("user", "recent question"),
        makeMsg("assistant", "recent answer"),
      ];

      const result = await compressor.compress(messages);
      expect(result.compressed).toBe(true);

      // The recent turn should be preserved
      const lastTwo = result.messages.slice(-2);
      expect(lastTwo[0].content).toBe("recent question");
      expect(lastTwo[1].content).toBe("recent answer");
    });

    it("discards image blocks from compressed region", async () => {
      const spy = vi.fn<SummaryFn>(async () => "summary");
      const compressor = createContextCompressor({
        summarize: spy,
        preserveRecentTurns: 1,
      });

      const messages: Message[] = [
        makeMsg("system", "system prompt"),
        {
          role: "user",
          content: [
            { type: "text", text: "Look at this image" },
            { type: "image", source: { data: "base64..." } },
          ],
        },
        makeMsg("assistant", "I see the image"),
        makeMsg("user", "recent question"),
        makeMsg("assistant", "recent answer"),
      ];

      await compressor.compress(messages);

      // The messages sent to summarize should not contain image blocks
      const summarizeMessages = spy.mock.calls[0][0].messages;
      for (const msg of summarizeMessages) {
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            expect((block as { type: string }).type).not.toBe("image");
          }
        }
      }
    });

    it("returns compressed: false when nothing to compress", async () => {
      const compressor = createContextCompressor({
        summarize: mockSummarize,
        preserveRecentTurns: 4,
      });
      // Only 2 turns — within the preserve window
      const messages = buildConversation(2);
      const result = await compressor.compress(messages);
      expect(result.compressed).toBe(false);
      expect(result.messages).toBe(messages);
    });

    it("returns compressed: false when only system + recent turns exist", async () => {
      const compressor = createContextCompressor({
        summarize: mockSummarize,
        preserveRecentTurns: 4,
      });
      const messages = [
        makeMsg("system", "system prompt"),
        makeMsg("user", "hello"),
        makeMsg("assistant", "hi"),
      ];
      const result = await compressor.compress(messages);
      expect(result.compressed).toBe(false);
    });

    it("respects configurable preserveRecentTurns", async () => {
      const compressor = createContextCompressor({
        summarize: async () => "summary",
        preserveRecentTurns: 3,
      });
      const messages = buildConversation(6);
      const result = await compressor.compress(messages);
      // 3 turns = 6 messages preserved + system + summary
      expect(result.messages.length).toBe(1 + 1 + 6); // system + summary + 3 turns
    });

    it("aborts on timeout", async () => {
      const compressor = createContextCompressor({
        summarize: async ({ signal }) => {
          // Simulate slow operation
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve("summary"), 10_000);
            signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            });
          });
        },
        preserveRecentTurns: 1,
        timeoutMs: 50,
      });
      const messages = buildConversation(4);
      const result = await compressor.compress(messages);
      expect(result.compressed).toBe(false);
      expect(result.description).toContain("timed out");
    });

    it("propagates summarize errors gracefully", async () => {
      const compressor = createContextCompressor({
        summarize: async () => {
          throw new Error("API rate limit");
        },
        preserveRecentTurns: 1,
      });
      const messages = buildConversation(4);
      const result = await compressor.compress(messages);
      expect(result.compressed).toBe(false);
      expect(result.description).toContain("API rate limit");
    });

    it("passes correct system prompt to summarize callback", async () => {
      const customPrompt = "Summarize focusing on code changes only.";
      const spy = vi.fn<SummaryFn>(async () => "summary");
      const compressor = createContextCompressor({
        summarize: spy,
        preserveRecentTurns: 1,
        summarySystemPrompt: customPrompt,
      });
      const messages = buildConversation(4);
      await compressor.compress(messages);
      expect(spy.mock.calls[0][0].systemPrompt).toBe(customPrompt);
    });

    it("preserves messages immutably", async () => {
      const compressor = createContextCompressor({
        summarize: async () => "summary",
        preserveRecentTurns: 1,
      });
      const messages = buildConversation(4);
      const original = [...messages];
      await compressor.compress(messages);
      // Original array should be untouched
      expect(messages).toEqual(original);
    });

    it("handles messages with no system message", async () => {
      const compressor = createContextCompressor({
        summarize: async () => "summary",
        preserveRecentTurns: 1,
      });
      const messages = [
        makeMsg("user", "q1"),
        makeMsg("assistant", "a1"),
        makeMsg("user", "q2"),
        makeMsg("assistant", "a2"),
        makeMsg("user", "q3"),
        makeMsg("assistant", "a3"),
      ];
      const result = await compressor.compress(messages);
      expect(result.compressed).toBe(true);
      // No system message, so first should be summary
      expect((result.messages[0].content as string)).toContain(COMPRESSION_MARKER);
    });
  });
});

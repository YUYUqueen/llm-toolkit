import { describe, it, expect } from "vitest";
import { createPromptAssembler } from "../src/assembler.js";

type TestContext = {
  tools: string[];
  isMinimal: boolean;
  userName?: string;
};

describe("createPromptAssembler", () => {
  describe("build", () => {
    it("assembles static content sections", () => {
      const assembler = createPromptAssembler({
        sections: [
          { name: "identity", content: "You are a helpful assistant." },
          { name: "rules", content: "Be concise." },
        ],
      });
      const result = assembler.build({});
      expect(result).toBe("You are a helpful assistant.\nBe concise.");
    });

    it("assembles static content as string array", () => {
      const assembler = createPromptAssembler({
        sections: [
          { name: "rules", content: ["Rule 1", "Rule 2"] },
        ],
      });
      const result = assembler.build({});
      expect(result).toBe("Rule 1\nRule 2");
    });

    it("assembles dynamic builder sections", () => {
      const assembler = createPromptAssembler<TestContext>({
        sections: [
          {
            name: "tools",
            builder: (ctx) => ctx.tools.map((t) => `- ${t}`),
          },
        ],
      });
      const result = assembler.build({
        tools: ["read", "write"],
        isMinimal: false,
      });
      expect(result).toBe("- read\n- write");
    });

    it("handles builder returning string", () => {
      const assembler = createPromptAssembler({
        sections: [
          { name: "greeting", builder: () => "Hello!" },
        ],
      });
      expect(assembler.build({})).toBe("Hello!");
    });

    it("handles builder returning null", () => {
      const assembler = createPromptAssembler({
        sections: [
          { name: "identity", content: "I am an assistant." },
          { name: "empty", builder: () => null },
          { name: "rules", content: "Be helpful." },
        ],
      });
      const result = assembler.build({});
      expect(result).toBe("I am an assistant.\nBe helpful.");
    });

    it("handles builder returning empty array", () => {
      const assembler = createPromptAssembler({
        sections: [
          { name: "identity", content: "Hi" },
          { name: "empty", builder: () => [] },
          { name: "rules", content: "Bye" },
        ],
      });
      expect(assembler.build({})).toBe("Hi\nBye");
    });

    it("skips sections when 'when' returns false", () => {
      const assembler = createPromptAssembler<TestContext>({
        sections: [
          { name: "identity", content: "Assistant" },
          {
            name: "advanced",
            content: "Advanced features enabled.",
            when: (ctx) => !ctx.isMinimal,
          },
        ],
      });
      const minimal = assembler.build({ tools: [], isMinimal: true });
      expect(minimal).toBe("Assistant");

      const full = assembler.build({ tools: [], isMinimal: false });
      expect(full).toBe("Assistant\nAdvanced features enabled.");
    });

    it("includes sections when 'when' returns true", () => {
      const assembler = createPromptAssembler<TestContext>({
        sections: [
          {
            name: "greeting",
            builder: (ctx) => `Hello ${ctx.userName}!`,
            when: (ctx) => !!ctx.userName,
          },
        ],
      });
      expect(assembler.build({ tools: [], isMinimal: false, userName: "Alice" }))
        .toBe("Hello Alice!");
    });

    it("mixes static and dynamic sections", () => {
      const assembler = createPromptAssembler<TestContext>({
        sections: [
          { name: "identity", content: "You are an assistant." },
          {
            name: "tools",
            builder: (ctx) =>
              ctx.tools.length > 0
                ? ["## Tools", ...ctx.tools.map((t) => `- ${t}`)]
                : null,
          },
          { name: "footer", content: "Be helpful." },
        ],
      });
      const result = assembler.build({
        tools: ["read", "exec"],
        isMinimal: false,
      });
      expect(result).toContain("You are an assistant.");
      expect(result).toContain("## Tools");
      expect(result).toContain("- read");
      expect(result).toContain("Be helpful.");
    });

    it("uses custom separator", () => {
      const assembler = createPromptAssembler({
        sections: [
          { name: "a", content: "Section A" },
          { name: "b", content: "Section B" },
        ],
        separator: "\n\n",
      });
      expect(assembler.build({})).toBe("Section A\n\nSection B");
    });

    it("handles empty sections array", () => {
      const assembler = createPromptAssembler({ sections: [] });
      expect(assembler.build({})).toBe("");
    });

    it("preserves section order", () => {
      const assembler = createPromptAssembler({
        sections: [
          { name: "first", content: "1" },
          { name: "second", content: "2" },
          { name: "third", content: "3" },
        ],
      });
      expect(assembler.build({})).toBe("1\n2\n3");
    });

    it("builder takes priority over static content", () => {
      const assembler = createPromptAssembler({
        sections: [
          {
            name: "test",
            content: "static",
            builder: () => "dynamic",
          },
        ],
      });
      expect(assembler.build({})).toBe("dynamic");
    });
  });

  describe("buildSections", () => {
    it("returns a Map of section name to content", () => {
      const assembler = createPromptAssembler({
        sections: [
          { name: "identity", content: "Assistant" },
          { name: "rules", content: ["Rule 1", "Rule 2"] },
        ],
      });
      const map = assembler.buildSections({});
      expect(map.size).toBe(2);
      expect(map.get("identity")).toBe("Assistant");
      expect(map.get("rules")).toBe("Rule 1\nRule 2");
    });

    it("excludes skipped sections from Map", () => {
      const assembler = createPromptAssembler<TestContext>({
        sections: [
          { name: "identity", content: "Hi" },
          { name: "advanced", content: "Extra", when: (ctx) => !ctx.isMinimal },
        ],
      });
      const map = assembler.buildSections({ tools: [], isMinimal: true });
      expect(map.size).toBe(1);
      expect(map.has("advanced")).toBe(false);
    });
  });

  describe("estimateTokens", () => {
    it("estimates tokens with default chars-per-token", () => {
      const assembler = createPromptAssembler({
        sections: [{ name: "content", content: "a".repeat(400) }],
      });
      // 400 chars / 4 = 100 tokens
      expect(assembler.estimateTokens({})).toBe(100);
    });

    it("uses custom chars-per-token", () => {
      const assembler = createPromptAssembler({
        sections: [{ name: "content", content: "a".repeat(300) }],
      });
      // 300 chars / 3 = 100 tokens
      expect(assembler.estimateTokens({}, 3)).toBe(100);
    });

    it("returns 0 for empty prompt", () => {
      const assembler = createPromptAssembler({ sections: [] });
      expect(assembler.estimateTokens({})).toBe(0);
    });
  });
});

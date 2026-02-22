import { describe, it, expect } from "vitest";
import { createPromptAssembler } from "../src/assembler.js";
import {
  safety,
  toolCallStyle,
  dateTime,
  memoryRecall,
  commonSections,
} from "../src/common-sections.js";

describe("safety", () => {
  it("returns a section with safety guardrails", () => {
    const section = safety();
    expect(section.name).toBe("safety");
    expect(section.content).toBeDefined();
    const lines = section.content as string[];
    expect(lines[0]).toBe("## Safety");
    expect(lines.some((l) => l.includes("self-preservation"))).toBe(true);
  });
});

describe("toolCallStyle", () => {
  it("returns a section with tool call narration rules", () => {
    const section = toolCallStyle();
    expect(section.name).toBe("tool-call-style");
    const lines = section.content as string[];
    expect(lines[0]).toBe("## Tool Call Style");
    expect(lines.some((l) => l.includes("narrate"))).toBe(true);
  });
});

describe("dateTime", () => {
  it("returns a dynamic section with timezone info", () => {
    const section = dateTime({ timezone: "Asia/Shanghai" });
    expect(section.name).toBe("date-time");
    expect(section.builder).toBeDefined();
    expect(section.content).toBeUndefined();

    const lines = section.builder!({} as never);
    expect(lines).toBeInstanceOf(Array);
    const arr = lines as string[];
    expect(arr[0]).toBe("## Current Date & Time");
    expect(arr[1]).toBe("Timezone: Asia/Shanghai");
    expect(arr[2]).toMatch(/^Now: /);
  });

  it("accepts custom locale", () => {
    const section = dateTime({ timezone: "America/New_York", locale: "zh-CN" });
    const lines = section.builder!({} as never) as string[];
    expect(lines[1]).toBe("Timezone: America/New_York");
  });
});

describe("memoryRecall", () => {
  it("returns defaults with citations", () => {
    const section = memoryRecall();
    expect(section.name).toBe("memory-recall");
    const lines = section.content as string[];
    expect(lines[0]).toBe("## Memory Recall");
    expect(lines.some((l) => l.includes("memory_search"))).toBe(true);
    expect(lines.some((l) => l.includes("memory_get"))).toBe(true);
    expect(lines.some((l) => l.includes("Citations"))).toBe(true);
  });

  it("uses custom tool names", () => {
    const section = memoryRecall({
      searchToolName: "search_mem",
      getToolName: "get_mem",
    });
    const lines = section.content as string[];
    expect(lines.some((l) => l.includes("search_mem"))).toBe(true);
    expect(lines.some((l) => l.includes("get_mem"))).toBe(true);
  });

  it("omits citations when disabled", () => {
    const section = memoryRecall({ citations: false });
    const lines = section.content as string[];
    expect(lines.some((l) => l.includes("Citations"))).toBe(false);
  });
});

describe("commonSections namespace", () => {
  it("exports all four builders", () => {
    expect(commonSections.safety).toBe(safety);
    expect(commonSections.toolCallStyle).toBe(toolCallStyle);
    expect(commonSections.dateTime).toBe(dateTime);
    expect(commonSections.memoryRecall).toBe(memoryRecall);
  });
});

describe("integration with createPromptAssembler", () => {
  it("assembles prompt with common sections", () => {
    const prompt = createPromptAssembler({
      sections: [
        { name: "identity", content: "You are a helpful assistant." },
        commonSections.safety(),
        commonSections.toolCallStyle(),
        commonSections.dateTime({ timezone: "UTC" }),
        commonSections.memoryRecall(),
      ],
    });

    const result = prompt.build({});
    expect(result).toContain("You are a helpful assistant.");
    expect(result).toContain("## Safety");
    expect(result).toContain("## Tool Call Style");
    expect(result).toContain("## Current Date & Time");
    expect(result).toContain("## Memory Recall");
  });
});

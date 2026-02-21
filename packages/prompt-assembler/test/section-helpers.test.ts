import { describe, it, expect } from "vitest";
import {
  formatToolList,
  formatContextFiles,
  formatRuntimeInfo,
} from "../src/section-helpers.js";

describe("formatToolList", () => {
  it("formats tools with summaries", () => {
    const result = formatToolList([
      { name: "read", summary: "Read file contents" },
      { name: "exec", summary: "Run shell commands" },
    ]);
    expect(result).toEqual([
      "## Tools",
      "- read: Read file contents",
      "- exec: Run shell commands",
      "",
    ]);
  });

  it("formats tools without summaries", () => {
    const result = formatToolList([{ name: "read" }, { name: "exec" }]);
    expect(result).toEqual(["## Tools", "- read", "- exec", ""]);
  });

  it("deduplicates case-insensitively, preserving first casing", () => {
    const result = formatToolList([
      { name: "Read", summary: "First" },
      { name: "read", summary: "Duplicate" },
      { name: "READ", summary: "Another" },
    ]);
    expect(result).toEqual(["## Tools", "- Read: First", ""]);
  });

  it("returns empty array for no tools", () => {
    expect(formatToolList([])).toEqual([]);
  });

  it("uses custom header", () => {
    const result = formatToolList(
      [{ name: "read" }],
      "### Available Tools",
    );
    expect(result[0]).toBe("### Available Tools");
  });
});

describe("formatContextFiles", () => {
  it("formats a single file", () => {
    const result = formatContextFiles([
      { path: "CLAUDE.md", content: "# Project\nDetails here." },
    ]);
    expect(result).toEqual([
      "## CLAUDE.md",
      "",
      "# Project\nDetails here.",
      "",
    ]);
  });

  it("formats multiple files", () => {
    const result = formatContextFiles([
      { path: "a.md", content: "AAA" },
      { path: "b.md", content: "BBB" },
    ]);
    expect(result).toEqual([
      "## a.md", "", "AAA", "",
      "## b.md", "", "BBB", "",
    ]);
  });

  it("returns empty array for no files", () => {
    expect(formatContextFiles([])).toEqual([]);
  });

  it("uses custom header prefix", () => {
    const result = formatContextFiles(
      [{ path: "test.md", content: "content" }],
      "###",
    );
    expect(result[0]).toBe("### test.md");
  });
});

describe("formatRuntimeInfo", () => {
  it("formats key-value pairs", () => {
    const result = formatRuntimeInfo({
      os: "Darwin",
      model: "claude-opus-4",
      node: "v20",
    });
    expect(result).toEqual([
      "Runtime: os=Darwin model=claude-opus-4 node=v20",
    ]);
  });

  it("filters out undefined values", () => {
    const result = formatRuntimeInfo({
      os: "Darwin",
      model: undefined,
      node: "v20",
    });
    expect(result).toEqual(["Runtime: os=Darwin node=v20"]);
  });

  it("returns empty array when all values undefined", () => {
    const result = formatRuntimeInfo({
      os: undefined,
      model: undefined,
    });
    expect(result).toEqual([]);
  });

  it("returns empty array for empty object", () => {
    expect(formatRuntimeInfo({})).toEqual([]);
  });

  it("uses custom prefix", () => {
    const result = formatRuntimeInfo({ os: "Linux" }, "Env:");
    expect(result).toEqual(["Env: os=Linux"]);
  });
});

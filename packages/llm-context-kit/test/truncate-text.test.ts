import { describe, it, expect } from "vitest";
import { truncateText } from "../src/truncate-text.js";
import { DEFAULT_TRUNCATION_SUFFIX, MIN_KEEP_CHARS } from "../src/defaults.js";

describe("truncateText", () => {
  it("returns text unchanged when under limit", () => {
    const text = "Hello, world!";
    expect(truncateText(text, 100)).toBe(text);
  });

  it("returns text unchanged when exactly at limit", () => {
    const text = "abc";
    expect(truncateText(text, 3)).toBe(text);
  });

  it("truncates long text and appends suffix", () => {
    const text = "a".repeat(10_000);
    const result = truncateText(text, 5_000);
    expect(result.length).toBeLessThan(text.length);
    expect(result).toContain("[Content truncated");
  });

  it("respects MIN_KEEP_CHARS minimum", () => {
    // maxChars very small, but should still keep MIN_KEEP_CHARS
    const text = "a".repeat(5_000);
    const result = truncateText(text, 100);
    // Should keep at least MIN_KEEP_CHARS of original content
    const contentBeforeSuffix = result.slice(
      0,
      result.indexOf(DEFAULT_TRUNCATION_SUFFIX),
    );
    expect(contentBeforeSuffix.length).toBeGreaterThanOrEqual(MIN_KEEP_CHARS);
  });

  it("cuts at newline boundary when within 80% threshold", () => {
    // Build text with a newline at 85% of keepChars
    const keepChars = 5_000 - DEFAULT_TRUNCATION_SUFFIX.length;
    const newlinePos = Math.floor(keepChars * 0.85);
    const text =
      "x".repeat(newlinePos) + "\n" + "y".repeat(10_000 - newlinePos);

    const result = truncateText(text, 5_000);
    const contentBeforeSuffix = result.slice(
      0,
      result.indexOf(DEFAULT_TRUNCATION_SUFFIX),
    );
    // Should cut at the newline
    expect(contentBeforeSuffix.length).toBe(newlinePos);
  });

  it("does not cut at newline when too far back (< 80%)", () => {
    // Build text with a newline at 50% of keepChars
    const keepChars = 5_000 - DEFAULT_TRUNCATION_SUFFIX.length;
    const newlinePos = Math.floor(keepChars * 0.5);
    const text =
      "x".repeat(newlinePos) + "\n" + "y".repeat(10_000 - newlinePos);

    const result = truncateText(text, 5_000);
    const contentBeforeSuffix = result.slice(
      0,
      result.indexOf(DEFAULT_TRUNCATION_SUFFIX),
    );
    // Should NOT cut at newline, use keepChars instead
    expect(contentBeforeSuffix.length).toBe(keepChars);
  });

  it("handles text with no newlines", () => {
    const text = "a".repeat(10_000);
    const result = truncateText(text, 5_000);
    expect(result).toContain("[Content truncated");
    expect(result.length).toBeLessThan(text.length);
  });

  it("handles empty string", () => {
    expect(truncateText("", 100)).toBe("");
  });

  it("uses custom suffix when provided", () => {
    const text = "a".repeat(1_000);
    const customSuffix = " [cut]";
    const result = truncateText(text, 500, { truncationSuffix: customSuffix });
    expect(result.endsWith(customSuffix)).toBe(true);
    expect(result).not.toContain("[Content truncated");
  });

  it("uses custom minKeepChars", () => {
    const text = "a".repeat(5_000);
    const result = truncateText(text, 100, { minKeepChars: 500 });
    const contentBeforeSuffix = result.slice(
      0,
      result.indexOf(DEFAULT_TRUNCATION_SUFFIX),
    );
    expect(contentBeforeSuffix.length).toBeGreaterThanOrEqual(500);
  });

  it("uses custom newlineCutThreshold", () => {
    // Newline at 60% of keepChars — default threshold (0.8) would skip it
    const keepChars = 5_000 - DEFAULT_TRUNCATION_SUFFIX.length;
    const newlinePos = Math.floor(keepChars * 0.6);
    const text =
      "x".repeat(newlinePos) + "\n" + "y".repeat(10_000 - newlinePos);

    // With threshold 0.5, the newline at 60% should be used
    const result = truncateText(text, 5_000, { newlineCutThreshold: 0.5 });
    const contentBeforeSuffix = result.slice(
      0,
      result.indexOf(DEFAULT_TRUNCATION_SUFFIX),
    );
    expect(contentBeforeSuffix.length).toBe(newlinePos);
  });

  it("preserves UTF-8 characters", () => {
    const text = "你好世界".repeat(1_000);
    const result = truncateText(text, 2_500);
    expect(result).toContain("[Content truncated");
  });
});

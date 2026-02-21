import type { TruncateTextOptions } from "./types.js";
import {
  MIN_KEEP_CHARS,
  DEFAULT_TRUNCATION_SUFFIX,
  NEWLINE_CUT_THRESHOLD,
} from "./defaults.js";

/**
 * Truncate text to fit within maxChars, preserving the beginning.
 * Uses newline-boundary optimization to avoid cutting mid-line.
 *
 * Ported from OpenClaw's truncateToolResultText.
 */
export function truncateText(
  text: string,
  maxChars: number,
  options?: TruncateTextOptions,
): string {
  if (text.length <= maxChars) {
    return text;
  }

  const minKeep = options?.minKeepChars ?? MIN_KEEP_CHARS;
  const suffix = options?.truncationSuffix ?? DEFAULT_TRUNCATION_SUFFIX;
  const threshold = options?.newlineCutThreshold ?? NEWLINE_CUT_THRESHOLD;

  const keepChars = Math.max(minKeep, maxChars - suffix.length);

  // Try to break at a newline boundary to avoid cutting mid-line
  let cutPoint = keepChars;
  const lastNewline = text.lastIndexOf("\n", keepChars);
  if (lastNewline > keepChars * threshold) {
    cutPoint = lastNewline;
  }

  return text.slice(0, cutPoint) + suffix;
}

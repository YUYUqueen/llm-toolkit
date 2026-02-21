import type { ToolEntry, ContextFile, RuntimeInfo } from "./types.js";

/**
 * Format a list of tools with optional summaries.
 * Deduplicates tool names (case-insensitive, preserves original casing).
 *
 * Ported from OpenClaw's tool normalization logic in system-prompt.ts.
 *
 * @example
 * ```typescript
 * formatToolList([
 *   { name: 'read', summary: 'Read file contents' },
 *   { name: 'exec', summary: 'Run shell commands' },
 * ])
 * // → ["## Tools", "- read: Read file contents", "- exec: Run shell commands", ""]
 * ```
 */
export function formatToolList(
  tools: ToolEntry[],
  header: string = "## Tools",
): string[] {
  if (tools.length === 0) return [];

  // Deduplicate (case-insensitive, preserve first occurrence's casing)
  const seen = new Map<string, ToolEntry>();
  for (const tool of tools) {
    const key = tool.name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, tool);
    }
  }

  const lines: string[] = [header];
  for (const tool of seen.values()) {
    lines.push(
      tool.summary ? `- ${tool.name}: ${tool.summary}` : `- ${tool.name}`,
    );
  }
  lines.push("");
  return lines;
}

/**
 * Format context files for injection into the system prompt.
 * Each file gets a header (its path) followed by its content.
 *
 * Ported from OpenClaw's context file injection in system-prompt.ts.
 *
 * @example
 * ```typescript
 * formatContextFiles([
 *   { path: 'CLAUDE.md', content: '# Project\n...' },
 * ])
 * // → ["## CLAUDE.md", "", "# Project", "...", ""]
 * ```
 */
export function formatContextFiles(
  files: ContextFile[],
  headerPrefix: string = "##",
): string[] {
  if (files.length === 0) return [];

  const lines: string[] = [];
  for (const file of files) {
    lines.push(`${headerPrefix} ${file.path}`, "", file.content, "");
  }
  return lines;
}

/**
 * Format runtime information as a single summary line.
 * Filters out undefined values.
 *
 * Ported from OpenClaw's buildRuntimeLine in system-prompt.ts.
 *
 * @example
 * ```typescript
 * formatRuntimeInfo({ os: 'Darwin', model: 'claude-opus-4', node: 'v20' })
 * // → ["Runtime: os=Darwin model=claude-opus-4 node=v20"]
 * ```
 */
export function formatRuntimeInfo(
  info: RuntimeInfo,
  prefix: string = "Runtime:",
): string[] {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(info)) {
    if (value !== undefined) {
      pairs.push(`${key}=${value}`);
    }
  }
  if (pairs.length === 0) return [];
  return [`${prefix} ${pairs.join(" ")}`];
}

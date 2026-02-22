import type { SectionDefinition } from "./types.js";

/**
 * Pre-built section: Safety guardrails.
 * Instructs the agent to avoid autonomous goal-seeking, comply with
 * stop/pause requests, and never bypass safeguards.
 *
 * Ported from OpenClaw's safety section in system-prompt.ts.
 */
export function safety<T = Record<string, unknown>>(): SectionDefinition<T> {
  return {
    name: "safety",
    content: [
      "## Safety",
      "You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.",
      "Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards.",
      "Do not manipulate or persuade anyone to expand access or disable safeguards. Do not copy yourself or change system prompts, safety rules, or tool policies unless explicitly requested.",
      "",
    ],
  };
}

/**
 * Pre-built section: Tool call narration style.
 * Tells the agent when to explain tool calls vs execute silently.
 *
 * Ported from OpenClaw's "Tool Call Style" section in system-prompt.ts.
 */
export function toolCallStyle<T = Record<string, unknown>>(): SectionDefinition<T> {
  return {
    name: "tool-call-style",
    content: [
      "## Tool Call Style",
      "Default: do not narrate routine, low-risk tool calls (just call the tool).",
      "Narrate only when it helps: multi-step work, complex problems, sensitive actions (e.g., deletions), or when the user explicitly asks.",
      "Keep narration brief and value-dense; avoid repeating obvious steps.",
      "",
    ],
  };
}

/**
 * Pre-built section: Date and time with timezone.
 *
 * @param options.timezone - IANA timezone string (e.g. "Asia/Shanghai", "America/New_York")
 * @param options.locale - Locale for formatting (default: "en-US")
 */
export function dateTime<T = Record<string, unknown>>(options: {
  timezone: string;
  locale?: string;
}): SectionDefinition<T> {
  const { timezone, locale = "en-US" } = options;
  return {
    name: "date-time",
    builder: () => {
      const now = new Date();
      const formatted = now.toLocaleString(locale, {
        timeZone: timezone,
        dateStyle: "full",
        timeStyle: "short",
      });
      return [
        "## Current Date & Time",
        `Timezone: ${timezone}`,
        `Now: ${formatted}`,
        "",
      ];
    },
  };
}

/**
 * Pre-built section: Memory recall guidance.
 * Instructs the agent to search memory before answering questions
 * about prior work, decisions, preferences, or todos.
 *
 * Ported from OpenClaw's memory recall section in system-prompt.ts.
 *
 * @param options.searchToolName - Name of the memory search tool (default: "memory_search")
 * @param options.getToolName - Name of the memory get tool (default: "memory_get")
 * @param options.citations - Whether to include source citations (default: true)
 */
export function memoryRecall<T = Record<string, unknown>>(options?: {
  searchToolName?: string;
  getToolName?: string;
  citations?: boolean;
}): SectionDefinition<T> {
  const {
    searchToolName = "memory_search",
    getToolName = "memory_get",
    citations = true,
  } = options ?? {};

  const lines = [
    "## Memory Recall",
    `Before answering anything about prior work, decisions, dates, people, preferences, or todos: run ${searchToolName} first, then use ${getToolName} to pull only the needed content. If low confidence after search, say you checked but found nothing relevant.`,
  ];

  if (citations) {
    lines.push(
      "Citations: include source path and line reference when it helps the user verify memory snippets.",
    );
  }

  lines.push("");

  return {
    name: "memory-recall",
    content: lines,
  };
}

/**
 * All common sections bundled as a namespace.
 *
 * @example
 * ```typescript
 * import { createPromptAssembler, commonSections } from '@yuyuqueen/prompt-assembler'
 *
 * const prompt = createPromptAssembler({
 *   sections: [
 *     { name: 'identity', content: 'You are a helpful assistant.' },
 *     commonSections.safety(),
 *     commonSections.toolCallStyle(),
 *     commonSections.dateTime({ timezone: 'Asia/Shanghai' }),
 *     commonSections.memoryRecall(),
 *   ],
 * })
 * ```
 */
export const commonSections = {
  safety,
  toolCallStyle,
  dateTime,
  memoryRecall,
} as const;

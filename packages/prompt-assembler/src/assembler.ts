import type {
  AssemblerConfig,
  PromptAssembler,
  SectionDefinition,
} from "./types.js";

const DEFAULT_CHARS_PER_TOKEN = 4;

/**
 * Resolve a section's content into an array of lines.
 */
function resolveSection<TContext>(
  section: SectionDefinition<TContext>,
  ctx: TContext,
): string[] {
  // Check condition
  if (section.when && !section.when(ctx)) {
    return [];
  }

  // Dynamic builder takes priority over static content
  if (section.builder) {
    const result = section.builder(ctx);
    if (result === null || result === undefined) return [];
    if (typeof result === "string") return [result];
    return result;
  }

  // Static content
  if (section.content !== undefined) {
    if (typeof section.content === "string") return [section.content];
    return section.content;
  }

  return [];
}

/**
 * Create a modular prompt assembler.
 *
 * Ported from OpenClaw's section-based system prompt builder.
 * Each section is an independent unit that can be conditionally included,
 * dynamically generated, or statically defined.
 *
 * @example
 * ```typescript
 * type MyContext = { tools: ToolEntry[]; isMinimal: boolean }
 *
 * const prompt = createPromptAssembler<MyContext>({
 *   sections: [
 *     { name: 'identity', content: 'You are a helpful assistant.' },
 *     { name: 'tools', builder: (ctx) => formatToolList(ctx.tools) },
 *     { name: 'skills', builder: () => ['Use tools wisely.'], when: (ctx) => !ctx.isMinimal },
 *   ],
 * })
 *
 * const systemPrompt = prompt.build({ tools: [...], isMinimal: false })
 * ```
 */
export function createPromptAssembler<
  TContext = Record<string, unknown>,
>(config: AssemblerConfig<TContext>): PromptAssembler<TContext> {
  const { sections, separator = "\n", filterEmpty = true } = config;

  function buildSections(ctx: TContext): Map<string, string> {
    const result = new Map<string, string>();
    for (const section of sections) {
      const lines = resolveSection(section, ctx);
      if (lines.length > 0) {
        const text = filterEmpty
          ? lines.filter((line) => line !== null && line !== undefined).join("\n")
          : lines.join("\n");
        if (text.length > 0) {
          result.set(section.name, text);
        }
      }
    }
    return result;
  }

  function build(ctx: TContext): string {
    const sectionMap = buildSections(ctx);
    return Array.from(sectionMap.values()).join(separator);
  }

  function estimateTokens(
    ctx: TContext,
    charsPerToken: number = DEFAULT_CHARS_PER_TOKEN,
  ): number {
    const text = build(ctx);
    return Math.ceil(text.length / charsPerToken);
  }

  return { build, buildSections, estimateTokens };
}

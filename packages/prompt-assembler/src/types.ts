// ===== Section Definition =====

/**
 * A section in the prompt assembly pipeline.
 * Sections are processed in order and their output is concatenated.
 */
export type SectionDefinition<TContext = Record<string, unknown>> = {
  /** Unique name for this section (used in buildSections output) */
  name: string;
  /** Static content — used when the section never changes */
  content?: string | string[];
  /** Dynamic builder — called with context to generate content */
  builder?: (ctx: TContext) => string | string[] | null;
  /** Condition — section is skipped when this returns false */
  when?: (ctx: TContext) => boolean;
};

// ===== Assembler Config =====

export type AssemblerConfig<TContext = Record<string, unknown>> = {
  sections: SectionDefinition<TContext>[];
  /** Separator between sections (default: "\n") */
  separator?: string;
  /** Filter out empty lines from final output (default: true) */
  filterEmpty?: boolean;
};

// ===== Assembler Instance =====

export type PromptAssembler<TContext = Record<string, unknown>> = {
  /** Build the complete prompt string */
  build: (ctx: TContext) => string;
  /** Build and return each section's output as a Map (for debugging/reporting) */
  buildSections: (ctx: TContext) => Map<string, string>;
  /** Estimate token count for the assembled prompt */
  estimateTokens: (ctx: TContext, charsPerToken?: number) => number;
};

// ===== Section Helper Types =====

export type ToolEntry = {
  name: string;
  summary?: string;
};

export type ContextFile = {
  path: string;
  content: string;
};

export type RuntimeInfo = Record<string, string | undefined>;

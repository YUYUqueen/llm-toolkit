# @yuyuqueen/prompt-assembler

[![npm](https://img.shields.io/npm/v/@yuyuqueen/prompt-assembler)](https://www.npmjs.com/package/@yuyuqueen/prompt-assembler)
[![license](https://img.shields.io/npm/l/@yuyuqueen/prompt-assembler)](./LICENSE)

Modular system prompt assembly for LLM applications. Section-based builder with conditional rendering. Zero runtime dependencies.

## Features

- **Section builder pattern** — define prompt sections as static content, dynamic builders, or conditionally rendered blocks
- **Conditional rendering** — include/exclude sections based on runtime context via `when` predicate
- **Built-in helpers** — format tool lists (auto-dedup), context files, and runtime info
- **Debug & token estimation** — inspect individual section output and estimate total token count

## Install

```bash
npm install @yuyuqueen/prompt-assembler
```

## Quick Start

```typescript
import {
  createPromptAssembler,
  formatToolList,
  formatContextFiles,
  formatRuntimeInfo,
} from '@yuyuqueen/prompt-assembler'

type MyContext = {
  tools: { name: string; summary?: string }[]
  files: { path: string; content: string }[]
  runtime: { os?: string; model?: string }
  isMinimal: boolean
}

const prompt = createPromptAssembler<MyContext>({
  sections: [
    // Static content
    { name: 'identity', content: 'You are a coding assistant.' },
    // Dynamic builder with condition
    {
      name: 'tools',
      builder: (ctx) => formatToolList(ctx.tools),
      when: (ctx) => ctx.tools.length > 0,
    },
    // Context files
    {
      name: 'context',
      builder: (ctx) => formatContextFiles(ctx.files),
      when: (ctx) => ctx.files.length > 0,
    },
    // Runtime info
    {
      name: 'runtime',
      builder: (ctx) => formatRuntimeInfo(ctx.runtime),
    },
    // Conditional static
    {
      name: 'rules',
      content: 'Be concise. Follow best practices.',
      when: (ctx) => !ctx.isMinimal,
    },
  ],
})

const systemPrompt = prompt.build({
  tools: [
    { name: 'read', summary: 'Read file contents' },
    { name: 'exec', summary: 'Run shell commands' },
  ],
  files: [{ path: 'CLAUDE.md', content: '# Project\nDetails here.' }],
  runtime: { os: 'Darwin', model: 'claude-opus-4' },
  isMinimal: false,
})
```

## Debug & Token Estimation

```typescript
// Inspect individual sections
const sections = prompt.buildSections(ctx)
for (const [name, content] of sections) {
  console.log(`[${name}] ${content.length} chars`)
}
// [identity] 28 chars
// [tools] 156 chars
// [context] 2340 chars

// Estimate total tokens
const tokens = prompt.estimateTokens(ctx)
console.log(`System prompt ≈ ${tokens} tokens`)
```

## Section Helpers

```typescript
// Tool list (auto-dedup, case-insensitive)
formatToolList([
  { name: 'read', summary: 'Read file contents' },
  { name: 'Read', summary: 'Duplicate' },  // deduped
  { name: 'exec', summary: 'Run commands' },
])
// → ["## Tools", "- read: Read file contents", "- exec: Run commands", ""]

// Context files
formatContextFiles([
  { path: 'CLAUDE.md', content: '# Project\nRules here.' },
])
// → ["## CLAUDE.md", "", "# Project\nRules here.", ""]

// Runtime info (auto-filters undefined values)
formatRuntimeInfo({ os: 'Darwin', model: 'claude-opus-4', node: undefined })
// → ["Runtime: os=Darwin model=claude-opus-4"]
```

## Common Sections

Pre-built section builders for universal agent prompt patterns:

```typescript
import { createPromptAssembler, commonSections } from '@yuyuqueen/prompt-assembler'

const prompt = createPromptAssembler({
  sections: [
    { name: 'identity', content: 'You are a coding assistant.' },
    commonSections.safety(),
    commonSections.toolCallStyle(),
    commonSections.dateTime({ timezone: 'Asia/Shanghai' }),
    commonSections.memoryRecall(),
  ],
})
```

| Builder | Description |
|---------|-------------|
| `safety()` | Safety guardrails — no self-preservation, comply with stop/pause requests |
| `toolCallStyle()` | Tool call narration — silent by default, narrate only when helpful |
| `dateTime({ timezone, locale? })` | Dynamic date/time with IANA timezone |
| `memoryRecall({ searchToolName?, getToolName?, citations? })` | Memory recall guidance — search before answering about prior work |

## API

### `createPromptAssembler<T>(config)`

Returns a `PromptAssembler<T>` with:

| Method | Description |
|--------|-------------|
| `build(ctx)` | Assemble the full prompt string |
| `buildSections(ctx)` | Returns `Map<string, string>` of each section's output |
| `estimateTokens(ctx)` | Estimate token count (chars/4 heuristic) |

### Section Definition

```typescript
type SectionDefinition<T> = {
  name: string
  content?: string                    // Static content
  builder?: (ctx: T) => string[]      // Dynamic builder (takes priority over content)
  when?: (ctx: T) => boolean          // Condition — skip section if false
}
```

## Design

- **Zero dependencies** — pure TypeScript, no runtime deps
- **Generic context** — `createPromptAssembler<YourContext>` provides full type safety
- **Provider-agnostic** — outputs plain strings, not tied to any LLM SDK
- **Composable** — section helpers work standalone or within the assembler
- **ESM only** — ships as ES modules with full TypeScript declarations

## License

MIT — Part of [llm-toolkit](https://github.com/yuyuqueen/llm-toolkit)

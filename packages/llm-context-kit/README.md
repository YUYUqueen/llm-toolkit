# @yuyuqueen/llm-context-kit

[![npm](https://img.shields.io/npm/v/@yuyuqueen/llm-context-kit)](https://www.npmjs.com/package/@yuyuqueen/llm-context-kit)
[![license](https://img.shields.io/npm/l/@yuyuqueen/llm-context-kit)](./LICENSE)

Context window management for LLM applications — a 3-tier defense against context overflow. Zero runtime dependencies, provider-agnostic.

## Features

- **Context budget** — estimate token usage and predict overflow before it happens
- **Tool result truncation** — auto-truncate oversized tool results with proportional budget allocation and newline-boundary cutting
- **Conversation compression** — summarize old messages via cheap LLM while preserving recent turns and tool_use/tool_result pairs

## Install

```bash
npm install @yuyuqueen/llm-context-kit
```

## Quick Start

### 3-Tier Defense

```typescript
import {
  createContextBudget,
  createToolResultTruncator,
  createContextCompressor,
} from '@yuyuqueen/llm-context-kit'

const budget = createContextBudget({ contextWindowTokens: 200_000 })
const truncator = createToolResultTruncator()
const compressor = createContextCompressor({
  summarize: async ({ messages, systemPrompt }) => {
    // Call a cheap model (e.g. Haiku) to summarize
    return 'Summary of the conversation...'
  },
})

async function chat(messages) {
  // Tier 1: Check budget
  const status = budget.check(messages)

  // Tier 2: Budget tight? Truncate tool results
  if (status.utilizationPercent > 70) {
    messages = truncator.truncate(messages, 200_000).messages
  }

  // Tier 3: Still too large? Compress old messages
  if (status.utilizationPercent > 85) {
    const compressed = await compressor.compress(messages)
    if (compressed.compressed) messages = compressed.messages
  }

  return callLLM({ messages })
}
```

### Context Budget

```typescript
const budget = createContextBudget({
  contextWindowTokens: 200_000,
  reserveOutputTokens: 4_096,
})

const status = budget.check(messages)
// {
//   withinBudget: true,
//   estimatedTokens: 45000,
//   availableTokens: 150904,
//   utilizationPercent: 23,
// }
```

### Tool Result Truncation

```typescript
const truncator = createToolResultTruncator()
const { messages: safeMessages, truncatedCount } =
  truncator.truncate(messages, 200_000)
```

Truncation details:
- Single tool result capped at 30% of context window
- Hard limit of 400K characters per result
- Cuts at newline boundaries (not mid-line) to avoid LLM hallucination
- Multiple text blocks get proportional budget allocation

### Conversation Compression

```typescript
const compressor = createContextCompressor({
  summarize: async ({ messages, systemPrompt }) => {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })
    return response.content[0].text
  },
  preserveRecentTurns: 4,
  timeoutMs: 300_000,
})

const result = await compressor.compress(messages)
// { compressed: true, messages: [...], description: "Compressed 12 messages into summary" }
```

Compression details:
- System messages are never compressed
- Recent N turns are preserved intact
- tool_use/tool_result pairs are kept atomic (never split)
- Images are stripped before summarization
- Built-in timeout protection (default 5 minutes)

## API

### Exports

| Export | Description |
|--------|-------------|
| `createContextBudget` | Token budget estimator (chars/4 heuristic) |
| `createToolResultTruncator` | Tool result auto-truncation |
| `createContextCompressor` | Conversation compression via summarization |
| `estimateMessageTokens` | Estimate token count of a message array |
| `truncateText` | Low-level text truncation with newline-boundary support |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_TOOL_RESULT_CONTEXT_SHARE` | 0.3 | Max context share per tool result |
| `HARD_MAX_TOOL_RESULT_CHARS` | 400,000 | Hard character limit |
| `MIN_KEEP_CHARS` | 2,000 | Minimum characters to keep after truncation |

## Design

- **Zero dependencies** — pure TypeScript, no runtime deps
- **Provider-agnostic** — supports both Anthropic and OpenAI message formats
- **Immutable** — all operations return new arrays, never modify originals
- **ESM only** — ships as ES modules with full TypeScript declarations

## License

MIT — Part of [llm-toolkit](https://github.com/yuyuqueen/llm-toolkit)

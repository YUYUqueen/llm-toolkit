# llm-toolkit

Monorepo for reusable LLM utility libraries. Zero runtime dependencies, TypeScript-first, ESM only.

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [@yuyuqueen/resilient-llm](./packages/resilient-llm) | [![npm](https://img.shields.io/npm/v/@yuyuqueen/resilient-llm)](https://www.npmjs.com/package/@yuyuqueen/resilient-llm) | Fault-tolerant LLM call wrapper with multi-key rotation, provider fallback, and auto-recovery |
| [@yuyuqueen/llm-context-kit](./packages/llm-context-kit) | [![npm](https://img.shields.io/npm/v/@yuyuqueen/llm-context-kit)](https://www.npmjs.com/package/@yuyuqueen/llm-context-kit) | Context window management — tool result truncation, conversation compression, budget estimation |
| [@yuyuqueen/prompt-assembler](./packages/prompt-assembler) | [![npm](https://img.shields.io/npm/v/@yuyuqueen/prompt-assembler)](https://www.npmjs.com/package/@yuyuqueen/prompt-assembler) | Modular system prompt assembly with section-based builder and conditional rendering |

### @yuyuqueen/resilient-llm

Production-grade fault-tolerant wrapper for LLM API calls.

- **Key rotation** — automatic failover across multiple API keys with exponential backoff
- **Provider fallback** — seamless switching between providers (Anthropic → OpenAI → Gemini)
- **Context overflow recovery** — auto-compress context when hitting token limits
- **Thinking level downgrade** — graceful degradation of reasoning capabilities
- **Token tracking** — accurate usage accumulation across retries

```bash
npm install @yuyuqueen/resilient-llm
```

```typescript
import { createResilientLLM } from '@yuyuqueen/resilient-llm'

const resilient = createResilientLLM({
  providers: [
    {
      name: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      keys: [
        { id: 'key-1', value: process.env.ANTHROPIC_KEY_1! },
        { id: 'key-2', value: process.env.ANTHROPIC_KEY_2! },
      ],
    },
  ],
})

const result = await resilient.call(async (ctx) => {
  const client = new Anthropic({ apiKey: ctx.apiKey.value })
  const response = await client.messages.create({
    model: ctx.model,
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello!' }],
  })
  return { response, usage: response.usage }
})
```

### @yuyuqueen/llm-context-kit

Context window management for LLM applications.

- **Tool result truncation** — auto-truncate oversized tool results with proportional budget allocation
- **Conversation compression** — summarize old messages via cheap LLM, preserve recent turns
- **Context budget** — estimate token usage and check if messages fit the context window

```bash
npm install @yuyuqueen/llm-context-kit
```

```typescript
import {
  createToolResultTruncator,
  createContextCompressor,
  createContextBudget,
} from '@yuyuqueen/llm-context-kit'

// Truncate oversized tool results
const truncator = createToolResultTruncator()
const { messages, truncatedCount } = truncator.truncate(messages, 200_000)

// Compress old conversation messages
const compressor = createContextCompressor({
  summarize: async ({ messages, systemPrompt }) => {
    // Call a cheap model (e.g. Haiku) to summarize
    return 'Summary of the conversation...'
  },
})
const result = await compressor.compress(messages)

// Check context budget
const budget = createContextBudget({ contextWindowTokens: 200_000 })
const status = budget.check(messages)
// { withinBudget: true, estimatedTokens: 45000, availableTokens: 155000, utilizationPercent: 23 }
```

### @yuyuqueen/prompt-assembler

Modular system prompt assembly with section-based builder and conditional rendering.

- **Section builder pattern** — define sections as static content or dynamic builders
- **Conditional rendering** — include/exclude sections based on runtime context
- **Built-in helpers** — format tool lists, context files, and runtime info
- **Token estimation** — estimate prompt token count before sending

```bash
npm install @yuyuqueen/prompt-assembler
```

```typescript
import {
  createPromptAssembler,
  formatToolList,
  formatContextFiles,
} from '@yuyuqueen/prompt-assembler'

const assembler = createPromptAssembler({
  sections: [
    { name: 'identity', content: 'You are a helpful coding assistant.' },
    {
      name: 'tools',
      builder: (ctx) => formatToolList(ctx.tools),
      when: (ctx) => ctx.tools.length > 0,
    },
    {
      name: 'context',
      builder: (ctx) => formatContextFiles(ctx.files),
      when: (ctx) => ctx.files.length > 0,
    },
    {
      name: 'rules',
      content: 'Be concise. Follow best practices.',
      when: (ctx) => !ctx.isMinimal,
    },
  ],
  separator: '\n',
})

const systemPrompt = assembler.build({
  tools: [
    { name: 'read', summary: 'Read file contents' },
    { name: 'exec', summary: 'Run shell commands' },
  ],
  files: [{ path: 'CLAUDE.md', content: '# Project\nDetails here.' }],
  isMinimal: false,
})
```

## Development

```bash
pnpm install
pnpm --filter @yuyuqueen/resilient-llm test
pnpm --filter @yuyuqueen/resilient-llm build
pnpm --filter @yuyuqueen/llm-context-kit test
pnpm --filter @yuyuqueen/llm-context-kit build
pnpm --filter @yuyuqueen/prompt-assembler test
pnpm --filter @yuyuqueen/prompt-assembler build
```

## License

MIT

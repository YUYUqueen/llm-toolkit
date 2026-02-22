# @yuyuqueen/resilient-llm

[![npm](https://img.shields.io/npm/v/@yuyuqueen/resilient-llm)](https://www.npmjs.com/package/@yuyuqueen/resilient-llm)
[![license](https://img.shields.io/npm/l/@yuyuqueen/resilient-llm)](./LICENSE)

Production-grade fault-tolerant wrapper for LLM API calls. Zero runtime dependencies, provider-agnostic.

## Features

- **Key rotation** — automatic failover across multiple API keys with exponential backoff cooldown
- **Provider fallback** — seamless switching between providers (Anthropic → OpenAI → Gemini)
- **Context overflow recovery** — auto-compress context when hitting token limits
- **Thinking level downgrade** — graceful degradation of reasoning capabilities (extended → deep → off)
- **Token tracking** — accurate usage accumulation across retries (no double-counting)

## Install

```bash
npm install @yuyuqueen/resilient-llm
```

## Quick Start

```typescript
import { createResilientLLM } from '@yuyuqueen/resilient-llm'
import Anthropic from '@anthropic-ai/sdk'

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
    {
      name: 'openai',
      model: 'gpt-4o',
      keys: [{ id: 'openai-1', value: process.env.OPENAI_KEY! }],
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

## Context Compression

```typescript
const result = await resilient.call(callFn, {
  contextCompressor: async () => {
    const removed = trimOldMessages(messages)
    return removed > 0
      ? { compressed: true, description: `Removed ${removed} messages` }
      : { compressed: false }
  },
})
```

## Key Health Monitoring

```typescript
const health = resilient.getKeyHealth()
// { keys: [{ id: 'key-1', status: 'active', errorCount: 0 }, ...] }
```

## API

### `createResilientLLM(config)`

Returns a `ResilientLLM` instance with:

- **`call(fn, options?)`** — execute an LLM call with automatic retry and failover
- **`getKeyHealth()`** — get current status of all API keys

### Exports

| Export | Description |
|--------|-------------|
| `createResilientLLM` | Factory function |
| `ResilientError` | Error class thrown when all keys/providers are exhausted |
| `builtinClassifyError` | Default error classifier (supports Anthropic, OpenAI, Google) |
| `normalizeUsage` | Normalize usage data across providers |
| `calculateCooldownMs` | Calculate cooldown duration for a given error count |

## Design

- **Zero dependencies** — pure TypeScript, no runtime deps
- **Provider-agnostic** — you pass the callback, the library handles orchestration
- **ESM only** — ships as ES modules with full TypeScript declarations

## License

MIT — Part of [llm-toolkit](https://github.com/yuyuqueen/llm-toolkit)

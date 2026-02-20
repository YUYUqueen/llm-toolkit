# llm-toolkit

Monorepo for reusable LLM utility libraries. Zero runtime dependencies, TypeScript-first, ESM only.

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [@yuyuqueen/resilient-llm](./packages/resilient-llm) | [![npm](https://img.shields.io/npm/v/@yuyuqueen/resilient-llm)](https://www.npmjs.com/package/@yuyuqueen/resilient-llm) | Fault-tolerant LLM call wrapper with multi-key rotation, provider fallback, and auto-recovery |

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

## Development

```bash
pnpm install
pnpm --filter @yuyuqueen/resilient-llm test
pnpm --filter @yuyuqueen/resilient-llm build
```

## License

MIT

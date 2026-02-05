# Copilot Instructions for Board of Directors RAG

## Project Overview

This is a **production** Next.js TypeScript project implementing a multi-agent RAG (Retrieval Augmented Generation) system called "Board of Directors." The system uses intelligent agent routing, vector search, and LLM generation to provide contextual responses.

## Architecture

### Agent System (app/agents/)

Two-stage request flow:

1. **Agent Selector** (`/api/select-agent`) - LLM-powered router using OpenAI structured outputs with Zod schemas to pick the right agent and refine the query
2. **Agent Execution** (`/api/chat`) - Routes to specialized agent via registry pattern

```
User Query → select-agent (picks agent + refines query) → chat (executes agent) → Streamed Response
```

- [registry.ts](../app/agents/registry.ts) - Central agent lookup with `AgentExecutor` type
- [types.ts](../app/agents/types.ts) - Zod schemas for `AgentType`, `Message`, `AgentRequest`
- [config.ts](../app/agents/config.ts) - Agent metadata (name, description) used by selector

### Agent Implementations

- **LinkedIn Agent** (`linkedin.ts`) - Uses OpenAI fine-tuned model (`OPENAI_FINETUNED_MODEL` env var)
- **RAG Agent** (`rag.ts`) - Qdrant vector search → reranking → context injection → streaming response

### Core Libraries (app/libs/)

- [pinecone.ts](../app/libs/pinecone.ts) - Vector database integration with `searchDocuments()`
- [qdrant.ts](../app/libs/qdrant.ts) - Primary vector database with article and post collections
- [openai/openai.ts](../app/libs/openai/openai.ts) - Shared OpenAI client instance with Helicone proxy
- [chunking.ts](../app/libs/chunking.ts) - Text chunking with overlap for vectorization
- [cohere.ts](../app/libs/cohere.ts) - Reranking service for improving retrieval quality

## Key Patterns

### Streaming Responses

All agents return `StreamTextResult` from Vercel AI SDK. Use `streamText()` from `ai` package and return `result.toTextStreamResponse()`:

```typescript
const result = streamText({ model: openai("gpt-4o"), system, messages });
return result.toTextStreamResponse();
```

### Zod Validation

API routes validate requests with Zod schemas. Structured outputs use `zodTextFormat()` from `openai/helpers/zod`.

### Embeddings

- Model: `text-embedding-3-small` with 512 dimensions
- Always include `metadata.text` when upserting to vector databases for retrieval

### Two-Layer Guardrails

1. **LLM Classification** - Cheap gpt-4o-mini classifier to reject off-topic queries early
2. **Similarity Threshold** - Filter out low-relevance vector search results (0.5 cutoff)

## Commands

| Command              | Purpose                           |
| -------------------- | --------------------------------- |
| `yarn dev`           | Start dev server (uses Turbopack) |
| `yarn build`         | Build for production              |
| `yarn start`         | Start production server           |
| `yarn test`          | Run all Jest tests                |
| `yarn test:selector` | Test agent routing logic          |
| `yarn test:chunking` | Test text chunking                |
| `yarn lint`          | Run ESLint                        |

## Environment Variables

Required in `.env`: `OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX`, `HELICONE_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`
Optional: `OPENAI_FINETUNED_MODEL` (for LinkedIn agent)

## Testing

- Tests call API route handlers directly—no server needed
- Test files: `__tests__/*.test.ts` or `*.test.ts` alongside source
- Selector tests verify routing decisions, not exact LLM output (non-deterministic)
- Use 15s+ timeout for tests that call LLM APIs

## File Organization

- `app/api/` - Next.js API routes (POST handlers)
- `app/agents/` - Agent implementations and registry
- `app/components/` - Shared components between pages
- `app/libs/` - Third-party library integrations (OpenAI, Pinecone, Qdrant, Cohere)
- `app/scripts/` - CLI scripts for data processing and uploads
- `app/services/` - Services callable from API routes

## Code Style

When writing or modifying code:

- Maintain clean, production-quality standards
- Add comments for complex logic, especially AI-specific patterns
- Use TypeScript strictly with proper types and Zod validation
- Follow existing patterns for consistency

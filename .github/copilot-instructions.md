# Copilot Instructions for mini-rag

## Project Overview

This is a **learning-focused** Next.js TypeScript project teaching RAG (Retrieval Augmented Generation), fine-tuning, and multi-agent AI systems. Many functions contain `TODO` comments for learners to implement - **do not remove or complete these TODOs** unless explicitly and specifically asked.

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
- **RAG Agent** (`rag.ts`) - Pinecone vector search → reranking → context injection → streaming response

### Core Libraries (app/libs/)

- [pinecone.ts](../app/libs/pinecone.ts) - Vector database integration with `searchDocuments()`
- [openai/openai.ts](../app/libs/openai/openai.ts) - Shared OpenAI client instance
- [chunking.ts](../app/libs/chunking.ts) - Text chunking with overlap for vectorization

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
- Always include `metadata.text` when upserting to Pinecone for retrieval

## Commands

| Command                 | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `yarn dev`              | Start dev server (uses Turbopack)              |
| `yarn test`             | Run all Jest tests                             |
| `yarn test:selector`    | Test agent routing logic                       |
| `yarn test:chunking`    | Test text chunking                             |
| `yarn estimate-costs`   | Estimate fine-tuning costs from JSONL          |
| `yarn train`            | Upload training data and start fine-tuning job |
| `yarn exercise:vectors` | Run vector similarity exercise                 |

## Environment Variables

Required in `.env`: `OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX`, `HELICONE_API_KEY`
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
- `app/libs/` - Third-party library integrations (OpenAI, Pinecone, chunking)
- `app/scripts/` - One-off CLI scripts to run outside the app
- `app/scripts/data/` - Training data (JSONL, CSV, articles)
- `app/services/` - Services callable from API routes

## Code Style for Teaching

This project teaches software engineers about RAG. **Detailed, educational comments are critical** for learning. When writing or modifying code:

### Commenting Requirements

- **Explain both "What" AND "Why"** - Every AI-specific feature needs comments that describe what the code does AND why it's necessary
- **Be detailed, not brief** - Don't just name the operation; explain the concept, the reasoning, and how it fits into the larger RAG pipeline
- **Target audience: beginners** - Assume the reader has never worked with embeddings, vector databases, or LLMs before

### What to Comment

- Embeddings: Why we convert text to vectors, what dimensions mean, why we chose specific models
- Vector search: How similarity search works, why topK matters, what scores represent
- Chunking: Why we split text, how overlap prevents context loss, trade-offs in chunk size
- Reranking: Why initial results need refinement, how rerankers improve relevance
- Streaming: Why we stream responses, how it improves UX for LLM output
- Fine-tuning: What it does vs base models, when to use it

### Example Comment Style

#### BAD: Too brief

```typescript
/**
Query Pinecone for similar vectors
*/
```

#### GOOD: Explains what AND why

```typescript
/**
Query Pinecone for semantically similar documents.

WHY: Unlike keyword search, vector search finds documents by meaning.
The embedding we generated represents the "meaning" of the query as a point in 512-dimensional space. Pinecone finds other points (documents) that are closest to this point using cosine similarity.

topK=10 means we over-fetch candidates for reranking, since the initial vector search is fast but approximate—reranking improves precision.
*/
```

See [pinecone.ts](../app/libs/pinecone.ts) and [rag.ts](../app/agents/rag.ts) for reference examples.

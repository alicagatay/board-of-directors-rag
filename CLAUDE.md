# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
yarn dev                # Dev server (Next.js + Turbopack) at http://localhost:3000
yarn build              # Production build
yarn lint               # ESLint
yarn test               # All Jest tests
yarn test:selector      # Agent routing tests only
yarn test:chunking      # Chunking utility tests only
yarn test -- path/to/file.test.ts  # Single test file
```

Data pipeline (requires Python + env vars configured):
```bash
yarn fetch:transcripts     # Fetch YouTube transcripts (Python)
yarn upload:transcripts    # Chunk, embed, upsert to Qdrant (TypeScript)
```

## Architecture

Multi-agent RAG system ("Board of Directors") where users chat with 18 YouTube mentors. Two-stage request flow:

1. **Mentor Selection** (`/api/select-agent`) — gpt-4o-mini classifies the query, picks a mentor from `app/mentors/config.ts`, and refines the query. Irrelevant queries get a random mentor with a rejection path.
2. **RAG Execution** (`/api/chat`) — Full pipeline: guardrail check → embed query → Qdrant vector search (filtered by mentor's channel) → similarity threshold filter (0.3) → Cohere rerank → gpt-4o streamed response in mentor's voice.

### Key directories

- `app/agents/` — Agent types, registry, RAG implementation, guardrails (two-layer: LLM classifier + similarity threshold)
- `app/mentors/config.ts` — 18 mentor profiles with expertise areas and personality descriptions
- `app/libs/` — Third-party integrations: OpenAI (via Helicone proxy), Qdrant, Cohere, chunking
- `app/api/` — Next.js App Router API routes (`select-agent`, `chat`, `rag-test`)
- `app/scripts/` — Data pipeline: YouTube transcript fetching and Qdrant upload

### Agent system

- `app/agents/types.ts` — Zod schemas for `AgentType`, `Message`, `AgentRequest`
- `app/agents/registry.ts` — Maps agent types to executor functions. Add new agents here.
- All agents return `StreamTextResult` from Vercel AI SDK; routes respond with `result.toTextStreamResponse()`
- Static rejections (guardrail hits) use `createStaticTextStream()` to keep the streaming API contract consistent

### External services

All OpenAI calls are proxied through Helicone (`app/libs/openai/openai.ts`) for observability and caching. Required env vars: `OPENAI_API_KEY`, `HELICONE_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `COHERE_API_KEY`. See `.env.example`.

## Conventions

- API routes use Zod validation at the boundary. Structured LLM outputs use `zodTextFormat()`.
- Embeddings: `text-embedding-3-small` with 512 dimensions.
- Chunking: sentence-based, 1000 chars with 200 char overlap (tuned for speech transcripts).
- Tests call API route handlers directly — no server needed. Use 15s+ timeouts for tests hitting LLM APIs.
- Path alias: `@/*` maps to the project root.
- When adding a new agent: extend `AgentType` in `types.ts`, register in `registry.ts`, add mentor config if needed.
- Middleware (`middleware.ts`) implements HTTP Basic Auth via `APP_PASSWORD` env var.

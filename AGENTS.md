# AGENTS.md

This file provides guidance to AI assistants (WARP, Claude Code, etc.) when working with code in this repository.

## Repository Purpose

This is a **production** Next.js + TypeScript project implementing a multi-agent RAG (Retrieval Augmented Generation) system called "Board of Directors." The system uses intelligent agent routing, vector search, and LLM generation to provide contextual responses.

## Core Commands

All commands assume you are at the repo root.

### Install & Development

- Install dependencies:
  - `yarn install`
- Start dev server (Next.js App Router, Turbopack):
  - `yarn dev`
  - App runs at `http://localhost:3000`.

### Build & Production

- Build the app:
  - `yarn build`
- Start production server (after `yarn build`):
  - `yarn start`

### Linting

- Run ESLint (Next.js presets via `eslint.config.mjs`):
  - `yarn lint`

### Tests

Jest is configured in `jest.config.js` with `ts-jest`, running tests under `app/**/__tests__` and `**/*.test.ts`.

- Run all tests:
  - `yarn test`
- Agent selector tests only:
  - `yarn test:selector`
- Chunking / ingestion utilities tests only:
  - `yarn test:chunking`
- Run a single test file (pattern match):
  - `yarn test -- app/agents/__tests__/selector.test.ts`

## Environment & External Services

The app depends on multiple external services; most of this is summarized in `README.md` and the library files.

### OpenAI & Helicone

- Core client: `app/libs/openai/openai.ts`.
- Uses Helicone as a proxy (`baseURL` set to Helicone) for observability and cost tracking.
- Required env vars:
  - `OPENAI_API_KEY`
  - `HELICONE_API_KEY`
- Embeddings:
  - Model: `text-embedding-3-small`
  - Dimensions: `512`
- Optional fine-tuned model for LinkedIn agent:
  - `OPENAI_FINETUNED_MODEL`

### Vector Databases

- **Qdrant (primary)**
  - Client: `app/libs/qdrant.ts`
  - Env vars: `QDRANT_URL`, `QDRANT_API_KEY`.
  - Collections:
    - `articles` – long-form article chunks.
    - `posts` – single LinkedIn posts.
- **Pinecone (alternative)**
  - Client & helpers: `app/libs/pinecone.ts`
  - Env vars: `PINECONE_API_KEY`, `PINECONE_INDEX`.

### Other Required Env Vars

- `PINECONE_INDEX` – index name.
- `HELICONE_API_KEY` – for observability.

Consult `.env.example` and `README.md` for up-to-date variables before modifying env-dependent code.

## High-Level Architecture

### Next.js App Structure

- `app/page.tsx` – main chat UI for interacting with agents.
- `app/api/` – Next.js App Router API routes (e.g. `chat`, `select-agent`, `upload-document`, ingestion/testing routes).
- `app/agents/` – agent types, configs, implementations, guardrails, and tests.
- `app/components/` – shared UI components reused across pages.
- `app/libs/` – integrations with third-party services (OpenAI, Qdrant, Pinecone) and shared utilities like chunking.
- `app/scripts/` – Node scripts for data preparation and vector uploads (run via Yarn scripts).
- `app/services/` – backend services that encapsulate business logic and are called from API routes.

### Multi-Agent Request Flow

The core feature is a two-stage, LLM-driven multi-agent system.

**1. Agent Selection (`app/api/select-agent/route.ts`)**

- Receives recent chat `messages` from the client.
- Uses `agentConfigs` (`app/agents/config.ts`) to describe available agents.
- Calls OpenAI via `openaiClient.responses.parse` with `zodTextFormat` to produce a **structured** response matching `agentSelectionSchema`.
- Returns a JSON payload with:
  - `agent` – one of the `AgentType` values (`linkedin` or `rag`).
  - `query` – refined user query (spelling fixes, removed noise, etc.).
  - `confidence` – 1–10 confidence score.

**2. Agent Execution (`app/api/chat/route.ts`)**

- Validates the request body with Zod (`chatSchema`).
- Extracts the original user query from the last message.
- Looks up the appropriate executor via `getAgent` in `app/agents/registry.ts`.
- Invokes the selected agent with an `AgentRequest` (includes agent type, refined query, original query, and message history).
- Each agent returns a `StreamTextResult`; the route responds with `result.toTextStreamResponse()` to stream tokens to the client.

### Agent Layer

- Types & contracts: `app/agents/types.ts`
  - `AgentType` (Zod enum: `linkedin`, `rag`).
  - `Message` schema mirrors chat messages (`role`, `content`).
  - `AgentRequest` and `AgentResponse` unify how agents are called and what they return.
- Registry: `app/agents/registry.ts`
  - `agentRegistry` maps `AgentType` → executor function.
  - `getAgent` is the single lookup point for handler selection; add new agents here.
- Config: `app/agents/config.ts` describes each agent for the selector.

#### LinkedIn Agent (`app/agents/linkedin.ts`)

- Focused on generating/refining professional LinkedIn posts.
- Uses Vercel AI SDK `streamText` with OpenAI models (`openai("gpt-4o")` by default; can use `OPENAI_FINETUNED_MODEL`).
- System prompts should incorporate both `request.originalQuery` and `request.query`.

#### RAG Agent (`app/agents/rag.ts`)

- Implements a multi-stage RAG pipeline on top of Qdrant + Cohere, returning a streamed response based on retrieved content.
- Pipeline:
  1. **Guardrail layer 1 – LLM classification** via `checkQueryRelevance` from `app/agents/guardrails.ts`.
  2. **Embeddings** via `openaiClient.embeddings.create` with `text-embedding-3-small` (512 dimensions).
  3. **Vector search** across Qdrant `posts` and `articles` collections.
  4. **Guardrail layer 2 – similarity threshold** using `SIMILARITY_SCORE_THRESHOLD` (0.5).
  5. **Reranking** via Cohere (`cohereClient.rerank`) on the combined candidate set.
  6. **Generation** via `streamText` using `openai("gpt-4o")`, with reranked documents serialized into the system prompt.

### Guardrails and Observability

- Guardrails module: `app/agents/guardrails.ts`.
  - Defines in-scope topics.
  - Implements a two-layer guardrail strategy: LLM relevance classifier + vector similarity threshold.
  - Uses OpenAI structured outputs via Zod (`relevanceSchema` with `zodTextFormat`).
- OpenAI client (`app/libs/openai/openai.ts`) routes all calls through Helicone with headers for caching and observability.

### Ingestion & Chunking Pipeline

- Chunking utility: `app/libs/chunking.ts`.
  - Defines `Chunk`, `LinkedInPost`, and `MediumArticle` types.
  - `chunkText` implements sentence-based chunking with character overlap and rich metadata.
- Qdrant ingestion helpers: `app/libs/qdrant.ts`.
  - `upsertArticleChunks` – uploads article chunks and embeddings into the `articles` collection.
  - `upsertLinkedInPost` – uploads single-post embeddings into the `posts` collection.
- Pinecone helper: `app/libs/pinecone.ts`.
  - Exposes a `pineconeClient` and a `searchDocuments` function for Pinecone-based semantic search.

### Testing Architecture

- Jest config in `jest.config.js`:
  - `roots: ['<rootDir>/app']`, `testEnvironment: 'node'`, and `ts-jest` transformer.
  - Tests avoid spinning up an HTTP server; API handlers are imported and invoked directly.
- When adding tests, follow the same pattern: import the route handler or library function directly and test behavior.

## Conventions & Rules for AI Assistants

### API Routes & Client Access

- When creating new API routes, follow the existing App Router pattern under `app/api/<route>/route.ts`.
- Project rules reference a `typedRoute` helper and a `fetchApiRoute` client helper; when these are present, prefer them for strongly-typed request/response definitions.
- Always validate incoming requests with Zod schemas at the edge of the system.

### Streaming Responses

- All agents should return `AgentResponse` (`StreamTextResult` from Vercel AI SDK).
- For HTTP APIs that surface agent output, always convert to an HTTP stream using `result.toTextStreamResponse()`.
- For static responses (e.g., guardrail rejections), use `createStaticTextStream` so the API contract stays consistent.

### Adding New Agents or Capabilities

- Extend `AgentType` and `agentTypeSchema` in `app/agents/types.ts`.
- Add a corresponding entry in `agentConfigs` (`app/agents/config.ts`) so the selector can describe it.
- Register the executor in `agentRegistry` (`app/agents/registry.ts`).
- Add targeted Jest tests under `app/agents/__tests__/` that call the relevant API route handler directly.

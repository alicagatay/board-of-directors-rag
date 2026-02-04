# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repository purpose

This is a **learning-focused** Next.js + TypeScript project that teaches RAG (Retrieval Augmented Generation), fine-tuning, and multi-agent AI systems. Many functions contain `TODO` comments that learners are expected to complete.

**Do not remove or auto-complete TODOs unless the user explicitly asks you to work on a specific TODO or area.** Preserve the educational structure and inline comments when editing.

The app is intentionally broken in places; the `working_version` Git branch contains a full reference implementation.

## Core commands

All commands assume you are at the repo root.

### Install & development

- Install dependencies:
  - `yarn install`
- Start dev server (Next.js App Router, Turbopack):
  - `yarn dev`
  - App runs at `http://localhost:3000`.

### Build & production

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
- Vector exercise tests:
  - `yarn exercise:vectors:test`
- Run a single test file (pattern match):
  - `yarn test -- app/agents/__tests__/selector.test.ts`

### RAG / training utilities & exercises

These are one-off scripts in `app/scripts/` used from the command line.

- Vector similarity exercise:
  - `yarn exercise:vectors`
- Word-embedding "word math" exercise:
  - `yarn exercise:word-math`
- Estimate fine-tuning costs:
  - `yarn estimate-costs`
- Upload training data and start OpenAI fine-tuning job:
  - `yarn train`
- Process CSV and vectorize content (see `app/scripts/processCsvAndVectorize.ts`):
  - `yarn process-csv`
- Upload prepared vectors to the vector database:
  - `yarn upload-vectors`
- Trigger scraping via the API route (requires dev server running):
  - `yarn scrape-content` (hits `/api/scrape-content`)

## Environment & external services

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

### Vector databases

There are two vector DB integrations; code paths are intentionally educational and partially incomplete.

- **Qdrant (primary for current RAG agent implementation)**
  - Client: `app/libs/qdrant.ts`
  - Env vars: `QDRANT_URL`, `QDRANT_API_KEY`.
  - Collections:
    - `articles` – long-form article chunks.
    - `posts` – single LinkedIn posts.
- **Pinecone (used in exercises / alternate RAG pipeline)**
  - Client & helpers: `app/libs/pinecone.ts` and places where `pineconeClient` is imported.
  - Env vars: `PINECONE_API_KEY`, `PINECONE_INDEX`.

### Other required env vars (from `README.md`)

- `PINECONE_INDEX` – index name (e.g. `rag-tutorial`).
- `HELICONE_API_KEY` – for observability.

Consult `.env.example` and `README.md` for up-to-date variables before modifying env-dependent code.

## High-level architecture

### Next.js app structure

- `app/page.tsx` – main chat UI for interacting with agents.
- `app/api/` – Next.js App Router API routes (e.g. `chat`, `select-agent`, `upload-document`, ingestion/testing routes).
- `app/agents/` – agent types, configs, implementations, guardrails, and tests.
- `app/components/` – shared UI components reused across pages.
- `app/libs/` – integrations with third-party services (OpenAI, Qdrant, Pinecone) and shared utilities like chunking.
- `app/scripts/` – Node scripts for scraping, data preparation, fine-tuning, and vector uploads (run via Yarn scripts).
- `app/scripts/data/` – raw content (articles, CSVs, etc.) used for building the RAG knowledge base.
- `app/services/` – backend services that encapsulate business logic and are called from API routes.

### Multi-agent request flow

The core feature is a two-stage, LLM-driven multi-agent system.

**1. Agent selection (`app/api/select-agent/route.ts`)**

- Receives recent chat `messages` from the client.
- Uses `agentConfigs` (`app/agents/config.ts`) to describe available agents.
- Calls OpenAI via `openaiClient.responses.parse` with `zodTextFormat` to produce a **structured** response matching `agentSelectionSchema`.
- Returns a JSON payload with:
  - `agent` – one of the `AgentType` values (`linkedin` or `rag`).
  - `query` – refined user query (spelling fixes, removed noise, etc.).
  - `confidence` – 1–10 confidence score.

**2. Agent execution (`app/api/chat/route.ts`)**

- Validates the request body with Zod (`chatSchema`).
- Extracts the original user query from the last message.
- Looks up the appropriate executor via `getAgent` in `app/agents/registry.ts`.
- Invokes the selected agent with an `AgentRequest` (includes agent type, refined query, original query, and message history).
- Each agent returns a `StreamTextResult`; the route responds with `result.toTextStreamResponse()` to stream tokens to the client.

### Agent layer

- Types & contracts: `app/agents/types.ts`
  - `AgentType` (Zod enum: `linkedin`, `rag`).
  - `Message` schema mirrors chat messages (`role`, `content`).
  - `AgentRequest` and `AgentResponse` unify how agents are called and what they return.
- Registry: `app/agents/registry.ts`
  - `agentRegistry` maps `AgentType` → executor function.
  - `getAgent` is the single lookup point for handler selection; add new agents here.
- Config: `app/agents/config.ts` describes each agent for the selector.

#### LinkedIn agent (`app/agents/linkedin.ts`)

- Focused on generating/refining professional LinkedIn posts.
- Uses Vercel AI SDK `streamText` with OpenAI models (`openai("gpt-4o")` by default; can be updated to use `OPENAI_FINETUNED_MODEL`).
- System prompts should:
  - Incorporate both `request.originalQuery` and `request.query`.
  - Emphasize style, tone, and engaging LinkedIn content.

#### RAG agent (`app/agents/rag.ts`)

- Implements a multi-stage RAG pipeline on top of Qdrant + Cohere, returning a streamed LinkedIn-style answer based on external content.
- Current pipeline (simplified):
  1. **Guardrail layer 1 – LLM classification** via `checkQueryRelevance` from `app/agents/guardrails.ts`.
     - Cheap `gpt-4o-mini` structured classifier decides whether the query is in-scope for the knowledge base.
     - Off-topic queries return a static rejection stream (`createStaticTextStream(buildRejectionMessage())`).
  2. **Embeddings** via `openaiClient.embeddings.create` with `text-embedding-3-small` (512 dimensions).
  3. **Vector search** across Qdrant `posts` and `articles` collections.
  4. **Guardrail layer 2 – similarity threshold** using `SIMILARITY_SCORE_THRESHOLD` (0.5).
     - If no results exceed threshold, returns `createStaticTextStream(buildNoContentFoundMessage())`.
  5. **Reranking** via Cohere (`cohereClient.rerank`) on the combined candidate set.
  6. **Generation** via `streamText` using `openai("gpt-4o")`, with reranked documents serialized into the system prompt to steer style/tone/content.
- The bottom half of `rag.ts` contains TODOs that describe an alternative Pinecone-based implementation; do not complete these without an explicit user request.

### Guardrails and observability

- Guardrails module: `app/agents/guardrails.ts`.
  - Defines in-scope topics (software development, LinkedIn content, AI, career advice).
  - Implements a two-layer guardrail strategy: LLM relevance classifier + vector similarity threshold.
  - Uses OpenAI structured outputs via Zod (`relevanceSchema` with `zodTextFormat`).
  - Provides helpers for consistent rejection/no-content messages and for building static streaming responses with `MockLanguageModelV2`.
- OpenAI client (`app/libs/openai/openai.ts`) routes all calls through Helicone with headers for caching and observability.

### Ingestion & chunking pipeline

- Chunking utility: `app/libs/chunking.ts`.
  - Defines `Chunk`, `LinkedInPost`, and `MediumArticle` types used across ingestion and scripts.
  - `chunkText` implements sentence-based chunking with character overlap and rich metadata (source, indices, ranges).
  - Helpers like `extractLinkedInPosts` and `extractMediumArticle` parse exported CSV and Medium HTML into normalized objects.
- Qdrant ingestion helpers: `app/libs/qdrant.ts`.
  - `upsertArticleChunks` – uploads article chunks and embeddings into the `articles` collection with payload metadata.
  - `upsertLinkedInPost` – uploads single-post embeddings into the `posts` collection with content and engagement metadata.
- Pinecone helper: `app/libs/pinecone.ts`.
  - Exposes a `pineconeClient` and a `searchDocuments` stub with detailed TODOs describing a Pinecone-based semantic search pipeline.
  - When upserting vectors to Pinecone (e.g., from upload routes or scripts), always include the original chunk text in metadata (for example as `text`) so retrieved results can be sent back to the LLM.
- Upload API route: `app/api/upload-document/route.ts`.
  - Exposes a JSON POST endpoint for uploading arbitrary text and pushing it through chunking + embedding + Pinecone upsert.
  - The route is largely TODO-driven, documenting the full ingestion workflow; avoid auto-completing it without explicit instruction.

### Testing architecture

- Jest config in `jest.config.js`:
  - `roots: ['<rootDir>/app']`, `testEnvironment: 'node'`, and `ts-jest` transformer.
  - Tests avoid spinning up an HTTP server; API handlers are imported and invoked directly.
- Example: `app/agents/__tests__/selector.test.ts` calls `POST` from `app/api/select-agent/route.ts` using a mocked `NextRequest`.
- When adding tests, follow the same pattern: import the route handler or library function directly and test behavior (especially routing decisions or structure, not verbatim LLM text).

## Conventions & rules for agents

The following are adapted from `.cursorrules/general_rules.mdc`, `.github/copilot-instructions.md`, and existing code.

### API routes & client access

- When creating new API routes, follow the existing App Router pattern under `app/api/<route>/route.ts`.
- Project rules reference a `typedRoute` helper and a `fetchApiRoute` client helper; when these are present in this branch, prefer them for strongly-typed request/response definitions and client calls.
- Always validate incoming requests with Zod schemas at the edge of the system (see `select-agent` and `chat` routes as examples).

### Streaming responses

- All agents should return `AgentResponse` (`StreamTextResult` from Vercel AI SDK).
- For HTTP APIs that surface agent output, always convert to an HTTP stream using `result.toTextStreamResponse()` (see `app/api/chat/route.ts`).
- For non-LLM, static responses (e.g., guardrail rejections), use `createStaticTextStream` so the API contract stays consistent while avoiding unnecessary LLM calls.

### Commenting guidelines (teaching-focused)

When editing or adding AI/RAG-related code, maintain and extend the existing **educational comment style**:

- Explain both **"what"** and **"why"** for each significant step in the pipeline (embeddings, vector search, chunking, reranking, streaming, fine-tuning).
- Target early-career developers:
  - Avoid assuming prior experience with embeddings, vector DBs, or LLM streaming.
  - Prefer focused explanations that spell out the underlying concepts and trade-offs rather than one-line comments.
- For new features, mirror the depth and tone of comments in:
  - `app/libs/chunking.ts`
  - `app/libs/qdrant.ts`
  - `app/agents/guardrails.ts`

### Adding new agents or capabilities

- Extend `AgentType` and `agentTypeSchema` in `app/agents/types.ts`.
- Add a corresponding entry in `agentConfigs` (`app/agents/config.ts`) so the selector can describe it.
- Register the executor in `agentRegistry` (`app/agents/registry.ts`).
- Update the selector logic only if necessary; it already uses config-driven descriptions and structured outputs to decide.
- Add targeted Jest tests under `app/agents/__tests__/` that:
  - Call the relevant API route handler directly.
  - Assert on routing decisions and response shape, not exact LLM strings.

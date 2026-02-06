# Board of Directors RAG

A production Next.js + TypeScript application that lets you chat with your personal **Board of Directors** — 18 YouTube mentors covering business, fitness, tech, content creation, and more. Ask any mentor a question, and the system retrieves relevant knowledge from their actual YouTube transcripts, reranks it for quality, and streams a response in their voice and style.

This is a multi-agent RAG (Retrieval Augmented Generation) system. Instead of a single chatbot with generic knowledge, each mentor is a specialized agent grounded in their real content. The system intelligently routes your question to the right mentor, searches their transcript library via vector embeddings, and generates responses that sound like they're actually coming from that person.

<!-- TODO Screenshot: The main chat UI showing a conversation with a mentor. Capture a full browser window with a user question and a streamed mentor response visible, including the mentor's name displayed above their message. -->

---

## How It Works

The system follows a **two-stage request flow** — first it figures out _who_ should answer, then it _executes_ the answer with that mentor's knowledge.

```
User Question
    │
    ▼
┌─────────────────────────┐
│  POST /api/select-agent │  Stage 1: Mentor Selection
│  (gpt-4o-mini)          │  - Reads last 5 messages for context
│  - Picks the best       │  - Matches query topic to mentor expertise
│    mentor for the query │  - Refines/cleans up the user's query
│  - Returns: mentorId,   │  - Returns structured JSON via Zod schema
│    refined query,       │
│    confidence score     │
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│  POST /api/chat         │  Stage 2: RAG Pipeline
│  (gpt-4o)               │
│  1. Guardrail Layer 1   │  LLM classification — reject off-topic queries cheaply
│  2. Embed the query     │  text-embedding-3-small (512 dimensions)
│  3. Vector search       │  Qdrant filtered by mentor's channelName
│  4. Guardrail Layer 2   │  Similarity threshold (0.3) — reject weak matches
│  5. Rerank results      │  Cohere rerank-english-v3.0 (top 10)
│  6. Stream response     │  GPT-4o with mentor personality + transcript context
└─────────────────────────┘
    │
    ▼
Streamed Response (in the mentor's voice)
```

### Why Two Stages?

Separating mentor selection from response generation gives us several advantages:

1. **Cheap routing**: The selector uses `gpt-4o-mini` (~$0.0001 per call) to quickly decide who should answer, while the actual generation uses the more capable `gpt-4o`.
2. **Query refinement**: The selector cleans up typos, removes filler words, and restructures the query for better vector search results.
3. **Confidence scoring**: The selector returns a 1-10 confidence score, which can be used for logging, debugging, or fallback logic.

---

## The Mentors

The Board of Directors consists of **18 mentors** across different domains. Each mentor has a configured personality, expertise list, and a library of YouTube transcript chunks stored in Qdrant.

| Mentor            | Channel            | Domain                                                     |
| ----------------- | ------------------ | ---------------------------------------------------------- |
| Alex Hormozi      | AlexHormozi        | Business scaling, offers, pricing, sales                   |
| Steven Bartlett   | DOACBehindTheDiary | Entrepreneurship, investing, podcasting, leadership        |
| Damii             | DamiiBTS           | Mental toughness, gym mindset, brand building              |
| Dan Koe           | DanKoeTalks        | One-person business, writing, digital products             |
| George Heaton     | George.Heaton      | Streetwear fashion, e-commerce, brand building             |
| Hercules Nicolaou | HerculesNicolaou   | Ultra-distance running, marathon training, discipline      |
| Iman Gadzhi       | ImanGadzhi         | Agency business, digital marketing, wealth building        |
| Jake Dearden      | JakeDearden        | Hyrox, hybrid athletics, endurance sports                  |
| Luke Made It      | LukeMadeIt         | Developer hardware, programming productivity, tech reviews |
| Ross Mackay       | RossMackay1        | Running, fitness startups, work-life balance               |
| Brian Jenney      | brianjenney        | Learning to code, JavaScript, React, career transitions    |
| Daniel Dalen      | danieldalen        | E-commerce, Asia business, bootstrapping, AI tools         |
| Dan Martell       | danmartell         | SaaS, productivity, buying back time, angel investing      |
| Dom Iacovone      | diacovone          | Content strategy, personal branding, marketing             |
| Nick Bare         | nickbarefitness    | Hybrid athlete training, military mindset, supplements     |
| Open Residency    | openresidency      | Psychology, power dynamics, strategy interviews            |
| Will Phillips     | willphillipsclips  | Silicon Valley, angel investing, startup documentation     |
| Marko             | withmarko          | Indie hacking, SaaS development, building in public        |

Mentor configurations (name, expertise, personality prompts) are defined in `app/mentors/config.ts`. The selector uses these descriptions to route queries, and the RAG agent uses the personality field to shape the tone of the response.

---

## The RAG Pipeline (In Detail)

When a user asks a question, here's exactly what happens inside the RAG agent (`app/agents/rag.ts`):

### 1. Guardrail Layer 1 — LLM Classification

Before doing any expensive work, a cheap `gpt-4o-mini` call checks if the query is even relevant to what our mentors know about. This catches obviously off-topic queries like "What's the weather?" or "Tell me a joke" and returns a friendly rejection message.

**Why?** A full RAG pipeline (embedding + vector search + reranking + generation) costs ~$0.01-0.03 per query. The guardrail classifier costs ~$0.0001. Rejecting junk early saves 99% of the cost on those queries and prevents the LLM from hallucinating answers using unrelated context.

The list of accepted topics is defined in `app/agents/guardrails.ts` and covers business, fitness, content creation, software development, mindset, investing, and psychology — matching the collective expertise of all 18 mentors.

### 2. Embedding Generation

The query is converted into a 512-dimensional vector using OpenAI's `text-embedding-3-small` model. This is the same model used when the transcripts were originally uploaded, so the vectors live in the same embedding space and can be compared.

### 3. Vector Search (Qdrant)

The embedding is searched against the `transcripts` collection in Qdrant with a **filter** on `channelName` matching the selected mentor. This means we only search through that specific mentor's content — not the entire corpus. We over-fetch 20 results to give the reranker a good pool to work with.

### 4. Guardrail Layer 2 — Similarity Threshold

Even if the LLM classifier approved the query, the vector search results might all have low similarity scores. This happens when the query uses unusual phrasing or asks about something the mentor never discussed. Any results below the threshold (0.3) are filtered out. If nothing remains, the user gets a message explaining the mentor doesn't have content on that specific topic.

### 5. Cohere Reranking

Vector search finds semantically similar content, but "similar" doesn't always mean "relevant to the question." Cohere's `rerank-english-v3.0` model re-scores the results by actually reading the query and each document together, producing much better relevance ordering. We take the top 10 results after reranking.

**Why rerank?** A query like "How do I price my product?" might return chunks about pricing, about products, and about strategies — all semantically close. The reranker understands the _intent_ and pushes the chunks that specifically discuss pricing strategy to the top.

### 6. Streaming Response

The reranked transcript excerpts are injected into a system prompt along with the mentor's personality description and expertise list. GPT-4o generates a response _in the mentor's voice_, drawing from their actual content. The response is streamed token-by-token to the frontend using Vercel AI SDK's `streamText`.

---

## Data Pipeline

### Where the Data Comes From

YouTube transcripts are fetched using `app/scripts/fetch_youtube_transcripts.py` and stored as JSON files under `app/scripts/data/transcripts/{channelName}/`. Each file contains the full transcript text plus metadata (video ID, title, view count, duration, publish date).

### How Transcripts Are Chunked

YouTube auto-generated transcripts typically have **no punctuation**. A 90,000-character transcript might contain only 6 periods. This breaks naive sentence-based chunking because the entire transcript looks like one massive "sentence."

The chunking implementation (`app/libs/chunking.ts`) handles this with a two-layer approach:

1. **Sentence splitting**: Split on `.!?` delimiters to preserve natural language boundaries where they exist.
2. **Word-boundary fallback**: When a "sentence" exceeds the chunk size (because there's no punctuation), `splitAtWordBoundary()` splits at the last space before the limit — never mid-word.

**Configuration**: 1000-character chunks with 200-character overlap. The overlap ensures that if a concept spans two chunks, both chunks have enough context for the embeddings to capture the meaning.

For a detailed explanation of the chunking strategy, see `app/files/chunking-strategy.md`.

### How Transcripts Are Uploaded

The upload script (`app/scripts/upload-transcripts.ts`) processes all transcripts:

1. Read JSON transcript files from `app/scripts/data/transcripts/{channelName}/`
2. Chunk each transcript (1000 chars, 200 overlap)
3. Generate embeddings in batches of 30 via OpenAI `text-embedding-3-small` (512 dimensions)
4. Upsert to the Qdrant `transcripts` collection with full metadata (video URL, channel name, title, view count, etc.)

The `channelName` field is stored as a keyword-indexed payload in Qdrant, enabling fast filtered searches per mentor.

**Stats**: ~15,600 chunks from ~484 transcripts across 18 channels.

---

## Guardrails

The system uses a **two-layer guardrail strategy** to prevent wasted computation and hallucinated responses. Both layers are implemented in `app/agents/guardrails.ts`.

| Layer                | When It Runs            | What It Catches                                    | Cost                      |
| -------------------- | ----------------------- | -------------------------------------------------- | ------------------------- |
| LLM Classification   | Before embedding/search | Off-topic queries ("recipe for pasta")             | ~$0.0001                  |
| Similarity Threshold | After vector search     | Queries with no good matches in the knowledge base | Free (post-search filter) |

When a query is rejected, the system returns a **static text stream** (no LLM call) with a helpful message listing the types of topics the mentors can help with. This keeps the API contract consistent — the frontend always receives a stream, whether it's from GPT-4o or a pre-written rejection message.

---

## Tech Stack

| Layer         | Technology                                       | Purpose                                  |
| ------------- | ------------------------------------------------ | ---------------------------------------- |
| Frontend      | Next.js 15 (App Router), TypeScript, TailwindCSS | Chat UI with real-time streaming         |
| Backend       | Next.js API Routes                               | Two endpoints: mentor selection + chat   |
| Embeddings    | OpenAI `text-embedding-3-small` (512d)           | Convert text to vectors for search       |
| Generation    | OpenAI `gpt-4o`                                  | Mentor-style response generation         |
| Routing       | OpenAI `gpt-4o-mini` + Zod structured outputs    | Cheap, fast mentor selection             |
| Vector DB     | Qdrant Cloud                                     | Store and search transcript embeddings   |
| Reranking     | Cohere `rerank-english-v3.0`                     | Improve retrieval quality after search   |
| Observability | Helicone                                         | LLM call logging, cost tracking, caching |
| Testing       | Jest + ts-jest                                   | Guardrails, chunking, agent routing      |

---

## Project Structure

```
board-of-directors-rag/
│
├── app/
│   ├── page.tsx                    # Main chat UI — message input, streaming display, mentor names
│   ├── layout.tsx                  # Root layout with global styles
│   ├── globals.css                 # TailwindCSS global styles
│   │
│   ├── api/                        # Next.js API routes (the backend)
│   │   ├── select-agent/
│   │   │   └── route.ts            # POST — LLM router that picks the best mentor + refines query
│   │   ├── chat/
│   │   │   └── route.ts            # POST — Executes RAG pipeline and streams the response
│   │   └── rag-test/
│   │       └── route.ts            # POST — Debug endpoint for testing RAG without the full flow
│   │
│   ├── agents/                     # Agent logic (the brains)
│   │   ├── rag.ts                  # RAG agent — embedding, search, rerank, generate
│   │   ├── guardrails.ts           # Two-layer guardrail system + topic definitions
│   │   ├── registry.ts             # Agent registry — maps agent types to executor functions
│   │   ├── types.ts                # Zod schemas for AgentType, Message, AgentRequest
│   │   └── __tests__/
│   │       ├── guardrails.test.ts  # 24 tests: topic relevance, thresholds, rejection messages
│   │       └── selector.test.ts    # Tests for mentor routing accuracy
│   │
│   ├── mentors/
│   │   └── config.ts               # All 18 mentor profiles: name, expertise[], personality
│   │
│   ├── libs/                       # Third-party integrations and shared utilities
│   │   ├── openai/
│   │   │   └── openai.ts           # Shared OpenAI client configured with Helicone proxy
│   │   ├── qdrant.ts               # Qdrant client + collection helpers
│   │   ├── cohere.ts               # Cohere reranking client
│   │   ├── chunking.ts             # Text chunking with sentence-splitting + word-boundary fallback
│   │   └── chunking.test.ts        # 19 tests: chunk sizes, overlap, edge cases, no-punctuation
│   │
│   ├── scripts/                    # Data ingestion and processing scripts
│   │   ├── fetch_youtube_transcripts.py  # Python script to fetch transcripts from YouTube
│   │   ├── upload-transcripts.ts         # Chunk + embed + upsert transcripts to Qdrant
│   │   └── data/
│   │       ├── channels.json             # ⚠️ .gitignored — Channel list with URLs and names
│   │       └── transcripts/              # ⚠️ .gitignored — Raw transcript JSON files
│   │           ├── AlexHormozi/          # Alex Hormozi's transcripts
│   │           ├── DOACBehindTheDiary/   # Steven Bartlett's transcripts
│   │           ├── brianjenney/          # Brian Jenney's transcripts
│   │           └── ...                   # 15 more channel folders
│   │
│   └── files/
│       └── chunking-strategy.md    # Detailed documentation of the chunking approach
│
├── .env                            # API keys (not committed)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── jest.config.js
└── AGENTS.md                       # AI assistant instructions for working with this codebase
```

---

## Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/alicagatay/board-of-directors-rag.git
cd board-of-directors-rag
nvm use # if using Node Version Manager
yarn install # or npm install if you prefer using npm
```

### 2. Set Up Environment Variables

Create a `.env` file in the root:

```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_FINETUNED_MODEL=your_finetuned_openai_model # optional if you want to use a fine tuned model instead of gpt-4o-mini for mentor selection
HELICONE_API_KEY=your_helicone_api_key
QDRANT_URL=your_qdrant_cluster_url
QDRANT_API_KEY=your_qdrant_api_key
COHERE_API_KEY=your_cohere_api_key
```

- **OpenAI** (https://platform.openai.com/api-keys) — Used for embeddings (`text-embedding-3-small`), generation (`gpt-4o`), routing (`gpt-4o-mini`), and guardrail classification.
- **Helicone** (https://www.helicone.ai/) — All OpenAI calls are proxied through Helicone for observability, cost tracking, and response caching. Free tier available.
- **Qdrant** (https://cloud.qdrant.io/) — Managed vector database. Create a cluster with 512 dimensions and cosine similarity. Free tier available.
- **Cohere** (https://cohere.ai/) — Used for reranking search results. Free tier available.

### 3. Create the Channels Config

Create `app/scripts/data/channels.json` with the YouTube channels you want to include:

```json
[
  {
    "channelUrl": "https://www.youtube.com/@AlexHormozi",
    "name": "Alex Hormozi"
  },
  {
    "channelUrl": "https://www.youtube.com/@DanKoeTalks",
    "name": "Dan Koe"
  }
]
```

This file is `.gitignored` because it defines your personal board of directors. Add as many channels as you want — each will become a mentor in your system.

### 4. Fetch and Upload Transcripts

```bash
# Install Python dependencies
pip install -r requirements.txt

# Fetch transcripts from YouTube (30 videos per channel by default)
python app/scripts/fetch_youtube_transcripts.py

# Chunk, embed, and upload to Qdrant (~5 min, ~15K chunks)
yarn tsx app/scripts/upload-transcripts.ts
```

### 5. Run the Dev Server

```bash
yarn dev
```

Open `http://localhost:3000` and start chatting with your Board of Directors.

<!-- TODO Screenshot: The landing page of the app when first opened, before any messages are sent. Show the empty chat UI with the input field visible. -->

---

## Commands

| Command              | Purpose                                |
| -------------------- | -------------------------------------- |
| `yarn dev`           | Start dev server (Next.js + Turbopack) |
| `yarn build`         | Production build                       |
| `yarn start`         | Start production server                |
| `yarn test`          | Run all Jest tests                     |
| `yarn test:selector` | Test mentor routing logic              |
| `yarn test:chunking` | Test text chunking                     |
| `yarn lint`          | Run ESLint                             |

---

## Example Interactions

<!-- TODO Screenshot: A conversation where a user asks Alex Hormozi about pricing strategy. Show the streamed response with the mentor name "Alex Hormozi" displayed above it. -->

**Business scaling** → Ask Alex Hormozi: _"How should I structure my offer to maximize conversions?"_

**Learning to code** → Ask Brian Jenney: _"What's the best way to learn React as a beginner?"_

**Hybrid fitness** → Ask Jake Dearden: _"How do I train for my first Hyrox race?"_

**SaaS growth** → Ask Dan Martell: _"How do I buy back my time as a founder?"_

**Startup investing** → Ask Will Phillips: _"What do you look for when angel investing in early-stage startups?"_

<!-- TODO Screen recording: A full interaction showing the user typing a question, the brief pause while the mentor is selected, then the response streaming in token by token. About 10-15 seconds of footage. -->

---

## Testing

Tests call API route handlers and library functions directly — no server required.

```bash
# Run all tests
yarn test

# Guardrails: topic relevance, thresholds, rejection messages (24 tests)
yarn test -- app/agents/__tests__/guardrails.test.ts

# Chunking: chunk sizes, overlap, word-boundary fallback, edge cases (19 tests)
yarn test -- app/libs/chunking.test.ts

# Mentor routing: verifies correct mentor selection for different query types
yarn test:selector
```

---

## Resources

- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings) — How text embeddings work
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) — Zod-based schema enforcement for LLM responses
- [Qdrant Documentation](https://qdrant.tech/documentation/) — Vector search and filtering
- [Cohere Rerank](https://docs.cohere.com/docs/rerank) — Improving retrieval quality
- [Vercel AI SDK](https://sdk.vercel.ai/docs) — Streaming LLM responses in Next.js
- [Helicone Documentation](https://docs.helicone.ai) — LLM observability and monitoring
- [Next.js App Router](https://nextjs.org/docs) — Server-side API routes and React framework

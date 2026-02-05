/**
 * QDRANT VECTOR DATABASE CLIENT
 *
 * WHAT IS QDRANT?
 * Qdrant is a vector database that stores and searches high-dimensional embeddings.
 * Think of it as a specialized database optimized for "similarity search" rather than
 * exact matches like traditional databases.
 *
 * WHY DO WE NEED IT?
 * When you embed text using OpenAI (convert text to numbers), you get a 512-dimensional
 * vector. Qdrant stores these vectors and can quickly find the most similar ones using
 * mathematical distance calculations (cosine similarity).
 *
 * HOW IT WORKS:
 * 1. You upload vectors with metadata (the actual text, source URL, etc.)
 * 2. When a user asks a question, you convert their question to a vector
 * 3. Qdrant finds the closest matching vectors in the database
 * 4. You use those results as context for your LLM to generate an answer
 *
 * CLOUD vs LOCAL:
 * - Cloud (what we use): Qdrant hosts the database for you at a URL
 * - Local: You can run Qdrant on your machine with Docker
 *
 * Learn more: https://qdrant.tech/documentation/
 */

// Load environment variables when running scripts (Next.js loads them automatically)
if (typeof window === "undefined" && !process.env.NEXT_RUNTIME) {
  require("dotenv").config();
}

import { QdrantClient } from "@qdrant/js-client-rest";

/**
 * Initialize Qdrant client with cloud credentials.
 *
 * The client connects to your Qdrant cloud instance using:
 * - url: Your unique Qdrant cluster endpoint
 * - apiKey: Authentication key to access your data
 *
 * This client will be used throughout the app to:
 * - Upload embeddings (upsert operation)
 * - Search for similar vectors (search operation)
 * - Manage collections (create, delete)
 */
export const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY,
});

// Import types for helper functions
import type { Chunk, YouTubeTranscript } from "./chunking";

/**
 * COLLECTION NAMES
 *
 * We use separate collections for different content types because:
 * - Different metadata schemas (articles have title/author; posts have likes)
 * - Different retrieval patterns (may want to search only articles or only posts)
 * - Easier to manage and scale independently
 * - Can apply different indexing strategies per collection
 */
const TRANSCRIPTS_COLLECTION = "transcripts";

/**
 * Upserts transcript chunks to the Qdrant "transcripts" collection.
 *
 * WHY CHUNK TRANSCRIPTS?
 * YouTube transcripts are long (5,000-50,000+ characters) and need chunking for:
 * - Precise retrieval: Return only the relevant section, not the whole transcript
 * - Semantic coherence: Spoken content is less dense than written, needs larger chunks
 * - Context preservation: 200-char overlap captures pronoun resolution in speech
 *
 * CHUNK PARAMETERS:
 * - Size: 1000 characters (2x article chunks because spoken content is ~2x less dense)
 * - Overlap: 200 characters (captures pronoun antecedents in conversational speech)
 *
 * @param chunks - Array of text chunks with metadata (from chunkText())
 * @param embeddings - Array of 512-dimensional vectors (from OpenAI)
 * @param transcript - Original transcript metadata for enriching each chunk
 */
export async function upsertTranscriptChunks(
  chunks: Chunk[],
  embeddings: number[][],
  transcript: Omit<YouTubeTranscript, "text">,
): Promise<void> {
  const points = chunks.map((chunk, index) => ({
    id: crypto.randomUUID(),
    vector: embeddings[index],
    payload: {
      // Chunk-level metadata
      ...chunk.metadata,
      content: chunk.content,
      // Transcript-level metadata for filtering and attribution
      videoId: transcript.videoId,
      videoUrl: transcript.videoUrl,
      channelName: transcript.channelName,
      channelUrl: transcript.channelUrl,
      title: transcript.title,
      viewCount: transcript.viewCount,
      duration: transcript.duration,
      publishedTime: transcript.publishedTime,
      contentType: "transcript",
    },
  }));

  await qdrantClient.upsert(TRANSCRIPTS_COLLECTION, {
    wait: true,
    points,
  });
}

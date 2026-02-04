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
import type { Chunk, LinkedInPost } from "./chunking";

/**
 * COLLECTION NAMES
 *
 * We use separate collections for different content types because:
 * - Different metadata schemas (articles have title/author; posts have likes)
 * - Different retrieval patterns (may want to search only articles or only posts)
 * - Easier to manage and scale independently
 * - Can apply different indexing strategies per collection
 */
const ARTICLES_COLLECTION = "articles";
const POSTS_COLLECTION = "posts";

/**
 * Upserts article chunks to the Qdrant "articles" collection.
 *
 * WHY THIS HELPER EXISTS:
 * Encapsulates the Qdrant upsert logic so API routes stay thin and focused on
 * request handling. Also makes the upsert pattern reusable across different
 * parts of the codebase (API routes, scripts, etc.).
 *
 * WHAT IS UPSERT?
 * Upsert = Update + Insert. If a point with the same ID exists, it's updated;
 * otherwise, a new point is created. This makes operations idempotent—running
 * the same upload twice won't create duplicates.
 *
 * WHY wait: true?
 * Qdrant can acknowledge writes immediately (async) or wait until data is fully
 * indexed and searchable (sync). We wait to ensure consistency—the data is
 * searchable immediately after this function returns.
 *
 * @param chunks - Array of text chunks with metadata (from chunkText())
 * @param embeddings - Array of 512-dimensional vectors (from OpenAI)
 *
 * IMPORTANT: chunks and embeddings must be the same length and in the same order.
 * chunks[i] corresponds to embeddings[i].
 */
export async function upsertArticleChunks(
  chunks: Chunk[],
  embeddings: number[][],
): Promise<void> {
  // Build points array - each point is a vector with its metadata
  const points = chunks.map((chunk, index) => ({
    // Random UUID ensures uniqueness even if the same content is uploaded multiple times
    id: crypto.randomUUID(),
    // The 512-dimensional embedding vector used for similarity search
    vector: embeddings[index],
    // Payload contains all searchable/filterable metadata plus the original text
    payload: {
      ...chunk.metadata, // source, chunkIndex, totalChunks, title, author, date, etc.
      content: chunk.content, // The actual text chunk - returned with search results
    },
  }));

  /**
   * BATCH UPSERT
   *
   * We upload all points in a single API call for efficiency.
   * For very large uploads (10K+ points), you might want to batch these
   * into groups of 100-1000 to avoid timeout issues.
   */
  await qdrantClient.upsert(ARTICLES_COLLECTION, {
    wait: true, // Wait for indexing to complete before returning
    points,
  });
}

/**
 * Upserts a single LinkedIn post to the Qdrant "posts" collection.
 *
 * WHY NO CHUNKING FOR POSTS?
 * LinkedIn posts are naturally short (100-3000 characters), so:
 * - The entire post fits in one embedding
 * - No need to split into chunks
 * - Search returns complete posts, not fragments
 *
 * CONTRAST WITH ARTICLES:
 * Articles are long (5,000+ words) and need chunking for precise retrieval.
 * Posts are short and represent single, cohesive thoughts.
 *
 * @param post - LinkedIn post object with text, date, url, likes
 * @param embedding - 512-dimensional vector from OpenAI
 */
export async function upsertLinkedInPost(
  post: LinkedInPost,
  embedding: number[],
): Promise<void> {
  await qdrantClient.upsert(POSTS_COLLECTION, {
    wait: true, // Wait for indexing to complete
    points: [
      {
        id: crypto.randomUUID(),
        vector: embedding,
        payload: {
          // Store the original text for retrieval - this is what gets sent to the LLM
          content: post.text,
          // Attribution metadata
          url: post.url,
          date: post.date,
          // Engagement metric - can be used for filtering/ranking
          likes: post.likes,
          // Content type identifier - useful for filtering searches by type
          contentType: "linkedin",
        },
      },
    ],
  });
}

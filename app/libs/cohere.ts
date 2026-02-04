/**
 * COHERE CLIENT INTEGRATION
 *
 * WHAT IS COHERE?
 * Cohere is an AI company that provides specialized NLP models. While OpenAI excels
 * at general text generation, Cohere offers best-in-class reranking models that
 * significantly improve RAG retrieval quality.
 *
 * WHAT IS RERANKING AND WHY DO WE NEED IT?
 * Vector search (what Qdrant does) is fast but approximate. It finds documents whose
 * embeddings are mathematically close to the query embedding. However, this "closeness"
 * doesn't always mean "most relevant."
 *
 * THE PROBLEM:
 * Query: "How do I handle errors in React hooks?"
 * Vector search might return:
 *   1. "React hooks overview" (score: 0.89) - talks about hooks but not errors
 *   2. "Error handling in React" (score: 0.85) - talks about errors but not hooks
 *   3. "useEffect error handling patterns" (score: 0.82) - exactly what we need!
 *
 * THE SOLUTION (Reranking):
 * Rerankers use cross-encoders that see BOTH the query AND document together,
 * allowing them to understand the relationship more deeply. After reranking:
 *   1. "useEffect error handling patterns" (score: 0.95) - moved to top!
 *   2. "Error handling in React" (score: 0.72)
 *   3. "React hooks overview" (score: 0.45)
 *
 * WHY COHERE FOR RERANKING?
 * - Their rerank-english-v3.0 model is specifically trained for this task
 * - It's fast enough for real-time use (~100-200ms for 10 documents)
 * - Much cheaper than using GPT-4 for reranking
 * - Battle-tested in production RAG systems
 *
 * THE TWO-STAGE RETRIEVAL PATTERN:
 * 1. Vector search (Qdrant): Fast, retrieves 10-20 candidates (over-fetch)
 * 2. Rerank (Cohere): Slower but precise, reorders and keeps top 3-5
 *
 * This pattern gives you both speed AND accuracy.
 *
 * Learn more: https://docs.cohere.com/docs/rerank
 */

import { CohereClient } from "cohere-ai";

/**
 * Initialize Cohere client with API key.
 *
 * Get your free API key at: https://dashboard.cohere.com/
 * Free tier includes 1,000 rerank calls per month - plenty for development.
 */
export const cohereClient = new CohereClient({
  token: process.env.COHERE_API_KEY!,
});

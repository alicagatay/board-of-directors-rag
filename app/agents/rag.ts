import { AgentRequest, AgentResponse } from "./types";
import { openaiClient } from "@/app/libs/openai/openai";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { qdrantClient } from "../libs/qdrant";
import { cohereClient } from "../libs/cohere";
import {
  checkQueryRelevance,
  SIMILARITY_SCORE_THRESHOLD,
  buildRejectionMessage,
  buildNoContentFoundMessage,
  createStaticTextStream,
} from "./guardrails";

export async function ragAgent(request: AgentRequest): Promise<AgentResponse> {
  const { query } = request;

  /**
   * GUARDRAIL LAYER 1: LLM Classification
   *
   * Before any expensive operations (embedding, vector search, reranking),
   * we use a cheap LLM call (gpt-4o-mini) to check if the query is relevant
   * to our knowledge base topics.
   *
   * WHY DO THIS FIRST?
   * - Cost: gpt-4o-mini classification costs ~$0.0001 per query
   * - Full RAG pipeline costs ~$0.01-0.03 per query (100x more!)
   * - Rejecting irrelevant queries early saves significant costs at scale
   *
   * WHAT GETS REJECTED?
   * - Obviously off-topic queries: "What's the weather?", "Tell me a joke"
   * - Unrelated domains: recipes, sports, general trivia
   * - The classifier is generous - tangentially related queries pass through
   */
  const relevanceCheck = await checkQueryRelevance(query);

  if (!relevanceCheck.isRelevant) {
    console.log(
      `Query rejected by LLM guardrail: "${query}" - Reason: ${relevanceCheck.reason}`,
    );

    // Return a friendly message explaining what the agent can help with
    // Using createStaticTextStream to return the EXACT message without LLM processing
    // This saves cost (no GPT-4o call) and ensures consistent rejection messages
    return createStaticTextStream(buildRejectionMessage());
  }

  const embedding = await openaiClient.embeddings.create({
    model: "text-embedding-3-small",
    dimensions: 512,
    input: query,
  });

  const linkedInPosts = await qdrantClient.search("posts", {
    vector: embedding.data[0].embedding,
    limit: 10,
    with_payload: true,
  });

  const articles = await qdrantClient.search("articles", {
    vector: embedding.data[0].embedding,
    limit: 10,
    with_payload: true,
  });

  console.log("linkedInPosts", JSON.stringify(linkedInPosts, null, 2));
  console.log("articles", JSON.stringify(articles, null, 2));

  /**
   * GUARDRAIL LAYER 2: Similarity Score Threshold
   *
   * Even if the LLM classifier thought the query was relevant, the vector
   * search results might not have any good matches. This happens when:
   * - The query is about a niche topic not covered in indexed content
   * - The LLM was too generous in classification
   * - The query uses unusual phrasing that doesn't match embeddings well
   *
   * WHY 0.5 THRESHOLD?
   * Cosine similarity interpretation for text embeddings:
   * - 0.7-1.0: Highly relevant (same topic, similar meaning)
   * - 0.5-0.7: Moderately relevant (related topic)
   * - 0.3-0.5: Weakly relevant (tangential connection)
   * - < 0.3: Not relevant (different topics)
   *
   * We use 0.5 as a balanced threshold - strict enough to filter noise,
   * lenient enough to allow related content through.
   */
  const relevantPosts = linkedInPosts.filter(
    (post) => post.score >= SIMILARITY_SCORE_THRESHOLD,
  );
  const relevantArticles = articles.filter(
    (article) => article.score >= SIMILARITY_SCORE_THRESHOLD,
  );

  // If no results meet the similarity threshold, reject the query
  if (relevantPosts.length === 0 && relevantArticles.length === 0) {
    console.log(
      `Query rejected by similarity threshold: "${query}" - No results above ${SIMILARITY_SCORE_THRESHOLD}`,
    );

    // Return the exact "no content found" message without LLM processing
    return createStaticTextStream(buildNoContentFoundMessage());
  }

  // Use only the relevant results for reranking
  const rerankedDocuments = await cohereClient.rerank({
    model: "rerank-english-v3.0",
    query: query,
    documents: [
      ...relevantPosts.map((post) => post.payload?.content as string),
      ...relevantArticles.map((article) => article.payload?.content as string),
    ],
    topN: 10,
    returnDocuments: true,
  });

  console.log("rerankedDocuments", JSON.stringify(rerankedDocuments, null, 2));

  // we want to generate a linkedin post based on a user query
  return streamText({
    model: openai("gpt-4o"),
    messages: [
      {
        role: "system",
        content: `
				Generate a LinkedIn post based on a user query.
				Use the style, tone and experiences from these documents to generate the post.
				Documents: ${JSON.stringify(
          rerankedDocuments.results.map((result) => result.document?.text),
          null,
          2,
        )}
				`,
      },
      {
        role: "user",
        content: query,
      },
    ],
    temperature: 0.8,
  });

  // TODO: Step 1 - Generate embedding for the refined query
  // Use openaiClient.embeddings.create()
  // Model: 'text-embedding-3-small'
  // Dimensions: 512
  // Input: request.query
  // Extract the embedding from response.data[0].embedding

  // TODO: Step 2 - Query Pinecone for similar documents
  // Get the index: pineconeClient.Index(process.env.PINECONE_INDEX!)
  // Query parameters:
  //   - vector: the embedding from step 1
  //   - topK: 10 (to over-fetch for reranking)
  //   - includeMetadata: true

  // TODO: Step 3 - Extract text from results
  // Map over queryResponse.matches
  // Get metadata?.text (or metadata?.content as fallback)
  // Filter out any null/undefined values

  // TODO: Step 4 - Rerank with Pinecone inference API
  // Use pineconeClient.inference.rerank()
  // Model: 'bge-reranker-v2-m3'
  // Pass the query and documents array
  // This gives you better quality results

  // TODO: Step 5 - Build context from reranked results
  // Map over reranked.data
  // Extract result.document?.text from each
  // Join with '\n\n' separator

  // TODO: Step 6 - Create system prompt
  // Include:
  //   - Instructions to answer based on context
  //   - Original query (request.originalQuery)
  //   - Refined query (request.query)
  //   - The retrieved context
  //   - Instruction to say if context is insufficient

  // TODO: Step 7 - Stream the response
  // Use streamText()
  // Model: openai('gpt-4o')
  // System: your system prompt
  // Messages: request.messages
  // Return the stream

  throw new Error("RAG agent not implemented yet!");
}

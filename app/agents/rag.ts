import { AgentRequest, AgentResponse } from "./types";
import { openaiClient } from "@/app/libs/openai/openai";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { qdrantClient } from "../libs/qdrant";
import { cohereClient } from "../libs/cohere";
import { mentorConfigs } from "@/app/mentors/config";
import {
  checkQueryRelevance,
  SIMILARITY_SCORE_THRESHOLD,
  buildRejectionMessage,
  buildNoContentFoundMessage,
  createStaticTextStream,
} from "./guardrails";

export async function ragAgent(request: AgentRequest): Promise<AgentResponse> {
  const { query, mentorId } = request;

  // Get mentor configuration for personalized responses
  const mentor = mentorConfigs[mentorId];

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

  // Search the transcripts collection filtered by the selected mentor
  let transcripts;
  try {
    transcripts = await qdrantClient.search("transcripts", {
      vector: embedding.data[0].embedding,
      limit: 20, // Over-fetch for reranking
      with_payload: true,
      filter: {
        must: [
          {
            key: "channelName",
            match: { value: mentorId },
          },
        ],
      },
    });
  } catch (error: unknown) {
    console.error("Qdrant search error:", JSON.stringify(error, null, 2));
    throw error;
  }

  console.log(`Searching ${mentorId}'s transcripts...`);
  console.log("transcripts", JSON.stringify(transcripts, null, 2));

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
  const relevantTranscripts = transcripts.filter(
    (t) => t.score >= SIMILARITY_SCORE_THRESHOLD,
  );

  // If no results meet the similarity threshold, reject the query
  if (relevantTranscripts.length === 0) {
    console.log(
      `Query rejected by similarity threshold: "${query}" - No results above ${SIMILARITY_SCORE_THRESHOLD}`,
    );

    // Return the exact "no content found" message without LLM processing
    return createStaticTextStream(buildNoContentFoundMessage());
  }

  // Rerank results using Cohere for better quality
  const rerankedDocuments = await cohereClient.rerank({
    model: "rerank-english-v3.0",
    query: query,
    documents: relevantTranscripts.map((t) => t.payload?.content as string),
    topN: 10,
    returnDocuments: true,
  });

  console.log("rerankedDocuments", JSON.stringify(rerankedDocuments, null, 2));

  // Build context with video titles (all from same mentor now)
  const context = rerankedDocuments.results
    .map((result) => {
      const originalIdx = result.index;
      const transcript = relevantTranscripts[originalIdx];
      const title = transcript.payload?.title || "Untitled";
      return `[From: "${title}"]\n${result.document?.text}`;
    })
    .join("\n\n---\n\n");

  return streamText({
    model: openai("gpt-4o"),
    messages: [
      {
        role: "system",
        content: `You are ${mentor.name}, a member of the user's personal Board of Directors.

PERSONALITY & STYLE:
${mentor.personality}

YOUR EXPERTISE:
${mentor.expertise.join(", ")}

INSTRUCTIONS:
- Answer as ${mentor.name} would, using their communication style and perspective
- Draw from the provided transcript excerpts to give grounded, authentic responses
- Be practical and actionable in your advice
- If the transcripts don't contain enough information to fully answer, acknowledge this honestly
- Stay in character while being helpful

TRANSCRIPT EXCERPTS FROM YOUR CONTENT:
${context}`,
      },
      {
        role: "user",
        content: query,
      },
    ],
    temperature: 0.7,
  });
}

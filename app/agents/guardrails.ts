/**
 * QUERY RELEVANCE GUARDRAILS
 *
 * This module provides guardrails to filter out irrelevant queries BEFORE
 * they enter the expensive RAG pipeline (embedding → vector search → rerank → LLM).
 *
 * WHY GUARDRAILS MATTER IN RAG SYSTEMS:
 *
 * 1. COST SAVINGS: Each RAG query costs money:
 *    - Embedding generation: ~$0.00002 per query
 *    - Vector search: Database operations
 *    - Reranking: ~$0.001 per query (Cohere)
 *    - LLM generation: ~$0.01-0.03 per query (GPT-4o)
 *    By rejecting irrelevant queries early with a cheap classifier (gpt-4o-mini ~$0.0001),
 *    we save 99% of the cost on those queries.
 *
 * 2. PREVENTING HALLUCINATIONS: When the RAG system receives an off-topic query
 *    (e.g., "What's the weather?"), it will retrieve low-relevance documents and
 *    the LLM might hallucinate an answer using unrelated context. Guardrails
 *    prevent this by rejecting queries that don't match the knowledge base scope.
 *
 * 3. USER EXPERIENCE: Clear rejection messages help users understand what the
 *    system can and cannot do, guiding them toward productive queries.
 *
 * TWO-LAYER APPROACH:
 * - Layer 1 (LLM Classification): Fast, cheap check using gpt-4o-mini to catch
 *   obviously off-topic queries like "Tell me a joke" or "Recipe for pasta"
 * - Layer 2 (Similarity Score Threshold): After vector search, reject queries
 *   where all results have low similarity scores (< 0.5), catching edge cases
 *   the LLM might have missed
 *
 * Learn more about guardrails: https://docs.anthropic.com/claude/docs/guardrails
 */

import { z } from "zod";
import { openaiClient } from "@/app/libs/openai/openai";
import { zodTextFormat } from "openai/helpers/zod";
import { simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV2 } from "ai/test";
import { LanguageModelV2StreamPart } from "@ai-sdk/provider";
import { AgentResponse } from "./types";

/**
 * Topics that the Board of Directors mentors can help with.
 *
 * These are derived from the 18 mentors' expertise areas including:
 * Alex Hormozi (business scaling), Steven Bartlett (podcasting/investing),
 * Dan Martell (SaaS), Nick Bare (hybrid fitness), Iman Gadzhi (agencies),
 * George Heaton (streetwear brands), Brian Jenney (coding), and more.
 *
 * The LLM classifier uses these topics to determine if a query is relevant.
 * Queries about cooking, weather, sports scores, etc. will be rejected.
 */
export const RELEVANT_TOPICS = [
  // Business & Entrepreneurship
  "Business scaling and growth",
  "Offers, pricing, and sales",
  "SaaS and software businesses",
  "Agency building and client acquisition",
  "E-commerce and brand building",

  // Fitness & Endurance
  "Marathon and endurance training",
  "Hybrid athletics (Hyrox, strength + cardio)",
  "Gym mindset and discipline",
  "Nutrition and supplements",

  // Content & Personal Brand
  "Content creation and audience building",
  "Personal branding and storytelling",
  "YouTube and video content strategy",
  "Podcasting and interview skills",
  "Media appearances and public speaking",
  "Creator workflows and behind-the-scenes processes",

  // Software & Tech
  "Software development and coding",
  "JavaScript, React, and web development",
  "Developer hardware and productivity",
  "Indie hacking and building in public",

  // Mindset & Growth
  "Mindset and mental toughness",
  "Discipline, focus, and work ethic",
  "Personal transformation and habits",
  "Leadership and team building",

  // Investing & Startups
  "Angel investing and venture capital",
  "Silicon Valley and startup ecosystem",
  "Bootstrapping and early-stage growth",

  // Strategy & Psychology
  "Psychology and human behavior",
  "Power dynamics and persuasion",
  "Business strategy and tactics",
] as const;

/**
 * Schema for the relevance classification response.
 *
 * WHY USE STRUCTURED OUTPUTS?
 * Instead of parsing free-form LLM text (error-prone), we use OpenAI's
 * structured output feature with Zod schemas. This guarantees:
 * - Type-safe responses (isRelevant is always boolean)
 * - No parsing errors
 * - Consistent format every time
 */
export const relevanceSchema = z.object({
  isRelevant: z
    .boolean()
    .describe(
      "Whether the query is related to the allowed topics. True if relevant, false if off-topic.",
    ),
  reason: z
    .string()
    .describe(
      "Brief explanation of why the query is or is not relevant. Used for logging and debugging.",
    ),
});

export type RelevanceCheck = z.infer<typeof relevanceSchema>;

/**
 * Checks if a query is relevant to the RAG agent's capabilities.
 *
 * Uses gpt-4o-mini for cost efficiency (~$0.00015 per 1K input tokens).
 * This is 100x cheaper than running the full RAG pipeline on irrelevant queries.
 *
 * @param query - The user's query to check
 * @returns RelevanceCheck with isRelevant boolean and reason string
 *
 * @example
 * // Relevant query
 * const result = await checkQueryRelevance("How do I write engaging LinkedIn posts?");
 * // { isRelevant: true, reason: "Query is about LinkedIn content strategy" }
 *
 * @example
 * // Irrelevant query
 * const result = await checkQueryRelevance("What's the weather like today?");
 * // { isRelevant: false, reason: "Weather queries are not related to software or LinkedIn content" }
 */
export async function checkQueryRelevance(
  query: string,
): Promise<RelevanceCheck> {
  const topicsList = RELEVANT_TOPICS.join(", ");

  const response = await openaiClient.responses.parse({
    model: "gpt-4o-mini",
    input: [
      {
        role: "system",
        content: `You are a query relevance classifier. Your job is to determine if a user query is relevant to the following topics:

${topicsList}

A query is RELEVANT if it:
- Directly asks about any of these topics
- Asks for content creation related to these topics (e.g., "Write a LinkedIn post about...")
- Is tangentially related and could benefit from expertise in these areas

A query is NOT RELEVANT if it:
- Asks about completely unrelated topics (weather, recipes, sports scores, etc.)
- Is a general knowledge question unrelated to tech/careers (e.g., "Who was the first president?")
- Is inappropriate or harmful content

Be generous with relevance - if there's a reasonable connection to tech, software, careers, or professional content, mark it as relevant.`,
      },
      {
        role: "user",
        content: query,
      },
    ],
    temperature: 0.1, // Low temperature for consistent classification
    text: {
      format: zodTextFormat(relevanceSchema, "relevanceCheck"),
    },
  });

  // Return the parsed result, or a safe default if parsing failed
  return (
    response.output_parsed ?? {
      isRelevant: true, // Default to allowing the query if classification fails
      reason: "Classification failed, allowing query to proceed",
    }
  );
}

/**
 * Minimum similarity score threshold for Qdrant results.
 *
 * WHY 0.5?
 * Cosine similarity ranges from -1 to 1, where:
 * - 1.0 = Identical vectors (same meaning)
 * - 0.7-0.9 = Highly similar (same topic)
 * - 0.5-0.7 = Somewhat similar (related topic)
 * - 0.3-0.5 = Weakly similar (tangential connection)
 * - < 0.3 = Not similar (different topics)
 *
 * 0.5 is a balanced threshold that:
 * - Allows related content through (avoids false rejections)
 * - Filters out clearly unrelated results (avoids hallucinations)
 *
 * EXPERIMENT: Try adjusting this value!
 * - Higher (0.6-0.7): More strict, fewer but more relevant results
 * - Lower (0.3-0.4): More lenient, more results but may include noise
 */
export const SIMILARITY_SCORE_THRESHOLD = 0.3;

/**
 * Builds a user-friendly rejection message listing the Board's capabilities.
 *
 * @returns A message explaining what the Board of Directors can help with
 */
export function buildRejectionMessage(): string {
  return `Your Board of Directors can help with:

**Business & Entrepreneurship**
• Scaling businesses, offers, pricing, sales
• SaaS, agencies, e-commerce, brand building

**Fitness & Endurance**
• Marathon training, Hyrox, hybrid athletics
• Gym mindset, discipline, nutrition

**Content & Personal Brand**
• Content creation, audience building, YouTube, podcasting
• Personal branding and storytelling

**Software & Tech**
• Coding, JavaScript, React, web development
• Developer hardware, indie hacking

**Mindset & Growth**
• Mental toughness, discipline, work ethic
• Leadership, transformation, habits

**Investing & Startups**
• Angel investing, VC, Silicon Valley
• Bootstrapping, early-stage growth

Please rephrase your question to focus on one of these areas.`;
}

/**
 * Builds a message for when no relevant content was found in the mentor's transcripts.
 *
 * This is used when the LLM classifier thought the query was relevant,
 * but the vector search returned no results above the similarity threshold.
 * This can happen for niche topics not covered in the mentor's content.
 *
 * @returns A message explaining that no relevant content was found
 */
export function buildNoContentFoundMessage(): string {
  return `I couldn't find relevant content in this mentor's knowledge base for your query.

While your question seems related to their areas of expertise, their indexed content doesn't cover this specific topic well enough to provide a grounded response.

Try:
• Rephrasing your question with different keywords
• Asking a more general question about their core expertise
• Switching to a different mentor who might cover this topic`;
}

/**
 * Creates a streaming response with static text (no LLM call).
 *
 * WHY NOT USE GPT FOR REJECTION MESSAGES?
 * - Cost: Calling GPT-4o just to return a pre-defined message wastes money
 * - Consistency: The LLM might rephrase our carefully crafted message
 * - Speed: No network round-trip to OpenAI means instant response
 *
 * HOW IT WORKS:
 * We use MockLanguageModelV2 from Vercel AI SDK's test utilities to create
 * a fake language model that returns our static text. Combined with
 * simulateReadableStream, this mimics how a real LLM would stream tokens.
 * This maintains API compatibility (always returns StreamTextResult) while
 * avoiding unnecessary LLM calls.
 *
 * @param message - The exact message to stream back to the user
 * @returns A StreamTextResult compatible response
 */
export function createStaticTextStream(message: string): AgentResponse {
  // Split message into word-sized chunks for natural-looking streaming
  // This simulates how an LLM would output tokens one at a time
  const words = message.split(" ");
  const textId = "static-text-0";

  // Build stream parts following LanguageModelV2StreamPart format:
  // 1. text-start: signals beginning of text content
  // 2. text-delta (multiple): each word/chunk of the message
  // 3. text-end: signals end of text content
  // 4. finish: signals completion with usage stats
  const streamParts: LanguageModelV2StreamPart[] = [
    { type: "text-start", id: textId },
    ...words.map(
      (word, i) =>
        ({
          type: "text-delta",
          id: textId,
          delta: i === 0 ? word : " " + word,
        }) as LanguageModelV2StreamPart,
    ),
    { type: "text-end", id: textId },
    {
      type: "finish",
      finishReason: "stop",
      usage: {
        inputTokens: 0,
        outputTokens: words.length,
        totalTokens: words.length,
      },
    },
  ];

  // Create a mock language model that streams our static text
  const mockModel = new MockLanguageModelV2({
    provider: "mock",
    modelId: "static-response",
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: streamParts,
        chunkDelayInMs: 10, // Small delay between words for natural feel
      }),
    }),
  });

  return streamText({
    model: mockModel,
    messages: [{ role: "user", content: "ignored" }],
  });
}

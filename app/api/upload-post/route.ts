/**
 * LINKEDIN POST UPLOAD API ROUTE
 *
 * This endpoint allows users to upload LinkedIn posts to the Qdrant vector database
 * for RAG retrieval. Unlike articles, LinkedIn posts are NOT chunked.
 *
 * WHY NO CHUNKING FOR LINKEDIN POSTS?
 * LinkedIn posts are naturally short (typically 100-3,000 characters) because:
 * - LinkedIn has character limits on posts
 * - Posts are designed to be consumed quickly
 * - Each post represents a single, cohesive thought
 *
 * CONTRAST WITH ARTICLES:
 * - Articles: 5,000+ words → Chunked into 500-char pieces for precise retrieval
 * - LinkedIn posts: ~500 words → Embedded as a single vector for complete context
 *
 * MINIMUM LENGTH (100 chars):
 * Posts shorter than 100 characters are rejected because:
 * - They're usually reactions like "Great post!" or "Thanks for sharing"
 * - They don't contain enough semantic information for useful embeddings
 * - They would pollute search results with low-value matches
 *
 * REQUEST FORMAT:
 * POST /api/upload-post
 * {
 *   "text": "LinkedIn post content...",   // Required, min 100 chars
 *   "date": "2024-01-15",                 // Required
 *   "url": "https://linkedin.com/...",    // Required
 *   "likes": 42                           // Required, number
 * }
 *
 * RESPONSE FORMAT:
 * Success (200): { success: true, vectorUploaded: true }
 * Validation Error (400): { error: "Text must be at least 100 characters" }
 * Server Error (500): { error: "Failed to upload post" }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { openaiClient } from "@/app/libs/openai/openai";
import { upsertLinkedInPost } from "@/app/libs/qdrant";

/**
 * ZOD VALIDATION SCHEMA
 *
 * FIELD REQUIREMENTS:
 * - text: The post content, minimum 100 characters to ensure meaningful content
 * - date: When the post was published (for temporal context in retrieval)
 * - url: Link to the original LinkedIn post (for attribution)
 * - likes: Engagement metric (can be used to weight popular content higher)
 *
 * WHY REQUIRE LIKES?
 * - Engagement signals content quality
 * - Can filter/sort results by popularity
 * - Helps identify authoritative content
 */
const uploadPostSchema = z.object({
  text: z
    .string()
    .min(100, "Text must be at least 100 characters to be meaningful"),
  date: z.string().min(1, "Date is required"),
  url: z.string().min(1, "URL is required"),
  likes: z.number().min(0, "Likes must be a non-negative number"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate request body against schema
    const parseResult = uploadPostSchema.safeParse(body);

    if (!parseResult.success) {
      // Extract the first validation error message for a clean response
      const firstError = parseResult.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { text, date, url, likes } = parseResult.data;

    /**
     * EMBEDDING GENERATION
     *
     * WHY EMBED THE ENTIRE POST (NO CHUNKING)?
     * LinkedIn posts are short enough that the entire post fits comfortably within
     * the embedding model's context window. Embedding the whole post means:
     * - The vector captures the complete thought/message
     * - Search returns the full post, not fragments
     * - No artificial breaks in the natural flow of ideas
     *
     * SAME MODEL & DIMENSIONS AS ARTICLES:
     * Critical: We must use the same embedding model and dimensions for BOTH
     * articles and posts. If we used different dimensions, we couldn't search
     * across both collections with the same query embedding.
     */
    const embeddingResponse = await openaiClient.embeddings.create({
      model: "text-embedding-3-small",
      dimensions: 512,
      input: text,
    });

    const embedding = embeddingResponse.data[0].embedding;

    /**
     * CONSTRUCT POST OBJECT
     *
     * This matches the LinkedInPost type from chunking.ts:
     * - text: The actual post content
     * - date: Publication timestamp
     * - url: Link to original post
     * - likes: Engagement count
     */
    const post = { text, date, url, likes };

    /**
     * UPLOAD TO QDRANT
     *
     * The helper function handles:
     * - Creating a point with UUID, vector, and payload
     * - Upserting to the "posts" collection
     * - Waiting for confirmation (wait: true)
     *
     * PAYLOAD STRUCTURE:
     * The metadata stored with each vector includes:
     * - content: The original post text (returned with search results)
     * - url, date, likes: Attribution and context
     * - contentType: "linkedin" (for filtering by content type)
     */
    await upsertLinkedInPost(post, embedding);

    return NextResponse.json({
      success: true,
      vectorUploaded: true,
    });
  } catch (error) {
    console.error("Error uploading post:", error);
    return NextResponse.json(
      { error: "Failed to upload post" },
      { status: 500 },
    );
  }
}

/**
 * ARTICLE UPLOAD API ROUTE
 *
 * This endpoint allows users to upload articles (like blog posts or documentation)
 * to the Qdrant vector database for RAG retrieval.
 *
 * WHY A SEPARATE ROUTE FROM LINKEDIN POSTS?
 * Articles and LinkedIn posts have fundamentally different characteristics:
 * - Articles are LONG (1,000-10,000+ words) → Need chunking for precise retrieval
 * - LinkedIn posts are SHORT (~100-500 words) → No chunking needed
 * - Different metadata schemas (articles have title/author; posts have likes/url)
 * - Stored in separate collections for optimized search
 *
 * THE CHUNKING STRATEGY:
 * Long articles are split into overlapping 500-character chunks because:
 * - Smaller chunks = more precise retrieval (return relevant paragraphs, not whole articles)
 * - Overlap (50 chars) prevents losing context at chunk boundaries
 * - Each chunk becomes a separate vector in the database
 *
 * MINIMUM LENGTH (500 chars):
 * Articles shorter than 500 characters are rejected because:
 * - They don't contain enough content to be useful
 * - A single chunk would be too small to provide meaningful context
 * - These are likely fragments, not complete articles
 *
 * REQUEST FORMAT:
 * POST /api/upload-article
 * {
 *   "text": "Article content here...",      // Required, min 500 chars
 *   "title": "Article Title",               // Required
 *   "author": "Author Name",                // Required
 *   "date": "2024-01-15",                   // Required
 *   "url": "https://example.com/article",   // Optional
 *   "language": "en"                        // Optional, defaults to "en"
 * }
 *
 * RESPONSE FORMAT:
 * Success (200): { success: true, chunksCreated: 5, vectorsUploaded: 5 }
 * Validation Error (400): { error: "Text must be at least 500 characters" }
 * Server Error (500): { error: "Failed to upload article" }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chunkText } from "@/app/libs/chunking";
import { openaiClient } from "@/app/libs/openai/openai";
import { upsertArticleChunks } from "@/app/libs/qdrant";

/**
 * ZOD VALIDATION SCHEMA
 *
 * WHY USE ZOD?
 * - Type-safe validation at runtime (TypeScript only checks at compile time)
 * - Automatic error messages for invalid data
 * - Coerces and transforms data as needed
 * - Used consistently throughout this codebase
 *
 * FIELD REQUIREMENTS:
 * - text: The article content, minimum 500 characters to ensure meaningful content
 * - title: Article title, used for metadata and display
 * - author: Writer attribution
 * - date: Publication date for temporal context
 * - url: Optional link to original source
 * - language: Optional, defaults to English
 */
const uploadArticleSchema = z.object({
  text: z
    .string()
    .min(500, "Text must be at least 500 characters for meaningful chunking"),
  title: z.string().min(1, "Title is required"),
  author: z.string().min(1, "Author is required"),
  date: z.string().min(1, "Date is required"),
  url: z.string().optional(),
  language: z.string().default("en"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate request body against schema
    // This will throw a ZodError if validation fails
    const parseResult = uploadArticleSchema.safeParse(body);

    if (!parseResult.success) {
      // Extract the first validation error message for a clean response
      const firstError = parseResult.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const { text, title, author, date, url, language } = parseResult.data;

    // Use URL as source identifier, or fallback to title
    // This source is used to generate unique chunk IDs
    const source = url || title;

    /**
     * CHUNKING THE ARTICLE
     *
     * WHY CHUNK?
     * A 5,000-word article embedded as one vector would be too broad for precise
     * retrieval. By splitting into 500-char chunks with 50-char overlap:
     * - Each chunk represents a focused concept or paragraph
     * - Search returns only the relevant sections
     * - The LLM gets targeted context, not overwhelming amounts of text
     *
     * PARAMETERS:
     * - chunkSize (500): Characters per chunk - balances focus vs. context
     * - overlap (50): Characters shared between adjacent chunks - preserves sentence flow
     * - source: Used to generate unique IDs like "https://example.com-chunk-0"
     */
    const chunks = chunkText(text, 500, 50, source);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No chunks could be created from the provided text" },
        { status: 400 },
      );
    }

    // Attach article metadata to each chunk
    // This metadata is stored alongside the vector and returned with search results
    chunks.forEach((chunk) => {
      chunk.metadata.title = title;
      chunk.metadata.author = author;
      chunk.metadata.date = date;
      chunk.metadata.contentType = "article";
      chunk.metadata.language = language;
      if (url) {
        chunk.metadata.url = url;
      }
    });

    /**
     * EMBEDDING GENERATION
     *
     * WHY text-embedding-3-small WITH 512 DIMENSIONS?
     * - text-embedding-3-small: OpenAI's efficient embedding model, good balance of
     *   quality and cost. Produces semantic vectors where similar text → similar vectors.
     * - 512 dimensions: Enough to capture meaning, but smaller = faster search & cheaper storage.
     *   OpenAI supports 256, 512, 1536, 3072 dimensions for this model.
     *
     * BATCH EMBEDDING:
     * We embed all chunks in one API call for efficiency. OpenAI supports up to 2048
     * inputs per batch. The response contains one embedding per input in the same order.
     */
    const embeddingResponse = await openaiClient.embeddings.create({
      model: "text-embedding-3-small",
      dimensions: 512,
      input: chunks.map((chunk) => chunk.content),
    });

    // Extract embedding arrays from the response
    const embeddings = embeddingResponse.data.map((item) => item.embedding);

    /**
     * UPLOAD TO QDRANT
     *
     * The helper function handles:
     * - Creating point objects with UUID, vector, and payload
     * - Upserting to the "articles" collection
     * - Waiting for confirmation (wait: true)
     *
     * WHY UPSERT?
     * If you upload the same article twice, the second upload updates existing vectors
     * rather than creating duplicates. This makes the API idempotent.
     */
    await upsertArticleChunks(chunks, embeddings);

    return NextResponse.json({
      success: true,
      chunksCreated: chunks.length,
      vectorsUploaded: embeddings.length,
    });
  } catch (error) {
    console.error("Error uploading article:", error);
    return NextResponse.json(
      { error: "Failed to upload article" },
      { status: 500 },
    );
  }
}

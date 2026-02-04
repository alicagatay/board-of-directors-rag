/**
 * LINKEDIN POSTS UPLOAD SCRIPT
 *
 * This script is the data ingestion pipeline for LinkedIn posts in your RAG system.
 * It transforms raw LinkedIn posts from a CSV export into searchable vectors stored in Qdrant.
 *
 * WHY NO CHUNKING FOR LINKEDIN POSTS?
 * Unlike long-form Medium articles (which can be 5,000+ words), LinkedIn posts are
 * naturally short (typically under 3,000 characters). This means:
 * - Each post already represents a single, cohesive thought
 * - Chunking would artificially break the natural flow of ideas
 * - The entire post fits comfortably within embedding model context limits
 * - Retrieval returns complete posts, not fragments, improving response quality
 *
 * CONTRAST WITH MEDIUM ARTICLES:
 * Medium articles ARE chunked because they're long. If we embedded an entire 5,000-word
 * article as one vector, search results would be too broad and unfocused. Chunking
 * allows us to retrieve just the relevant paragraphs.
 *
 * THE PIPELINE:
 * 1. Read CSV → Parse LinkedIn post data (text, date, URL, likes)
 * 2. Filter → Remove posts under 100 chars (too short to be meaningful)
 * 3. Embed → Convert each post's text into a 512-dimensional vector
 * 4. Store → Upload vectors + metadata to Qdrant for similarity search
 *
 * USAGE: npx tsx app/scripts/upload-linkedin-posts.ts
 */

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { extractLinkedInPosts } from "../libs/chunking";
import { qdrantClient } from "../libs/qdrant";
import { openaiClient } from "../libs/openai/openai";

const DATA_DIR = path.join(process.cwd(), "app/scripts/data");
const LINKEDIN_CSV = path.join(DATA_DIR, "brian_posts.csv");
const COLLECTION_NAME = "posts";

/**
 * Processes LinkedIn posts from CSV and uploads to Qdrant vector database.
 *
 * WHY 100 CHARACTER MINIMUM?
 * Very short posts (like "Great article!" or "Thanks for sharing") don't contain
 * enough semantic information to create meaningful embeddings. They would:
 * - Pollute search results with low-value matches
 * - Waste embedding API costs on content that won't help answer questions
 * - Create noise in the vector space, reducing overall retrieval quality
 *
 * WHY STORE METADATA (url, date, likes)?
 * When the RAG system retrieves posts, it needs context beyond just the text:
 * - URL: Allows users to view the original post
 * - Date: Helps prioritize recent vs. outdated information
 * - Likes: Can be used to weight more popular/validated content
 * - contentType: Distinguishes LinkedIn posts from other content types in queries
 */
async function processLinkedInPosts(): Promise<void> {
  console.log("💼 Processing LinkedIn posts...");

  const rawCsvContent = fs.readFileSync(LINKEDIN_CSV, "utf-8");
  const parsedLinkedInPosts = extractLinkedInPosts(rawCsvContent);

  console.log(`Found ${parsedLinkedInPosts.length} LinkedIn posts`);

  const postsWithSufficientLength = parsedLinkedInPosts.filter(
    (post) => post.text.length >= 100,
  );
  const filteredOutCount =
    parsedLinkedInPosts.length - postsWithSufficientLength.length;

  console.log(
    `Valid posts (>= 100 chars): ${postsWithSufficientLength.length}`,
  );
  console.log(`Rejected posts (< 100 chars): ${filteredOutCount}`);

  let successfulUploads = 0;
  let failedUploads = 0;

  for (const linkedInPost of postsWithSufficientLength) {
    try {
      /**
       * EMBEDDING GENERATION
       *
       * WHY text-embedding-3-small WITH 512 DIMENSIONS?
       * - text-embedding-3-small: OpenAI's efficient embedding model, optimized for
       *   semantic similarity tasks. Cheaper than text-embedding-3-large with minimal
       *   quality loss for most use cases.
       * - 512 dimensions: A sweet spot between quality and efficiency. Higher dimensions
       *   (1536) capture more nuance but increase storage costs and search latency.
       *   For short LinkedIn posts, 512 dimensions capture sufficient semantic meaning.
       *
       * WHAT HAPPENS HERE:
       * The model reads the post text and outputs an array of 512 floating-point numbers.
       * These numbers position the post's "meaning" in a 512-dimensional space where
       * semantically similar content clusters together.
       */
      const postEmbeddingResponse = await openaiClient.embeddings.create({
        model: "text-embedding-3-small",
        dimensions: 512,
        input: linkedInPost.text,
      });

      /**
       * VECTOR DATABASE UPSERT
       *
       * WHY UPSERT (not INSERT)?
       * Upsert = Update + Insert. If a point with this ID exists, it's updated;
       * otherwise, a new point is created. This makes the script idempotent—you can
       * run it multiple times without creating duplicates.
       *
       * WHY wait: true?
       * Qdrant can acknowledge writes immediately (async) or wait until the data is
       * fully indexed (sync). We wait to ensure each post is searchable before
       * continuing—important for data integrity, though slightly slower.
       *
       * PAYLOAD STRUCTURE:
       * - content: The original post text (returned with search results for LLM context)
       * - url: Link to original LinkedIn post
       * - date: When the post was published
       * - likes: Engagement metric (numReactions from LinkedIn)
       * - contentType: Identifies this as LinkedIn content for filtering
       */
      await qdrantClient.upsert(COLLECTION_NAME, {
        wait: true,
        points: [
          {
            id: crypto.randomUUID(),
            vector: postEmbeddingResponse.data[0].embedding,
            payload: {
              content: linkedInPost.text,
              url: linkedInPost.url,
              date: linkedInPost.date,
              likes: linkedInPost.likes,
              contentType: "linkedin",
            },
          },
        ],
      });

      successfulUploads++;
      console.log(
        `✅ Uploaded post ${successfulUploads}/${postsWithSufficientLength.length}`,
      );
    } catch (uploadError) {
      console.error(
        `❌ Failed to upload post: ${linkedInPost.url}`,
        uploadError,
      );
      failedUploads++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Successfully uploaded: ${successfulUploads}`);
  console.log(`   Failed: ${failedUploads}`);
  console.log(`   Total valid posts: ${postsWithSufficientLength.length}`);
}

async function main() {
  console.log("🚀 Starting LinkedIn posts upload...\n");

  try {
    await processLinkedInPosts();
    console.log("\n✅ Upload complete!");
  } catch (error) {
    console.error("❌ Error processing LinkedIn posts:", error);
    process.exit(1);
  }
}

main();

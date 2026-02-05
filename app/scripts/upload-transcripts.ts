/**
 * TRANSCRIPT UPLOAD SCRIPT - Building the Board of Directors Vector Database
 *
 * WHAT THIS SCRIPT DOES:
 * Processes YouTube transcripts from the "Board of Directors" channels and uploads
 * them to Qdrant for semantic search. These transcripts are the primary knowledge
 * base for the RAG system.
 *
 * WHY TRANSCRIPTS?
 * YouTube videos from successful entrepreneurs, investors, and business educators
 * contain dense, practical knowledge that isn't easily searchable. By converting
 * these transcripts to vectors, users can ask questions and get answers grounded
 * in real advice from these "board of directors" figures.
 *
 * CHUNKING STRATEGY:
 * - Size: 1000 characters (larger than written content because speech is ~2x less dense)
 * - Overlap: 200 characters (captures pronoun antecedents in conversational speech)
 *
 * WORKFLOW:
 * 1. Read all transcript JSON files from data/transcripts/{channel}/
 * 2. Chunk each transcript using chunkText(text, 1000, 200, videoUrl)
 * 3. Generate embeddings in batches of 100 (OpenAI efficiency)
 * 4. Upload to Qdrant with full metadata
 *
 * USAGE:
 * Run: yarn upload:transcripts
 * Or: npx tsx app/scripts/upload-transcripts.ts
 */

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import {
  chunkText,
  type Chunk,
  type YouTubeTranscript,
} from "../libs/chunking";
import { openaiClient } from "../libs/openai/openai";
import { upsertTranscriptChunks } from "../libs/qdrant";

const TRANSCRIPTS_DIR = path.join(
  process.cwd(),
  "app/scripts/data/transcripts",
);

// Batch size for embedding requests (OpenAI's text-embedding-3-small has 8192 token limit)
// With 1000 char chunks (~250 tokens each), we can fit about 30 chunks per batch (7500 tokens)
const EMBEDDING_BATCH_SIZE = 30;

/**
 * Reads all transcript JSON files from the transcripts directory.
 * Files are organized by channel: data/transcripts/{channelName}/{videoId}.json
 */
function readAllTranscripts(): YouTubeTranscript[] {
  console.log("📂 Reading transcript files...\n");

  const transcripts: YouTubeTranscript[] = [];
  const channels = fs.readdirSync(TRANSCRIPTS_DIR).filter((f) => {
    const fullPath = path.join(TRANSCRIPTS_DIR, f);
    return fs.statSync(fullPath).isDirectory();
  });

  for (const channel of channels) {
    const channelDir = path.join(TRANSCRIPTS_DIR, channel);
    const files = fs.readdirSync(channelDir).filter((f) => f.endsWith(".json"));

    console.log(`  📁 ${channel}: ${files.length} transcripts`);

    for (const file of files) {
      const filePath = path.join(channelDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      try {
        const transcript = JSON.parse(content) as YouTubeTranscript;
        // CRITICAL: Override channelName with folder name to match mentorId
        // The JSON has human-readable names like "Alex Hormozi" but we filter by "AlexHormozi"
        transcript.channelName = channel;
        transcripts.push(transcript);
      } catch (e) {
        console.warn(`  ⚠️  Failed to parse: ${file}`);
      }
    }
  }

  console.log(
    `\n✅ Loaded ${transcripts.length} transcripts from ${channels.length} channels\n`,
  );
  return transcripts;
}

/**
 * Generate embeddings for an array of text strings in batches.
 *
 * WHY BATCH?
 * - OpenAI's API is more efficient with batched requests
 * - Reduces API call overhead (fewer round trips)
 * - Saves time on rate limiting between requests
 */
async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const response = await openaiClient.embeddings.create({
    model: "text-embedding-3-small",
    dimensions: 512,
    input: texts,
  });

  return response.data.map((d) => d.embedding);
}

/**
 * Main execution function - orchestrates the entire upload pipeline.
 */
async function main() {
  console.log("🚀 Starting transcript upload to Qdrant...\n");
  console.log("─".repeat(60) + "\n");

  try {
    // STEP 1: Read all transcripts
    const transcripts = readAllTranscripts();

    // STEP 2: Process each transcript - chunk and prepare for embedding
    console.log("📝 Chunking transcripts...\n");

    let totalChunks = 0;
    const transcriptChunks: Array<{
      chunks: Chunk[];
      transcript: Omit<YouTubeTranscript, "text">;
    }> = [];

    for (const transcript of transcripts) {
      // Skip transcripts with empty or very short text
      if (!transcript.text || transcript.text.length < 100) {
        continue;
      }

      // Chunk with 1000 char size, 200 char overlap (optimized for spoken content)
      const chunks = chunkText(transcript.text, 1000, 200, transcript.videoUrl);

      // Extract metadata (everything except the full text)
      const { text: _, ...transcriptMeta } = transcript;

      transcriptChunks.push({
        chunks,
        transcript: transcriptMeta,
      });

      totalChunks += chunks.length;
    }

    console.log(
      `✅ Created ${totalChunks} chunks from ${transcriptChunks.length} transcripts\n`,
    );
    console.log("─".repeat(60) + "\n");

    // STEP 3: Generate embeddings and upload in batches
    console.log("🧠 Generating embeddings and uploading to Qdrant...\n");

    let processedChunks = 0;
    let processedTranscripts = 0;

    for (const { chunks, transcript } of transcriptChunks) {
      // Process chunks in batches
      for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batchChunks = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const batchTexts = batchChunks.map((c) => c.content);

        // Generate embeddings for this batch
        const embeddings = await generateEmbeddingsBatch(batchTexts);

        // Upload to Qdrant
        await upsertTranscriptChunks(batchChunks, embeddings, transcript);

        processedChunks += batchChunks.length;
      }

      processedTranscripts++;

      // Progress update every 10 transcripts
      if (processedTranscripts % 10 === 0) {
        const progress = (
          (processedTranscripts / transcriptChunks.length) *
          100
        ).toFixed(1);
        console.log(
          `  📊 Progress: ${progress}% (${processedTranscripts}/${transcriptChunks.length} transcripts, ${processedChunks} chunks)`,
        );
      }
    }

    console.log("\n" + "─".repeat(60) + "\n");
    console.log("✅ Upload complete!\n");
    console.log("📊 Summary:");
    console.log(`   Transcripts processed: ${processedTranscripts}`);
    console.log(`   Chunks uploaded: ${processedChunks}`);
    console.log(
      `   Average chunks per transcript: ${(processedChunks / processedTranscripts).toFixed(1)}`,
    );
  } catch (error) {
    console.error("\n❌ Error uploading transcripts:", error);
    process.exit(1);
  }
}

main();

/**
 * ARTICLE UPLOAD SCRIPT - Building a Vector Database
 *
 * WHAT THIS SCRIPT DOES:
 * This script is the "data ingestion pipeline" for your RAG system. It takes raw
 * content (Medium articles, LinkedIn posts) and transforms them into searchable
 * vectors stored in Qdrant.
 *
 * WHY WE NEED THIS:
 * LLMs like GPT-4 don't have access to your specific content. To make them "know"
 * about your articles, you need to:
 * 1. Break content into chunks (so results are focused, not overwhelming)
 * 2. Convert chunks to embeddings (numerical representations of meaning)
 * 3. Store embeddings in a vector database (for fast similarity search)
 *
 * THE RAG PIPELINE (this is step 1 - data preparation):
 * 1. **THIS SCRIPT** → Prepare and upload data
 * 2. User asks a question → Convert question to embedding
 * 3. Search vector DB → Find most relevant chunks
 * 4. Send chunks to LLM → Generate answer with context
 *
 * WORKFLOW:
 * 1. Read all Medium article HTML files from data/articles/
 * 2. Parse them using extractMediumArticle (removes HTML, extracts metadata)
 * 3. Chunk all content using chunkText (breaks into 500-char pieces with overlap)
 * 4. Generate embeddings using OpenAI (converts text to 512-dimensional vectors)
 * 5. Upload to Qdrant with metadata (stores vectors + original text + metadata)
 *
 * WHY CHUNK TEXT?
 * - LLMs have context limits (can't process entire articles at once)
 * - Smaller chunks = more precise retrieval
 * - Overlap between chunks prevents losing context at boundaries
 *
 * WHY 512 DIMENSIONS?
 * OpenAI's text-embedding-3-small model supports multiple dimensions.
 * 512 is a good balance between:
 * - Quality (enough information to capture meaning)
 * - Speed (smaller vectors search faster)
 * - Cost (fewer dimensions = cheaper storage)
 *
 * USAGE:
 * Run: npx tsx app/scripts/upload-articles.ts
 *
 * COST CONSIDERATIONS:
 * - This makes API calls to OpenAI for EACH chunk (1,723 calls for full dataset)
 * - Each embedding costs ~$0.00002 per 1K tokens
 * - Total cost for 1,723 chunks: ~$0.50-$2 depending on chunk size
 */

import dotenv from "dotenv";
dotenv.config();

import { qdrantClient } from "../libs/qdrant";
import fs from "fs";
import path from "path";
import {
  extractMediumArticle,
  // extractLinkedInPosts, // TODO: Uncomment when implemented
  chunkText,
  type Chunk,
} from "../libs/chunking";
import { openaiClient } from "../libs/openai/openai";

const DATA_DIR = path.join(process.cwd(), "app/scripts/data");
const ARTICLES_DIR = path.join(DATA_DIR, "articles");
const LINKEDIN_CSV = path.join(DATA_DIR, "brian_posts.csv");

/**
 * Processes all Medium articles from the articles directory
 */
/**
 * Process Medium articles into chunks ready for embedding.
 *
 * WHY THIS FUNCTION EXISTS:
 * Raw HTML articles need to be cleaned and structured before we can convert them
 * to embeddings. This function handles the entire transformation from HTML files
 * to clean, metadata-rich chunks.
 *
 * STEPS:
 * 1. Read HTML files from disk
 * 2. Extract clean text and metadata (title, author, date, url)
 * 3. Split into overlapping chunks
 * 4. Attach metadata to each chunk
 *
 * WHY ATTACH METADATA?
 * When we search later, we don't just want the text - we want to know:
 * - Which article it came from (source URL)
 * - Who wrote it (author)
 * - When it was published (date)
 * - What the article title was
 * This metadata helps users understand the source of information.
 */
async function processMediumArticles(): Promise<Chunk[]> {
  console.log("📖 Processing Medium articles...");

  const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".html"));
  console.log(`Found ${files.length} HTML files`);

  const allChunks: Chunk[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const filePath = path.join(ARTICLES_DIR, file);
    const htmlContent = fs.readFileSync(filePath, "utf-8");

    // Filter out tiny articles that won't provide useful content
    // (These are usually just comments or very short posts)
    if (htmlContent.length < 500) {
      continue;
    }

    // Extract clean text and metadata from HTML
    // This removes all HTML tags and pulls out structured information
    const article = extractMediumArticle(htmlContent);

    if (article) {
      // Break article into overlapping chunks.
      //
      // WHY 500 characters?
      // - Small enough to be focused and relevant
      // - Large enough to contain complete thoughts
      // - Fits well within LLM context windows when combined
      //
      // WHY 50 character overlap?
      // - Prevents cutting sentences in half at chunk boundaries
      // - Ensures context flows between chunks
      // - Example: If chunk 1 ends with "React hooks are", chunk 2 will start
      //   with "hooks are awesome" rather than just "awesome"
      const chunks = chunkText(article.text, 500, 50, article.url);

      console.log(JSON.stringify(chunks, null, 2));

      // Add article metadata to each chunk
      chunks.forEach((chunk) => {
        chunk.metadata.title = article.title;
        chunk.metadata.author = article.author;
        chunk.metadata.date = article.date;
        chunk.metadata.contentType = article.source; // 'medium'
        chunk.metadata.language = article.language;
      });

      allChunks.push(...chunks);
      successCount++;
    } else {
      console.warn(`⚠️  Failed to parse: ${file}`);
      failCount++;
    }
  }

  console.log(
    `✅ Processed ${successCount} articles, ${failCount} failed, ${allChunks.length} total chunks`,
  );
  return allChunks;
}

// /**
//  * Processes LinkedIn posts from CSV file
//  */
// async function processLinkedInPosts(): Promise<Chunk[]> {
// 	console.log('💼 Processing LinkedIn posts...');

// 	const csvContent = fs.readFileSync(LINKEDIN_CSV, 'utf-8');
// 	const posts = extractLinkedInPosts(csvContent);

// 	console.log(`Found ${posts.length} LinkedIn posts`);

// 	const allChunks: Chunk[] = [];

// 	for (const post of posts) {
// 		// Chunk the post text
// 		const chunks = chunkText(post.text, 500, 50, post.url);

// 		// Add post metadata to each chunk
// 		chunks.forEach((chunk) => {
// 			chunk.metadata.date = post.date;
// 			chunk.metadata.likes = post.likes;
// 			chunk.metadata.postSource = 'linkedin';
// 		});

// 		allChunks.push(...chunks);
// 	}

// 	console.log(`✅ Created ${allChunks.length} chunks from LinkedIn posts`);
// 	return allChunks;
// }

/**
 * Main function
 */
/**
 * Main execution function - orchestrates the entire upload pipeline.
 *
 * PIPELINE STEPS:
 * 1. Process articles into chunks (text cleaning + chunking)
 * 2. Generate embeddings (convert text to vectors)
 * 3. Upload to Qdrant (store vectors with metadata)
 *
 * WHY THIS ORDER?
 * - Can't embed until text is clean and chunked
 * - Can't upload until embeddings are generated
 * - Each step depends on the previous one
 */
async function main() {
  console.log("🚀 Starting article processing...\n");

  try {
    // STEP 1: Process all Medium articles into clean, chunked text
    const mediumChunks = await processMediumArticles();

    // STEP 2 & 3: For each chunk, generate embedding and upload to Qdrant
    //
    // WHY ONE AT A TIME?
    // While we could batch these, processing one at a time:
    // - Is simpler to understand and debug
    // - Prevents memory issues with large datasets
    // - Provides progress feedback as it runs
    //
    // PRODUCTION TIP:
    // For very large datasets (10K+ chunks), you'd want to:
    // - Batch embeddings (OpenAI supports up to 2048 inputs per call)
    // - Use Promise.all() for parallel uploads
    // - Add retry logic for failed uploads
    for (const chunk of mediumChunks) {
      // Generate embedding: Convert text to a 512-dimensional vector
      //
      // WHAT'S HAPPENING:
      // OpenAI's model reads the text and outputs an array of 512 numbers.
      // These numbers capture the "meaning" of the text in a way that:
      // - Similar content gets similar vectors
      // - Different content gets different vectors
      //
      // EXAMPLE:
      // "React hooks are great" → [0.23, -0.45, 0.67, ...512 numbers]
      // "React hooks are awesome" → [0.24, -0.44, 0.66, ...] (very similar!)
      // "Pizza is delicious" → [-0.12, 0.89, -0.34, ...] (very different!)
      const embeddings = await openaiClient.embeddings.create({
        model: "text-embedding-3-small",
        dimensions: 512,
        input: chunk.content,
      });

      // Upload to Qdrant: Store the vector along with metadata
      //
      // UPSERT = Update + Insert:
      // - If a point with this ID exists, update it
      // - If not, insert a new point
      //
      // WHAT WE'RE STORING:
      // - id: Unique identifier (UUID) for this chunk
      // - vector: The 512 numbers from OpenAI (used for similarity search)
      // - payload: All the metadata + original text (returned with search results)
      //
      // WHY STORE ORIGINAL TEXT?
      // When we search, we get back the vector matches. But we need the actual
      // text to send to the LLM as context. The payload contains everything we
      // need to reconstruct the answer.
      await qdrantClient.upsert("articles", {
        wait: true, // Wait for confirmation before continuing (ensures data is indexed)
        points: [
          {
            id: crypto.randomUUID(), // Random unique ID for this chunk
            vector: embeddings.data[0].embedding, // The 512-dimensional array
            payload: {
              ...chunk.metadata, // source, author, date, title, etc.
              content: chunk.content, // The actual text chunk
            },
          },
        ],
      });
    }

    // Process LinkedIn posts
    // TODO: Uncomment when extractLinkedInPosts is implemented
    // const linkedInChunks = await processLinkedInPosts();

    // Combine all chunks
    const allChunks = [...mediumChunks]; // TODO: Add linkedInChunks when ready

    console.log(`\n📊 Summary:`);
    console.log(`   Medium chunks: ${mediumChunks.length}`);
    // console.log(`   LinkedIn chunks: ${linkedInChunks.length}`);
    console.log(`   Total chunks: ${allChunks.length}`);

    // TODO: Upload to Qdrant
    console.log("\n⏳ Qdrant upload not yet implemented");

    // For now, save to a JSON file for inspection
    const outputPath = path.join(DATA_DIR, "processed_chunks.json");
    fs.writeFileSync(outputPath, JSON.stringify(allChunks, null, 2));
    console.log(`\n💾 Saved processed chunks to: ${outputPath}`);
  } catch (error) {
    console.error("❌ Error processing articles:", error);
    process.exit(1);
  }
}

main();

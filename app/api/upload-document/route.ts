import { NextRequest, NextResponse } from 'next/server';
import { chunkText } from '@/app/libs/chunking';
import { openaiClient } from '@/app/libs/openai/openai';
import { pineconeClient } from '@/app/libs/pinecone';
import { z } from 'zod';

const uploadTextSchema = z.object({
	text: z.string().min(1),
	title: z.string().optional(),
});

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();

		// TODO: Step 1 - Parse and validate the request body
		// Use uploadTextSchema.parse() to validate the incoming request
		// Extract 'text' and optional 'title' from the parsed body

		// TODO: Step 2 - Chunk the text content
		// Use chunkText() from '@/app/libs/chunking'
		// Parameters: (text, chunkSize, overlap, source)
		// Suggested values: chunkSize=500, overlap=50
		// Use title or 'user-upload' as the source identifier

		// TODO: Step 3 - Check if we got any chunks
		// If chunks.length === 0, return an error response
		// Status should be 400 with message like "No chunks created from text"

		// TODO: Step 4 - Get Pinecone index
		// Use pineconeClient.Index() to get your index
		// The index name comes from process.env.PINECONE_INDEX
		// Throw an error if PINECONE_INDEX is not set

		// TODO: Step 5 - Generate embeddings for the chunks
		// Use openaiClient.embeddings.create()
		// Model: 'text-embedding-3-small'
		// Dimensions: 512
		// Input: array of chunk.content strings (chunks.map(c => c.content))

		// TODO: Step 6 - Prepare vectors for Pinecone
		// Map each chunk to a vector object with:
		// - id: chunk.id
		// - values: embeddingResponse.data[idx].embedding
		// - metadata: {
		//     text: chunk.content,  // IMPORTANT: Include the actual text!
		//     source: 'user-upload',
		//     chunkIndex: chunk.metadata.chunkIndex,
		//     totalChunks: chunk.metadata.totalChunks,
		//     ...any other metadata you want
		//   }

		// TODO: Step 7 - Upload vectors to Pinecone
		// Use index.upsert(vectors)

		// TODO: Step 8 - Return success response
		// Return NextResponse.json() with:
		// - success: true
		// - vectorsUploaded: vectors.length
		// - chunksCreated: chunks.length
		// - textLength: text.length

		throw new Error('Upload document not implemented yet!');
	} catch (error) {
		console.error('Error uploading document:', error);
		return NextResponse.json(
			{
				error: 'Failed to upload document',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
}

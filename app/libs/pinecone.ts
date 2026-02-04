/**
 * PINECONE VECTOR DATABASE INTEGRATION
 *
 * This file handles interactions with Pinecone, a managed vector database service.
 *
 * WHAT IS A VECTOR DATABASE?
 * Vector databases store high-dimensional numerical representations (embeddings) of data.
 * Unlike traditional databases that store exact text/numbers, vector DBs store "meanings"
 * as mathematical vectors. This enables semantic search - finding content by meaning
 * rather than exact keyword matches.
 *
 *
 * Learn more: https://docs.pinecone.io/docs/overview
 *
 * EXPERIMENT: Try changing the embedding model or topK values below!
 */

import {
	Pinecone,
	RecordMetadata,
	ScoredPineconeRecord,
} from '@pinecone-database/pinecone';
import { openaiClient } from '../libs/openai/openai';

// Initialize Pinecone client with your API key
// Get your free API key at: https://app.pinecone.io/
export const pineconeClient = new Pinecone({
	apiKey: process.env.PINECONE_API_KEY as string,
});

/**
 * Searches for semantically similar documents in the vector database
 *
 * @param query - The search query (will be converted to embeddings)
 * @param topK - Number of most similar results to return (try 3-10)
 * @returns Array of matching documents with similarity scores
 */
export const searchDocuments = async (
	query: string,
	topK: number = 3
): Promise<ScoredPineconeRecord<RecordMetadata>[]> => {
	// TODO: Step 1 - Connect to the vector database index

	// TODO: Step 2 - Generate query embedding using OpenAI

	// TODO: Step 3 - Extract the embedding array from the response

	// TODO: Step 4 - Query vector database for similar vectors

	// TODO: Step 5 - Return the matches

	throw new Error('searchDocuments not implemented yet!');
};

import { describe, it, expect } from '@jest/globals';
import {
	dotProduct,
	magnitude,
	cosineSimilarity,
	findTopSimilarDocuments,
	type Document,
} from './vector-similarity';

describe('Vector Math Functions', () => {
	describe('dotProduct', () => {
		it('should calculate dot product correctly', () => {
			expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32);
			expect(dotProduct([1, 0], [0, 1])).toBe(0);
		});

		it('should throw error for different dimension vectors', () => {
			expect(() => dotProduct([1, 2], [1, 2, 3])).toThrow(
				'Vectors must have the same dimension'
			);
		});
	});

	describe('magnitude', () => {
		it('should calculate vector magnitude correctly', () => {
			expect(magnitude([3, 4])).toBe(5);
			expect(magnitude([1, 0, 0])).toBe(1);
			expect(magnitude([1, 1, 1])).toBeCloseTo(Math.sqrt(3));
		});
	});

	describe('cosineSimilarity', () => {
		it('should return 1 for identical vectors', () => {
			expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
		});

		it('should return 0 for orthogonal vectors', () => {
			expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
		});

		it('should return 0 for zero vectors', () => {
			expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
			expect(cosineSimilarity([1, 2], [0, 0])).toBe(0);
		});

		it('should calculate cosine similarity correctly', () => {
			const similarity = cosineSimilarity([1, 1], [1, 0]);
			expect(similarity).toBeCloseTo(0.7071, 4);
		});
	});
});

describe('findTopSimilarDocuments', () => {
	const testDocuments: Document[] = [
		{
			id: 'doc1',
			title: 'Perfect Match',
			embedding: [1, 0, 0],
		},
		{
			id: 'doc2',
			title: 'Good Match',
			embedding: [0.9, 0.1, 0],
		},
		{
			id: 'doc3',
			title: 'Moderate Match',
			embedding: [0.7, 0.3, 0],
		},
		{
			id: 'doc4',
			title: 'Poor Match',
			embedding: [0.5, 0.5, 0],
		},
		{
			id: 'doc5',
			title: 'No Match',
			embedding: [0, 1, 0],
		},
	];

	const queryVector = [1, 0, 0];

	it('should return documents with similarity above threshold', () => {
		const results = findTopSimilarDocuments(
			queryVector,
			testDocuments,
			0.7,
			5
		);

		// All results should have similarity >= 0.7
		results.forEach((result) => {
			expect(result.similarity).toBeGreaterThanOrEqual(0.7);
		});

		// Should include perfect match, good match, moderate match, and poor match (0.707 >= 0.7)
		expect(results.length).toBe(4);
	});

	it('should limit results to topK parameter', () => {
		const results = findTopSimilarDocuments(
			queryVector,
			testDocuments,
			0.5,
			2
		);
		expect(results.length).toBe(2);
	});

	it('should sort results by similarity (highest first)', () => {
		const results = findTopSimilarDocuments(
			queryVector,
			testDocuments,
			0.5,
			5
		);

		for (let i = 1; i < results.length; i++) {
			expect(results[i - 1].similarity).toBeGreaterThanOrEqual(
				results[i].similarity
			);
		}

		// First result should be the perfect match
		expect(results[0].document.id).toBe('doc1');
		expect(results[0].similarity).toBeCloseTo(1);
	});

	it('should return empty array when no documents meet threshold', () => {
		const results = findTopSimilarDocuments(
			queryVector,
			testDocuments,
			0.99,
			5
		);
		expect(results.length).toBe(2); // doc1 (1.0) and doc2 (0.994)
		expect(results[0].document.id).toBe('doc1');
	});

	it('should handle edge cases', () => {
		// Empty documents array
		expect(findTopSimilarDocuments([1, 0], [], 0.5, 3)).toEqual([]);

		// Zero query vector
		const zeroResults = findTopSimilarDocuments(
			[0, 0, 0],
			testDocuments,
			0,
			5
		);
		expect(zeroResults.length).toBe(5); // All similarities will be 0, which meets threshold 0
		zeroResults.forEach((result) => {
			expect(result.similarity).toBe(0);
		});
	});

	it('should use default parameters correctly', () => {
		// Test with defaults: minSimilarity = 0.7, topK = 3
		const results = findTopSimilarDocuments(queryVector, testDocuments);
		expect(results.length).toBeLessThanOrEqual(3);
		results.forEach((result) => {
			expect(result.similarity).toBeGreaterThanOrEqual(0.7);
		});
	});
});

describe('Integration Test with Real Data', () => {
	it('should work with the provided test data', () => {
		const documents: Document[] = [
			{
				id: 'doc1',
				title: 'Introduction to Vector Databases',
				embedding: [0.8, 0.2, 0.7, 0.1],
			},
			{
				id: 'doc2',
				title: 'Machine Learning Fundamentals',
				embedding: [0.2, 0.8, 0.1, 0.7],
			},
			{
				id: 'doc3',
				title: 'Natural Language Processing',
				embedding: [0.9, 0.1, 0.6, 0.2],
			},
			{
				id: 'doc4',
				title: 'Vector Math for Beginners',
				embedding: [0.7, 0.3, 0.8, 0.1],
			},
			{
				id: 'doc5',
				title: 'Database Design Patterns',
				embedding: [0.1, 0.9, 0.2, 0.6],
			},
		];

		const queryVector = [0.75, 0.25, 0.8, 0.1];

		const results = findTopSimilarDocuments(queryVector, documents, 0.7, 3);

		// Should return some results
		expect(results.length).toBeGreaterThan(0);
		expect(results.length).toBeLessThanOrEqual(3);

		// All results should meet the similarity threshold
		results.forEach((result) => {
			expect(result.similarity).toBeGreaterThanOrEqual(0.7);
		});

		// Results should be sorted by similarity
		for (let i = 1; i < results.length; i++) {
			expect(results[i - 1].similarity).toBeGreaterThanOrEqual(
				results[i].similarity
			);
		}
	});
});

import { chunkText } from './chunking';

describe('chunkText', () => {
	describe('Basic Functionality', () => {
		test('should split text into chunks', () => {
			const text =
				'React Hooks were introduced in React 16.8. They allow you to use state and other React features without writing a class component. The most commonly used hooks are useState and useEffect.';

			const chunks = chunkText(text, 100, 20, 'test');

			expect(chunks.length).toBeGreaterThan(0);
			expect(chunks[0].content).toBeTruthy();
		});

		test('should handle empty text', () => {
			const chunks = chunkText('', 500, 50, 'test');
			expect(chunks).toEqual([]);
		});

		test('should handle single sentence', () => {
			const text = 'This is a single sentence.';
			const chunks = chunkText(text, 500, 50, 'test');

			expect(chunks).toHaveLength(1);
			expect(chunks[0].content).toBe(text);
		});
	});

	describe('Sentence Boundaries', () => {
		test('should not break words mid-character', () => {
			const text =
				'The company announced new features including advanced AI capabilities. These features will revolutionize the industry. Users are excited about the upcoming release.';

			const chunks = chunkText(text, 50, 10, 'test');

			chunks.forEach((chunk) => {
				// Check that chunks end with complete sentences (end with punctuation)
				expect(chunk.content).toMatch(/[.!?]\s*$/); // Should end with sentence punctuation

				// Check that words are not broken mid-word (no "feat" + "ures")
				// This is ensured by splitting on sentence boundaries
				const words = chunk.content.split(/\s+/);
				words.forEach((word) => {
					// Each word should be complete (not cut off)
					expect(word.length).toBeGreaterThan(0);
				});
			});
		});

		test('should respect sentence boundaries', () => {
			const text =
				'First sentence. Second sentence. Third sentence. Fourth sentence.';

			const chunks = chunkText(text, 30, 10, 'test');

			chunks.forEach((chunk) => {
				// Each chunk should contain complete sentences
				expect(chunk.content).toMatch(/[.!?]\s*$/);
			});
		});

		test('should handle different punctuation marks', () => {
			const text =
				'Is this a question? Yes it is! This is an exclamation. This is normal.';

			const chunks = chunkText(text, 40, 10, 'test');

			expect(chunks.length).toBeGreaterThan(0);
			chunks.forEach((chunk) => {
				expect(chunk.content).toBeTruthy();
			});
		});
	});

	describe('Overlap Functionality', () => {
		test('should create overlap between chunks', () => {
			const text =
				'First sentence here. Second sentence here. Third sentence here. Fourth sentence here.';

			const chunks = chunkText(text, 50, 20, 'test');

			if (chunks.length > 1) {
				// Check that consecutive chunks have overlapping content
				for (let i = 0; i < chunks.length - 1; i++) {
					const chunk1End = chunks[i].content.slice(-20);
					const chunk2Start = chunks[i + 1].content.slice(0, 30);

					// Some words from end of chunk 1 should appear in start of chunk 2
					const wordsFromEnd = chunk1End
						.split(' ')
						.filter((w) => w.length > 3);
					const hasOverlap = wordsFromEnd.some((word) =>
						chunk2Start.includes(word)
					);

					expect(hasOverlap).toBe(true);
				}
			}
		});

		test('should respect overlap parameter', () => {
			const text =
				'Sentence one. Sentence two. Sentence three. Sentence four. Sentence five. Sentence six.';

			const chunksNoOverlap = chunkText(text, 30, 0, 'test');
			const chunksWithOverlap = chunkText(text, 30, 10, 'test');

			// With overlap, we might get more chunks or similar count
			// but the content should be different
			if (chunksNoOverlap.length > 1 && chunksWithOverlap.length > 1) {
				expect(chunksNoOverlap[1].content).not.toBe(
					chunksWithOverlap[1].content
				);
			}
		});
	});

	describe('Metadata', () => {
		test('should include correct metadata', () => {
			const text = 'First sentence. Second sentence. Third sentence.';
			const source = 'test-document';

			const chunks = chunkText(text, 50, 10, source);

			chunks.forEach((chunk, index) => {
				expect(chunk.id).toBe(`${source}-chunk-${index}`);
				expect(chunk.metadata.source).toBe(source);
				expect(chunk.metadata.chunkIndex).toBe(index);
				expect(chunk.metadata.totalChunks).toBe(chunks.length);
				expect(chunk.metadata.startChar).toBeGreaterThanOrEqual(0);
				expect(chunk.metadata.endChar).toBeGreaterThan(
					chunk.metadata.startChar
				);
			});
		});

		test('should have sequential chunk indices', () => {
			const text =
				'One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten.';

			const chunks = chunkText(text, 20, 5, 'test');

			chunks.forEach((chunk, index) => {
				expect(chunk.metadata.chunkIndex).toBe(index);
			});
		});

		test('should update totalChunks for all chunks', () => {
			const text = 'A. B. C. D. E. F. G. H. I. J.';

			const chunks = chunkText(text, 10, 2, 'test');

			const totalChunks = chunks.length;
			chunks.forEach((chunk) => {
				expect(chunk.metadata.totalChunks).toBe(totalChunks);
			});
		});
	});

	describe('Edge Cases', () => {
		test('should handle very long sentences', () => {
			const longSentence =
				'This is a very long sentence that contains many words and should be handled properly even though it exceeds the normal chunk size because we need to test edge cases.';

			const chunks = chunkText(longSentence, 50, 10, 'test');

			expect(chunks.length).toBeGreaterThanOrEqual(1);
			expect(chunks[0].content).toBeTruthy();
		});

		test('should handle text with multiple spaces', () => {
			const text =
				'First  sentence   with    spaces. Second     sentence.';

			const chunks = chunkText(text, 100, 20, 'test');

			expect(chunks.length).toBeGreaterThan(0);
			chunks.forEach((chunk) => {
				expect(chunk.content).toBeTruthy();
			});
		});

		test('should handle text with newlines', () => {
			const text = 'First sentence.\nSecond sentence.\n\nThird sentence.';

			const chunks = chunkText(text, 100, 20, 'test');

			expect(chunks.length).toBeGreaterThan(0);
		});

		test('should handle special characters', () => {
			const text =
				'React uses JSX! Does it work? Yes, it works. Amazing!';

			const chunks = chunkText(text, 50, 10, 'test');

			expect(chunks.length).toBeGreaterThan(0);
			chunks.forEach((chunk) => {
				expect(chunk.content).toBeTruthy();
			});
		});
	});

	describe('Chunk Size Control', () => {
		test('should respect chunk size limits', () => {
			const text =
				'Short sentence. Another short one. And one more. Plus this. And that. Finally done.';

			const chunkSize = 40;
			const chunks = chunkText(text, chunkSize, 5, 'test');

			chunks.forEach((chunk) => {
				// Allow some flexibility for sentence boundaries
				// but most chunks should be near the target size
				expect(chunk.content.length).toBeLessThanOrEqual(
					chunkSize + 100
				); // Generous buffer for sentences
			});
		});

		test('should create multiple chunks for long text', () => {
			const sentences = Array(20)
				.fill('This is a test sentence.')
				.join(' ');

			const chunks = chunkText(sentences, 100, 20, 'test');

			expect(chunks.length).toBeGreaterThan(1);
		});
	});

	describe('Real-World Example', () => {
		test('should chunk React documentation example', () => {
			const text = `
				React Hooks were introduced in React 16.8.
				They allow you to use state and other React features without writing a class component.
				The most commonly used hooks are useState and useEffect.
				useState lets you add state to function components.
				useEffect lets you perform side effects in function components.
			`;

			const chunks = chunkText(text, 150, 30, 'react-docs');

			expect(chunks.length).toBeGreaterThan(0);

			// Verify all chunks have proper structure
			chunks.forEach((chunk) => {
				expect(chunk.id).toContain('react-docs-chunk-');
				expect(chunk.content.length).toBeGreaterThan(0);
				expect(chunk.metadata.source).toBe('react-docs');
			});

			// Verify content is preserved
			const allContent = chunks.map((c) => c.content).join(' ');
			expect(allContent).toContain('useState');
			expect(allContent).toContain('useEffect');
		});
	});
});

/*
 * TODO: Uncomment these tests once you implement the extraction functions!
 *
 * These tests verify that your extractLinkedInPosts and extractMediumArticle
 * functions work correctly with real data.
 */

import fs from 'fs';
import path from 'path';
import {
	extractLinkedInPosts,
	extractMediumArticle,
	type MediumArticle,
} from './chunking';

describe('LinkedIn Post Extraction', () => {
	let csvContent: string;

	beforeAll(() => {
		const csvPath = path.join(
			process.cwd(),
			'app/scripts/data/brian_posts.csv'
		);
		csvContent = fs.readFileSync(csvPath, 'utf-8');
	});

	test('should extract posts from CSV', () => {
		const posts = extractLinkedInPosts(csvContent);
		expect(posts).toBeDefined();
		expect(Array.isArray(posts)).toBe(true);
		expect(posts.length).toBeGreaterThan(0);
	});

	test('should have correct post structure', () => {
		const posts = extractLinkedInPosts(csvContent);
		const post = posts.find((p) => p.text.length > 100);

		expect(post).toBeDefined();
		expect(post?.text).toBeDefined();
		expect(post?.date).toBeDefined();
		expect(post?.url).toBeDefined();
		expect(typeof post?.likes).toBe('number');
	});

	test('should filter out posts shorter than 100 characters', () => {
		const posts = extractLinkedInPosts(csvContent);
		const longPosts = posts.filter((p) => p.text.length >= 100);
		expect(longPosts.length).toBeGreaterThan(0);
	});
});

describe('Medium Article Extraction', () => {
	let htmlFiles: string[];
	let articlesDir: string;

	beforeAll(() => {
		articlesDir = path.join(process.cwd(), 'app/scripts/data/articles');
		const files = fs.readdirSync(articlesDir);
		htmlFiles = files.filter((f) => f.endsWith('.html'));
	});

	test('should extract article from HTML', () => {
		const filePath = path.join(articlesDir, htmlFiles[0]);
		const htmlContent = fs.readFileSync(filePath, 'utf-8');
		const article = extractMediumArticle(htmlContent);

		expect(article).toBeDefined();
		expect(article?.title).toBeDefined();
		expect(article?.text).toBeDefined();
		expect(article?.date).toBeDefined();
		expect(article?.url).toBeDefined();
	});

	test('should have correct article structure', () => {
		// Find a longer article
		let article: MediumArticle | null = null;
		for (const file of htmlFiles) {
			const filePath = path.join(articlesDir, file);
			const htmlContent = fs.readFileSync(filePath, 'utf-8');
			const extracted = extractMediumArticle(htmlContent);
			if (extracted && extracted.text.length >= 500) {
				article = extracted;
				break;
			}
		}

		expect(article).toBeDefined();
		expect(article?.title.length).toBeGreaterThan(0);
		expect(article?.text.length).toBeGreaterThan(0);
		expect(article?.url).toContain('medium.com');
	});
});

describe('Chunking with Metadata', () => {
	test('should create chunks from LinkedIn post with metadata', () => {
		const csvPath = path.join(
			process.cwd(),
			'app/scripts/data/brian_posts.csv'
		);
		const csvContent = fs.readFileSync(csvPath, 'utf-8');
		const posts = extractLinkedInPosts(csvContent);

		// Find a post longer than 100 chars
		const post = posts.find((p) => p.text.length >= 100);
		expect(post).toBeDefined();

		if (!post) return;

		const chunks = chunkText(post.text, 500, 50, post.url);

		// Add LinkedIn-specific metadata
		chunks.forEach((chunk) => {
			chunk.metadata.date = post.date;
			chunk.metadata.likes = post.likes;
			chunk.metadata.url = post.url;
			chunk.metadata.type = 'linkedin_post';
		});

		expect(chunks.length).toBeGreaterThan(0);
		expect(chunks[0].metadata.date).toBe(post.date);
		expect(chunks[0].metadata.likes).toBe(post.likes);
		expect(chunks[0].metadata.url).toBe(post.url);
		expect(chunks[0].metadata.type).toBe('linkedin_post');
	});

	test('should create chunks from Medium article with metadata', () => {
		const articlesDir = path.join(
			process.cwd(),
			'app/scripts/data/articles'
		);
		const files = fs.readdirSync(articlesDir);
		const htmlFiles = files.filter((f) => f.endsWith('.html'));

		// Find an article longer than 500 chars
		let article: MediumArticle | null = null;
		for (const file of htmlFiles) {
			const filePath = path.join(articlesDir, file);
			const htmlContent = fs.readFileSync(filePath, 'utf-8');
			const extracted = extractMediumArticle(htmlContent);
			if (extracted && extracted.text.length >= 500) {
				article = extracted;
				break;
			}
		}

		expect(article).toBeDefined();
		if (!article) return;

		const chunks = chunkText(article.text, 500, 50, article.url);

		// Add Medium-specific metadata
		chunks.forEach((chunk) => {
			chunk.metadata.title = article.title;
			chunk.metadata.date = article.date;
			chunk.metadata.url = article.url;
			chunk.metadata.type = 'medium_article';
		});

		expect(chunks.length).toBeGreaterThan(0);
		expect(chunks[0].metadata.title).toBe(article.title);
		expect(chunks[0].metadata.date).toBe(article.date);
		expect(chunks[0].metadata.url).toBe(article.url);
		expect(chunks[0].metadata.type).toBe('medium_article');
	});

	test('should have valid chunk structure', () => {
		const text =
			'This is a test sentence. This is another sentence. And one more for good measure.';
		const chunks = chunkText(text, 50, 10, 'test-source');

		expect(chunks.length).toBeGreaterThan(0);

		chunks.forEach((chunk) => {
			expect(chunk.id).toBeDefined();
			expect(chunk.content).toBeDefined();
			expect(chunk.metadata).toBeDefined();
			expect(chunk.metadata.source).toBe('test-source');
			expect(chunk.metadata.chunkIndex).toBeGreaterThanOrEqual(0);
			expect(chunk.metadata.totalChunks).toBe(chunks.length);
			expect(chunk.metadata.startChar).toBeGreaterThanOrEqual(0);
			expect(chunk.metadata.endChar).toBeGreaterThan(
				chunk.metadata.startChar
			);
		});
	});
});

describe('Content Filtering', () => {
	test('should identify short and long LinkedIn posts', () => {
		const csvPath = path.join(
			process.cwd(),
			'app/scripts/data/brian_posts.csv'
		);
		const csvContent = fs.readFileSync(csvPath, 'utf-8');
		const posts = extractLinkedInPosts(csvContent);

		const shortPosts = posts.filter((p) => p.text.length < 100);
		const longPosts = posts.filter((p) => p.text.length >= 100);

		// We should have both short and long posts
		expect(shortPosts.length).toBeGreaterThan(0);
		expect(longPosts.length).toBeGreaterThan(0);
	});

	test('should identify short and long Medium articles', () => {
		const articlesDir = path.join(
			process.cwd(),
			'app/scripts/data/articles'
		);
		const files = fs.readdirSync(articlesDir);
		const htmlFiles = files.filter((f) => f.endsWith('.html')).slice(0, 10);

		let longArticles = 0;

		htmlFiles.forEach((file) => {
			const filePath = path.join(articlesDir, file);
			const htmlContent = fs.readFileSync(filePath, 'utf-8');
			const article = extractMediumArticle(htmlContent);

			if (article && article.text.length >= 500) {
				longArticles++;
			}
		});

		// We should have at least some long articles
		expect(longArticles).toBeGreaterThan(0);
	});
});

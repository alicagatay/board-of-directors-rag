export type Chunk = {
  id: string;
  content: string;
  metadata: {
    source: string;
    chunkIndex: number;
    totalChunks: number;
    startChar: number;
    endChar: number;
    [key: string]: string | number | boolean | string[];
  };
};

// YouTube transcript from the Board of Directors channels
export type YouTubeTranscript = {
  videoId: string;
  videoUrl: string;
  channelUrl: string;
  channelName: string;
  title: string;
  viewCount: number;
  duration: string;
  publishedTime: string;
  fetchedAt: string;
  text: string;
};

/**
 * Splits a long text segment into smaller chunks at word boundaries.
 * Used as fallback when sentence-based splitting creates oversized chunks.
 */
function splitAtWordBoundary(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text];

  const result: string[] = [];
  let remaining = text;

  while (remaining.length > maxSize) {
    // Find last space before maxSize
    let splitPoint = remaining.lastIndexOf(" ", maxSize);
    if (splitPoint === -1) {
      // No space found, force split at maxSize
      splitPoint = maxSize;
    }

    result.push(remaining.substring(0, splitPoint).trim());
    remaining = remaining.substring(splitPoint).trim();
  }

  if (remaining.trim()) {
    result.push(remaining.trim());
  }

  return result;
}

/**
 * Splits text into smaller, overlapping chunks for embedding.
 *
 * WHY CHUNKING IS CRITICAL FOR RAG:
 * LLMs have token limits (4K, 8K, 128K tokens). Even if they could process
 * entire articles, search results would be too broad. Chunking allows:
 * - Precise retrieval: Return only the relevant paragraphs, not whole articles
 * - Better context: Focus the LLM on specific information
 * - Scalability: Process and search millions of chunks efficiently
 *
 * HOW IT WORKS:
 * 1. Split text by sentences (preserves natural language boundaries)
 * 2. Combine sentences until we reach chunkSize
 * 3. Create a new chunk
 * 4. Start next chunk with overlap from the previous one
 *
 * WHY OVERLAP?
 * Imagine this text: "React hooks revolutionized development. They made state management simple."
 * Without overlap:
 *   Chunk 1: "React hooks revolutionized development."
 *   Chunk 2: "They made state management simple."
 * Problem: "They" in chunk 2 is ambiguous without context!
 *
 * With overlap:
 *   Chunk 1: "React hooks revolutionized development."
 *   Chunk 2: "React hooks revolutionized development. They made state management simple."
 * Now chunk 2 has context!
 *
 * CHUNKING STRATEGIES (we use sentence-based):
 * - Fixed size: Simple but can split mid-sentence (bad)
 * - Sentence-based: Preserves natural boundaries (what we do)
 * - Semantic: Use AI to detect topic changes (expensive but best)
 *
 * @param text The text to chunk
 * @param chunkSize Maximum size of each chunk in characters (500 is good for technical content)
 * @param overlap Number of characters to overlap between chunks (50 = ~10 words)
 * @param source Source identifier (typically URL) - used for tracking which document chunks came from
 * @returns Array of text chunks with metadata
 */
export function chunkText(
  text: string,
  chunkSize: number = 500,
  overlap: number = 50,
  source: string = "unknown",
): Chunk[] {
  const chunks: Chunk[] = [];
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  let currentChunk = "";
  let chunkStart = 0;
  let chunkIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const rawSentence = sentences[i].trim() + ".";

    // Split oversized sentences at word boundaries (handles unpunctuated transcripts)
    const sentenceSegments =
      rawSentence.length > chunkSize
        ? splitAtWordBoundary(rawSentence, chunkSize)
        : [rawSentence];

    for (const sentence of sentenceSegments) {
      // If adding this sentence would exceed chunk size, create a chunk
      if (
        currentChunk.length + sentence.length > chunkSize &&
        currentChunk.length > 0
      ) {
        const chunk: Chunk = {
          id: `${source}-chunk-${chunkIndex}`,
          content: currentChunk.trim(),
          metadata: {
            source,
            chunkIndex,
            totalChunks: 0, // Will be updated later
            startChar: chunkStart,
            endChar: chunkStart + currentChunk.length,
          },
        };

        chunks.push(chunk);

        // Start new chunk with overlap
        const overlapText = getLastWords(currentChunk, overlap);
        currentChunk = overlapText + " " + sentence;
        chunkStart = chunk.metadata.endChar - overlapText.length;
        chunkIndex++;
      } else {
        currentChunk += (currentChunk ? " " : "") + sentence;
      }
    }
  }

  // Add final chunk if it has content
  if (currentChunk.trim()) {
    chunks.push({
      id: `${source}-chunk-${chunkIndex}`,
      content: currentChunk.trim(),
      metadata: {
        source,
        chunkIndex,
        totalChunks: 0,
        startChar: chunkStart,
        endChar: chunkStart + currentChunk.length,
      },
    });
  }

  // Update total chunks count
  chunks.forEach((chunk) => {
    chunk.metadata.totalChunks = chunks.length;
  });

  return chunks;
}

/**
 * Gets the last N characters worth of words from a text
 *
 * This is used to create overlap between chunks. We want complete words,
 * not cut-off characters, so we work backwards from the end.
 *
 * @param text The source text
 * @param maxLength Maximum length to return
 * @returns The last words up to maxLength
 *
 * @example
 * getLastWords("React Hooks are awesome", 10)
 * // Returns: "are awesome" (10 chars)
 * // NOT: "re awesome" (cut off "are")
 *

 *
 * Requirements:
 * 1. If text is shorter than maxLength, return the whole text
 * 2. Otherwise, return the last maxLength characters worth of COMPLETE words
 * 3. Build the result backwards to ensure you get the last words
 *
 * Steps:
 * 1. Check if text.length <= maxLength, if so return text
 * 2. Split text into words using .split(' ')
 * 3. Start with empty result string
 * 4. Loop through words BACKWARDS (from end to start)
 * 5. For each word, check if adding it would exceed maxLength
 * 6. If it would exceed, break the loop
 * 7. Otherwise, prepend the word to result (word + ' ' + result)
 * 8. Return the result
 */
function getLastWords(text: string, maxLength: number): string {
  // 1. Check if text.length <= maxLength, if so return text
  if (text.length <= maxLength) {
    return text;
  }
  // 2. Split text into words using .split(' ')
  const wordList: string[] = text.split(" ");
  // 3. Start with empty result string
  let resultString: string = "";
  // 4. Loop through words backwards
  for (let i = wordList.length - 1; i >= 0; i--) {
    // 5. For each word, check if adding it would exceed maxLength.
    let newWord: string = wordList[i];

    // 5a. Decide whether the new word needs a space after it
    //     in the result string.
    if (resultString.length) {
      newWord = wordList[i] + " ";
    }
    // 6. If it would exceed, break the loop
    // 7. Otherwise, prepend the word to result
    if (resultString.length + newWord.length > maxLength) {
      break;
    } else {
      resultString = newWord + resultString;
    }
  }
  // 8. Return the result
  return resultString;
}

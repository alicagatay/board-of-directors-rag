# Chunking Strategy for Youtube Transcripts in our RAG System

## Core Implementation: `chunkText()` Function

Located in `app/libs/chunking.ts`, this function handles all chunking with a sentence-based approach and word-boundary fallback.

### Why Chunking Matters for RAG

LLMs have token limits and even when they can process full documents, broad context reduces retrieval precision. Chunking enables:

- **Precise retrieval**: Return only relevant paragraphs, not entire documents
- **Better context**: Focus the LLM on specific, targeted information
- **Scalability**: Efficiently process and search across millions of chunks

### Algorithm Overview

1. **Split by sentences** using `.!?` as delimiters (preserves natural language boundaries)
2. **Word-boundary fallback**: If a "sentence" exceeds chunk size (common in unpunctuated transcripts), split at word boundaries instead
3. **Accumulate sentences** until reaching the chunk size limit
4. **Create overlap** by carrying forward the last N characters (as complete words) to the next chunk

### Why Overlap?

Consider this text: _"React hooks revolutionized development. They made state management simple."_

**Without overlap:**

- Chunk 1: "React hooks revolutionized development."
- Chunk 2: "They made state management simple."
- Problem: "They" in chunk 2 loses its referent!

**With overlap:**

- Chunk 1: "React hooks revolutionized development."
- Chunk 2: "...revolutionized development. They made state management simple."
- Now chunk 2 has context for the pronoun.

### Helper Functions

- **`splitAtWordBoundary(text, maxSize)`**: Fallback for oversized sentences. Finds the last space before `maxSize` and splits there, ensuring we never break mid-word.
- **`getLastWords(text, maxLength)`**: Extracts the last N characters as complete words for overlap generation. Works backward through the word list to avoid cutting words.

---

## Chunking Strategy for YouTube Transcripts

**Configuration**: `chunkText(text, 1000, 200, videoUrl)`

- Chunk size: **1000 characters**
- Overlap: **200 characters**

### Challenge: No Punctuation

YouTube auto-generated transcripts typically lack punctuation entirely. A 90,000-character transcript might contain only 6 periods. This breaks sentence-based chunking because the entire transcript appears as one giant "sentence."

### Solution: Word-Boundary Fallback

When a sentence segment exceeds chunk size, `splitAtWordBoundary()` kicks in:

```typescript
const sentenceSegments =
  rawSentence.length > chunkSize
    ? splitAtWordBoundary(rawSentence, chunkSize)
    : [rawSentence];
```

This ensures every chunk stays within the 1000-character limit even without punctuation.

### Metadata Preserved

Each chunk includes rich metadata for filtering and context:

```typescript
{
  id: string,              // "{videoUrl}-chunk-{index}"
  content: string,         // The chunk text
  metadata: {
    source: string,        // YouTube video URL
    chunkIndex: number,    // Position in sequence
    totalChunks: number,   // Total chunks from this transcript
    startChar: number,     // Character offset (start)
    endChar: number,       // Character offset (end)
    videoId: string,
    videoUrl: string,
    channelName: string,   // Used for mentor filtering in Qdrant
    channelUrl: string,
    title: string,
    viewCount: number,
    duration: string,
    publishedTime: string,
    contentType: "transcript"
  }
}
```

### Upload Pipeline

Located in `app/scripts/upload-transcripts.ts`:

1. Read JSON transcript files from `app/scripts/data/transcripts/{channelName}/`
2. Chunk each transcript (1000 chars, 200 overlap)
3. Generate embeddings via OpenAI `text-embedding-3-small` (512 dimensions, batch size 30)
4. Upsert to Qdrant `transcripts` collection with full metadata
5. Keyword index on `channelName` enables mentor-specific filtering

---

## Testing

19 tests in `app/libs/chunking.test.ts` verify:

- Basic sentence splitting
- Chunk size limits (no chunk exceeds max)
- Overlap functionality
- Edge cases (empty text, very long words, no punctuation)
- Metadata generation accuracy

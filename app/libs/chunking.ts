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

// TODO: Define LinkedInPost type
// Should have: text (string), date (string), url (string), likes (number)
export type LinkedInPost = {
  text: string;
  date: string;
  url: string;
  likes: number;
};

// TODO: Define MediumArticle type
// Should have: title (string), text (string), date (string), url (string)
export type MediumArticle = {
  // metadata
  text: string;
  url: string;
  author: string;
  title: string;
  date: string;
  source: string;
  language: string;
};

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
    const sentence = sentences[i].trim() + ".";

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

/**
 * Extracts LinkedIn posts from CSV data exported from LinkedIn.
 *
 * WHY THIS PARSING IS COMPLEX:
 * LinkedIn post text can contain commas, newlines, and quotes - all characters
 * that have special meaning in CSV files. The CSV format handles this by:
 * - Wrapping fields containing special characters in double quotes
 * - Escaping internal quotes by doubling them ("" instead of ")
 * - Allowing fields to span multiple lines when quoted
 *
 * COLUMN MAPPING (from LinkedIn CSV export):
 * - text → post content (the actual post body)
 * - createdAt (TZ=America/Los_Angeles) → date (when the post was published)
 * - link → url (direct link to the LinkedIn post)
 * - numReactions → likes (engagement count)
 *
 * @param csvContent The CSV file content as a string
 * @returns Array of LinkedInPost objects with text, date, url, and likes
 */
export function extractLinkedInPosts(csvContent: string): LinkedInPost[] {
  const csvLines = csvContent.split("\n");
  const headerRow = csvLines[0];

  // Find column indices from header row
  // This makes the parser resilient to column order changes in LinkedIn exports
  const columnNames = headerRow.split(",");
  const textColumnIndex = columnNames.indexOf("text");
  const dateColumnIndex = columnNames.findIndex((col) =>
    col.includes("createdAt"),
  );
  const urlColumnIndex = columnNames.indexOf("link");
  const likesColumnIndex = columnNames.indexOf("numReactions");

  const extractedPosts: LinkedInPost[] = [];

  // Process each row (skip header at index 0)
  let currentLineIndex = 1;
  while (currentLineIndex < csvLines.length) {
    const currentLine = csvLines[currentLineIndex];
    if (!currentLine.trim()) {
      currentLineIndex++;
      continue;
    }

    // Parse CSV row handling quoted fields with embedded commas/newlines
    const parsedFields: string[] = [];
    let currentFieldContent = "";
    let isInsideQuotedField = false;
    let charIndex = 0;
    let lineBeingParsed = currentLine;

    while (true) {
      if (charIndex >= lineBeingParsed.length) {
        // If we're inside quotes, the field spans multiple lines
        if (isInsideQuotedField && currentLineIndex + 1 < csvLines.length) {
          currentFieldContent += "\n";
          currentLineIndex++;
          lineBeingParsed = csvLines[currentLineIndex];
          charIndex = 0;
          continue;
        } else {
          // End of field at end of line
          parsedFields.push(currentFieldContent);
          break;
        }
      }

      const currentChar = lineBeingParsed[charIndex];

      if (currentChar === '"') {
        if (isInsideQuotedField && lineBeingParsed[charIndex + 1] === '"') {
          // Escaped quote ("") - add single quote to field
          currentFieldContent += '"';
          charIndex += 2;
        } else {
          // Toggle quote mode
          isInsideQuotedField = !isInsideQuotedField;
          charIndex++;
        }
      } else if (currentChar === "," && !isInsideQuotedField) {
        // Field separator - save current field and start new one
        parsedFields.push(currentFieldContent);
        currentFieldContent = "";
        charIndex++;
      } else {
        currentFieldContent += currentChar;
        charIndex++;
      }
    }

    // Extract values from parsed fields if we have enough columns
    const maxRequiredIndex = Math.max(
      textColumnIndex,
      dateColumnIndex,
      urlColumnIndex,
      likesColumnIndex,
    );
    if (parsedFields.length > maxRequiredIndex) {
      extractedPosts.push({
        text: parsedFields[textColumnIndex] || "",
        date: parsedFields[dateColumnIndex] || "",
        url: parsedFields[urlColumnIndex] || "",
        likes: parseInt(parsedFields[likesColumnIndex] || "0", 10) || 0,
      });
    }

    currentLineIndex++;
  }

  return extractedPosts;
}

/**
 * TODO: Implement extractMediumArticle function
 *
 * This function should extract a Medium article from HTML content.
 *
 * @param htmlContent The HTML file content as a string
 * @returns MediumArticle object with title, text, date, and url (or null if extraction fails)
 *
 * Requirements:
 * 1. Extract the title from the <title> tag
 *    - Use regex: /<title>(.*?)<\/title>/
 *
 * 2. Extract the date from the <time> tag's datetime attribute
 *    - Look for: <time class="dt-published" datetime="...">
 *    - Use regex to capture the datetime value
 *
 * 3. Extract the URL from the canonical link
 *    - Look for: <a href="..." class="p-canonical">
 *    - Should be a medium.com URL
 *
 * 4. Extract the text content from the body section
 *    - Find: <section data-field="body" class="e-content">...</section>
 *    - Remove all HTML tags but keep the text
 *    - Clean up whitespace (replace multiple spaces with single space)
 *    - Trim the result
 *
 * 5. Return null if extraction fails (use try/catch)
 *
 * Hints:
 * - Use .match() with regex to extract values
 * - Use .replace() to remove HTML tags: /<[^>]+>/g
 * - Use .replace(/\s+/g, ' ') to normalize whitespace
 * - Use try/catch to handle errors and return null
 */
export function extractMediumArticle(
  htmlContent: string,
): MediumArticle | null {
  // 1. Extract title from <title> tag
  const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/);
  if (!titleMatch) return null;
  const title = titleMatch[1];

  // 2. Extract date from <time> tag's datetime attribute
  const dateMatch = htmlContent.match(
    /<time[^>]*class="dt-published"[^>]*datetime="([^"]*)"/,
  );
  if (!dateMatch) return null;
  const date = dateMatch[1];

  // 3. Extract URL from canonical link
  const urlMatch = htmlContent.match(
    /<a[^>]*href="([^"]*)"[^>]*class="p-canonical"/,
  );
  if (!urlMatch) return null;
  const url = urlMatch[1];

  // 4. Extract text content from body section
  const bodyMatch = htmlContent.match(
    /<section[^>]*data-field="body"[^>]*class="e-content"[^>]*>([\s\S]*?)<\/section>/,
  );
  if (!bodyMatch) return null;

  // Remove HTML tags
  let text = bodyMatch[1].replace(/<[^>]+>/g, "");
  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Extract author from footer anchor tag with class p-author h-card
  const authorMatch = htmlContent.match(
    /<a[^>]*class="p-author h-card"[^>]*>([^<]*)<\/a>/,
  );
  const author = authorMatch ? authorMatch[1] : "Unknown";

  // Extract language (optional, from html lang attribute or default)
  const langMatch = htmlContent.match(/<html[^>]*lang="([^"]*)"/);
  const language = langMatch ? langMatch[1] : "en";

  return {
    text,
    url,
    author,
    title,
    date,
    source: "medium",
    language,
  };
}

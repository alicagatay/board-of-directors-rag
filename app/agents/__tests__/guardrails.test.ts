/**
 * GUARDRAIL TESTS
 *
 * These tests verify that the query relevance guardrails correctly:
 * 1. Reject clearly irrelevant queries (weather, recipes, jokes)
 * 2. Accept clearly relevant queries (LinkedIn, software, careers)
 * 3. Handle edge cases appropriately
 *
 * NOTE ON NON-DETERMINISM:
 * LLM responses are not perfectly deterministic. These tests check
 * the general behavior pattern, not exact outputs. We use clearly
 * distinct examples (obviously relevant vs obviously irrelevant) to
 * minimize flakiness.
 *
 * Run with: yarn test guardrails
 */

import {
  checkQueryRelevance,
  RELEVANT_TOPICS,
  SIMILARITY_SCORE_THRESHOLD,
  buildRejectionMessage,
  buildNoContentFoundMessage,
} from "../guardrails";

// Increase timeout for LLM API calls
jest.setTimeout(30000);

describe("Query Relevance Guardrails", () => {
  describe("checkQueryRelevance", () => {
    describe("should REJECT clearly irrelevant queries", () => {
      const irrelevantQueries = [
        "What's the weather like today?",
        "Give me a recipe for chocolate cake",
        "Tell me a funny joke",
        "Who won the Super Bowl last year?",
        "What's the capital of France?",
        "How do I fix a leaky faucet?",
      ];

      test.each(irrelevantQueries)('rejects: "%s"', async (query) => {
        const result = await checkQueryRelevance(query);

        expect(result.isRelevant).toBe(false);
        expect(result.reason).toBeTruthy();
        expect(typeof result.reason).toBe("string");
      });
    });

    describe("should ACCEPT clearly relevant queries", () => {
      const relevantQueries = [
        "How do I write engaging LinkedIn posts?",
        "What are best practices for software engineering interviews?",
        "Help me create content about AI trends for LinkedIn",
        "Tips for transitioning into a software development career",
        "What should I learn at a coding bootcamp?",
        "How to build a personal brand in tech",
        "Write a LinkedIn post about learning to code",
        "Career advice for junior developers",
      ];

      test.each(relevantQueries)('accepts: "%s"', async (query) => {
        const result = await checkQueryRelevance(query);

        expect(result.isRelevant).toBe(true);
        expect(result.reason).toBeTruthy();
        expect(typeof result.reason).toBe("string");
      });
    });

    describe("edge cases", () => {
      test("handles empty query gracefully", async () => {
        const result = await checkQueryRelevance("");

        // Should still return a valid response (likely irrelevant)
        expect(typeof result.isRelevant).toBe("boolean");
        expect(typeof result.reason).toBe("string");
      });

      test("handles very long query", async () => {
        const longQuery =
          "I want to write a LinkedIn post about software engineering ".repeat(
            50,
          );
        const result = await checkQueryRelevance(longQuery);

        expect(result.isRelevant).toBe(true);
        expect(typeof result.reason).toBe("string");
      });
    });
  });

  describe("RELEVANT_TOPICS constant", () => {
    test("contains expected topics", () => {
      expect(RELEVANT_TOPICS).toContain("Software development");
      expect(RELEVANT_TOPICS).toContain("LinkedIn content strategy");
      expect(RELEVANT_TOPICS).toContain("Career advice");
      expect(RELEVANT_TOPICS).toContain("AI and machine learning");
    });

    test("is not empty", () => {
      expect(RELEVANT_TOPICS.length).toBeGreaterThan(0);
    });
  });

  describe("SIMILARITY_SCORE_THRESHOLD constant", () => {
    test("is set to 0.5", () => {
      expect(SIMILARITY_SCORE_THRESHOLD).toBe(0.5);
    });

    test("is within valid cosine similarity range", () => {
      expect(SIMILARITY_SCORE_THRESHOLD).toBeGreaterThanOrEqual(-1);
      expect(SIMILARITY_SCORE_THRESHOLD).toBeLessThanOrEqual(1);
    });
  });

  describe("buildRejectionMessage", () => {
    test("includes all relevant topics", () => {
      const message = buildRejectionMessage();

      RELEVANT_TOPICS.forEach((topic) => {
        expect(message).toContain(topic);
      });
    });

    test("includes helpful examples", () => {
      const message = buildRejectionMessage();

      expect(message).toContain("LinkedIn");
      expect(message).toContain("example");
    });
  });

  describe("buildNoContentFoundMessage", () => {
    test("explains the situation", () => {
      const message = buildNoContentFoundMessage();

      expect(message).toContain("couldn't find");
      expect(message).toContain("knowledge base");
    });

    test("suggests next steps", () => {
      const message = buildNoContentFoundMessage();

      expect(message).toContain("rephras");
    });
  });
});

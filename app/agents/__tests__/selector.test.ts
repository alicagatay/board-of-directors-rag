/**
 * MENTOR SELECTOR TESTS
 *
 * These tests verify that queries are routed to the correct mentor
 * from the Board of Directors based on their expertise.
 *
 * These tests call the API route handler directly - no server needed!
 */

import { POST } from "@/app/api/select-agent/route";
import { NextRequest } from "next/server";
import { mentorIdSchema } from "@/app/mentors/config";

// Get all valid mentor IDs from the schema
const validMentorIds = mentorIdSchema.options;

describe("Mentor Selector Routing", () => {
  // Increase timeout for LLM API calls
  jest.setTimeout(15000);

  // Helper to create a mock NextRequest
  const createRequest = (query: string): NextRequest => {
    return {
      json: async () => ({
        messages: [{ role: "user", content: query }],
      }),
    } as NextRequest;
  };

  // Helper to call the selector and get response
  const selectMentor = async (query: string) => {
    const request = createRequest(query);
    const response = await POST(request);
    return response.json();
  };

  describe("Expertise-Based Routing", () => {
    it("should route SaaS/productivity questions to Dan Martell", async () => {
      const result = await selectMentor(
        "How do I buy back my time as a founder?",
      );

      expect(result.mentor).toBe("danmartell");
      expect(result.query).toBeTruthy();
    });

    it("should route offers/scaling questions to Alex Hormozi", async () => {
      const result = await selectMentor(
        "How do I create an irresistible offer?",
      );

      expect(result.mentor).toBe("AlexHormozi");
    });

    it("should route coding/tech questions to Brian Jenney", async () => {
      const result = await selectMentor(
        "How do I learn JavaScript as a beginner?",
      );

      expect(result.mentor).toBe("brianjenney");
    });
  });

  describe("Explicit Mentor Mentions", () => {
    it("should select Alex when explicitly mentioned", async () => {
      const result = await selectMentor(
        "What would Alex Hormozi say about pricing?",
      );

      expect(result.mentor).toBe("AlexHormozi");
    });

    it("should select Dan Martell when explicitly mentioned", async () => {
      const result = await selectMentor(
        "What does Dan Martell think about delegation?",
      );

      expect(result.mentor).toBe("danmartell");
    });
  });

  describe("Response Structure", () => {
    it("should return valid response structure", async () => {
      const result = await selectMentor("How do I grow my business?");

      // Verify required fields exist
      expect(result).toHaveProperty("mentor");
      expect(result).toHaveProperty("query");
      expect(result).toHaveProperty("confidence");

      // Verify mentor is valid
      expect(validMentorIds).toContain(result.mentor);
    });

    it("should refine queries", async () => {
      const result = await selectMentor("Tell me about building wealth");

      // Refined query should be non-empty
      expect(result.query).toBeTruthy();
      expect(result.query.length).toBeGreaterThan(0);
    });

    it("should return confidence score", async () => {
      const result = await selectMentor("How do I scale my startup?");

      expect(result.confidence).toBeGreaterThanOrEqual(1);
      expect(result.confidence).toBeLessThanOrEqual(10);
    });
  });

  describe("Edge Cases", () => {
    it("should handle ambiguous queries by selecting a valid mentor", async () => {
      const result = await selectMentor("How do I be successful?");

      // Should pick one of the valid mentors
      expect(validMentorIds).toContain(result.mentor);
    });

    it("should handle very short queries", async () => {
      const result = await selectMentor("Help with business");

      // Should still select a valid mentor
      expect(validMentorIds).toContain(result.mentor);
    });
  });
});

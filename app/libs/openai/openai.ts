/**
 * OPENAI CLIENT AND AGENT CONFIGURATION
 *
 * KEY CONCEPTS:
 *
 * 1. FINE-TUNED vs BASE MODELS:
 *    - Base models (gpt-4o-mini): General purpose, trained on broad internet data
 *    - Fine-tuned models (ft:gpt-4o-mini...): Specialized on your specific data
 *    - Fine-tuning makes models better at specific tasks but costs more
 *
 * 2. AGENT SPECIALIZATION:
 *    - Different agents handle different types of queries
 *    - LinkedIn agent: Uses fine-tuned model for professional content
 *    - News agent: Uses RAG (vector search) for current events
 *    - General agent: Fallback for everything else
 *
 * 3. HELICONE INTEGRATION:
 *    - Observability platform for monitoring AI usage
 *    - Tracks costs, performance, and usage patterns
 *    - Essential for production AI applications
 *
 * EXPERIMENT IDEAS:
 * - Try different base models (gpt-4o, gpt-3.5-turbo)
 * - Add temperature/top_p parameters for creativity control
 * - Add system prompts to agent configurations
 *
 * Learn more about fine-tuning: https://platform.openai.com/docs/guides/fine-tuning
 * Learn more about Helicone: https://docs.helicone.ai/
 */

import dotenv from "dotenv";
import OpenAI from "openai";

// Load environment variables when running scripts (Next.js loads them automatically)
if (typeof window === "undefined" && !process.env.NEXT_RUNTIME) {
  dotenv.config();
}

export const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY as string,
  baseURL: "https://oai.helicone.ai/v1",
  defaultHeaders: {
    "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
    "Helicone-Cache-Enabled": "true",
  },
});

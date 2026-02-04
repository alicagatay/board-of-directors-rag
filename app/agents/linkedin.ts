import { AgentRequest, AgentResponse } from "./types";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export async function linkedInAgent(
  request: AgentRequest,
): Promise<AgentResponse> {
  // TODO: Step 1 - Get the fine-tuned model ID
  // Access process.env.OPENAI_FINETUNED_MODEL
  // If not configured, you might want to throw an error or use a fallback

  // TODO: Step 2 - Build the system prompt
  // Include instructions for the LinkedIn agent
  // Add context about the original and refined queries:
  //   - request.originalQuery - what the user originally asked
  //   - request.query - the refined/improved version
  // Tell the model to create engaging LinkedIn posts

  // TODO: Step 3 - Stream the response
  // Use streamText() from the 'ai' package
  // Pass the model using openai()
  // Include system prompt and messages from request.messages
  // Return the stream
  return streamText({
    model: openai("gpt-4o"),
    temperature: 0.8,
    messages: [
      {
        role: "system",
        content: `
				Polish the linkedin post to make it more engaging. Here is the original post: ${request.query}
				`,
      },
    ],
  });
}

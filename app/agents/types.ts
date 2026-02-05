import { z } from "zod";
import { StreamTextResult } from "ai";
import { MentorId } from "@/app/mentors/config";

export const agentTypeSchema = z
  .enum(["rag"])
  .describe("Agent types for the Board of Directors RAG system");

export type AgentType = z.infer<typeof agentTypeSchema>;

export const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export type Message = z.infer<typeof messageSchema>;

export interface AgentRequest {
  type: AgentType;
  mentorId: MentorId; // Which mentor from the Board should answer
  query: string; // Refined/summarized query from selector
  originalQuery: string; // Original user message
  messages: Message[]; // Conversation history
}

export type AgentResponse = StreamTextResult<Record<string, never>, never>;

export interface AgentConfig {
  name: string;
  description: string;
}

import { z } from "zod";
import { agentTypeSchema, messageSchema } from "@/app/agents/types";
import { mentorIdSchema } from "@/app/mentors/config";
import { getAgent } from "@/app/agents/registry";

const chatSchema = z.object({
  messages: z.array(messageSchema),
  agent: agentTypeSchema.optional().default("rag"),
  mentor: mentorIdSchema,
  query: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = chatSchema.parse(body);
    const { messages, agent, mentor, query } = parsed;

    // Get original user query (last message)
    const lastMessage = messages[messages.length - 1];
    const originalQuery = lastMessage?.content || query;

    // Get the agent executor from registry
    const agentExecutor = getAgent(agent);

    // Execute agent with mentor context
    const result = await agentExecutor({
      type: agent,
      mentorId: mentor,
      query,
      originalQuery,
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Error in chat API:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

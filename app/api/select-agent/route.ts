import { NextRequest, NextResponse } from "next/server";
import { openaiClient } from "@/app/libs/openai/openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { agentTypeSchema, messageSchema } from "@/app/agents/types";
import { agentConfigs } from "@/app/agents/config";

const selectAgentSchema = z.object({
  messages: z.array(messageSchema).min(1),
});

const agentSelectionSchema = z.object({
  agent: agentTypeSchema,
  query: z
    .string()
    .describe(
      "refine query for agent and remove any unnecessary words and correct spelling",
    ),
  confidence: z
    .number()
    .min(1)
    .max(10)
    .describe(
      "confidence score between 1 and 10 that the agent is the best fit for the user query",
    ),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = selectAgentSchema.parse(body);
    const { messages } = parsed;

    // Take last 5 messages for context
    const recentMessages = messages.slice(-5);

    // Build agent descriptions from config
    const agentDescriptions = Object.entries(agentConfigs)
      .map(([key, config]) => `- "${key}": ${config.description}`)
      .join("\n");

    // TODO: Step 1 - Call OpenAI with structured output
    const response = await openaiClient.responses.parse({
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: `
					Pick the best agent based on the user query
					The agents are: ${JSON.stringify(agentDescriptions)}

					`,
        },
        ...recentMessages,
      ],
      temperature: 0.1, // 1 for high creativity, 0 for low creativity
      text: {
        format: zodTextFormat(agentSelectionSchema, "agentSelection"),
      },
    });

    // TODO: Step 2 - Extract the parsed output
    const { agent, query, confidence } = response.output_parsed ?? {};

    console.log("response", JSON.stringify(response.output_parsed, null, 2));

    return NextResponse.json({
      agent,
      query,
      confidence,
    });
  } catch (error) {
    console.error("Error selecting agent:", error);
    return NextResponse.json(
      { error: "Failed to select agent" },
      { status: 500 },
    );
  }
}

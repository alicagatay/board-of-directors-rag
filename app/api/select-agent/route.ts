import { NextRequest, NextResponse } from "next/server";
import { openaiClient } from "@/app/libs/openai/openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { messageSchema } from "@/app/agents/types";
import { mentorIdSchema, getMentorDescriptions } from "@/app/mentors/config";
import { checkQueryRelevance } from "@/app/agents/guardrails";

const selectAgentSchema = z.object({
  messages: z.array(messageSchema).min(1),
});

const mentorSelectionSchema = z.object({
  mentor: mentorIdSchema.describe(
    "The mentor ID best suited to answer this query",
  ),
  query: z
    .string()
    .describe(
      "Refine query for the mentor - remove unnecessary words and correct spelling",
    ),
  confidence: z
    .number()
    .min(1)
    .max(10)
    .describe(
      "Confidence score (1-10) that this mentor is the best fit for the query",
    ),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = selectAgentSchema.parse(body);
    const { messages } = parsed;

    // Take last 5 messages for context
    const recentMessages = messages.slice(-5);

    // Get the user's query from the last message
    const lastMessage = recentMessages[recentMessages.length - 1];
    const userQuery = lastMessage?.content || "";

    // Check if query is relevant to our topics
    const relevanceCheck = await checkQueryRelevance(userQuery);

    // If query is irrelevant, randomly select a mentor
    // This ensures variety in responses when rejecting queries
    if (!relevanceCheck.isRelevant) {
      const allMentors = mentorIdSchema.options;
      const randomMentor = allMentors[Math.floor(Math.random() * allMentors.length)];

      console.log(
        `Query rejected as irrelevant: "${userQuery}" - Randomly selected mentor: ${randomMentor}`,
      );

      return NextResponse.json({
        mentor: randomMentor,
        query: userQuery,
        confidence: 1, // Low confidence since query is irrelevant
      });
    }

    // Build mentor descriptions from config
    const mentorDescriptions = getMentorDescriptions();

    const response = await openaiClient.responses.parse({
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: `You are the Board of Directors router. Your job is to select which mentor should answer the user's question based on their expertise.

The Board of Directors includes these mentors:
${mentorDescriptions}

Selection rules:
1. If the user explicitly mentions a mentor by name, select that mentor
2. Otherwise, match the query topic to mentor expertise
3. For ambiguous queries, prefer mentors with broader business expertise
4. Consider conversation context from previous messages`,
        },
        ...recentMessages,
      ],
      temperature: 0.1,
      text: {
        format: zodTextFormat(mentorSelectionSchema, "mentorSelection"),
      },
    });

    const { mentor, query, confidence } = response.output_parsed ?? {};

    console.log("response", JSON.stringify(response.output_parsed, null, 2));

    return NextResponse.json({
      mentor,
      query,
      confidence,
    });
  } catch (error) {
    console.error("Error selecting mentor:", error);
    return NextResponse.json(
      { error: "Failed to select mentor" },
      { status: 500 },
    );
  }
}

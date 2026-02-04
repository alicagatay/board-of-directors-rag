import { AgentType, AgentConfig } from "./types";

export const agentConfigs: Record<AgentType, AgentConfig> = {
  linkedin: {
    name: "LinkedIn Agent",
    description:
      "For writing posts in a certain voice and tone for LinkedIn. The user will provide a topic and you will write a post about it.",
  },
  rag: {
    name: "RAG Agent",
    description: "For generating a LinkedIn post based on a user query.",
  },
};

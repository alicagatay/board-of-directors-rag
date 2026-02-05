import { AgentType, AgentRequest, AgentResponse } from "./types";
import { ragAgent } from "./rag";

type AgentExecutor = (request: AgentRequest) => Promise<AgentResponse>;

export const agentRegistry: Record<AgentType, AgentExecutor> = {
  rag: ragAgent,
};

export function getAgent(agentType: AgentType): AgentExecutor {
  const agent = agentRegistry[agentType];
  if (!agent) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }
  return agent;
}

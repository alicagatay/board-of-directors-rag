import { AgentType, AgentRequest, AgentResponse } from './types';
import { linkedInAgent } from './linkedin';
import { ragAgent } from './rag';

type AgentExecutor = (request: AgentRequest) => Promise<AgentResponse>;

export const agentRegistry: Record<AgentType, AgentExecutor> = {
	linkedin: linkedInAgent,
	rag: ragAgent,
};

export function getAgent(agentType: AgentType): AgentExecutor {
	const agent = agentRegistry[agentType];
	if (!agent) {
		throw new Error(`Unknown agent type: ${agentType}`);
	}
	return agent;
}

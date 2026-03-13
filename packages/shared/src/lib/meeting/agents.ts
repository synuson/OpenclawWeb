import type { AgentId } from "@/lib/meeting/types";
import {
  buildRoleSystemPrompt,
  getRoleDefinitionForAgent,
  ROLE_DEFINITION_ID_BY_AGENT_ID,
  type AgentRoleDefinitionId
} from "@/lib/meeting/role-definitions";

export type Agent = {
  id: AgentId;
  roleDefinitionId: AgentRoleDefinitionId;
  name: string;
  title: string;
  tagline: string;
  emoji: string;
  role: string;
  color: "emerald" | "amber";
  mentionAliases: string[];
  systemPrompt: string;
  voiceId?: string;
};

const ASSISTANT_ROLE = getRoleDefinitionForAgent("assistant");
const ANALYST_ROLE = getRoleDefinitionForAgent("analyst");

export const AGENTS: Agent[] = [
  {
    id: "assistant",
    roleDefinitionId: ROLE_DEFINITION_ID_BY_AGENT_ID.assistant,
    name: "서윤",
    title: "진행자",
    tagline: ASSISTANT_ROLE.name,
    emoji: "SY",
    role: ASSISTANT_ROLE.shortDescription,
    color: "emerald",
    mentionAliases: ["assistant", "moderator", "mc", "seoyun", "서윤", "진행자"],
    systemPrompt: buildRoleSystemPrompt("assistant")
  },
  {
    id: "analyst",
    roleDefinitionId: ROLE_DEFINITION_ID_BY_AGENT_ID.analyst,
    name: "이안",
    title: "분석가",
    tagline: ANALYST_ROLE.name,
    emoji: "IA",
    role: ANALYST_ROLE.shortDescription,
    color: "amber",
    mentionAliases: ["analyst", "an", "ian", "이안", "분석가"],
    systemPrompt: buildRoleSystemPrompt("analyst")
  }
];

export const DEFAULT_AGENT_ID: AgentId = "assistant";

export const AGENTS_BY_ID: Record<string, Agent> = Object.fromEntries(
  AGENTS.map((agent) => [agent.id, agent])
) as Record<string, Agent>;

export function detectMentionedAgentId(message: string): AgentId | undefined {
  const matches = message.matchAll(/@([^\s@]+)/g);

  for (const match of matches) {
    const raw = (match[1] ?? "").trim();
    const token = normalizeMentionToken(raw);
    const found = AGENTS.find((agent) => agent.mentionAliases.includes(token));
    if (found) {
      return found.id;
    }
  }

  return undefined;
}

function normalizeMentionToken(value: string) {
  return value.toLowerCase().replace(/[.,!?;:(){}\[\]"']/g, "").trim();
}
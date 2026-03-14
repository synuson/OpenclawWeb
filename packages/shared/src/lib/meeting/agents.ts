import { DEFAULT_LOCALE, type AppLocale } from "@/lib/i18n/config";
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

const AGENT_COPY: Record<
  AppLocale,
  Record<
    AgentId,
    {
      name: string;
      title: string;
      mentionAliases: string[];
    }
  >
> = {
  ko: {
    assistant: {
      name: "서윤",
      title: "진행자",
      mentionAliases: ["assistant", "moderator", "mc", "seoyun", "서윤", "진행자"]
    },
    analyst: {
      name: "이안",
      title: "분석가",
      mentionAliases: ["analyst", "an", "ian", "이안", "분석가"]
    }
  },
  en: {
    assistant: {
      name: "Seoyun",
      title: "Facilitator",
      mentionAliases: ["assistant", "moderator", "mc", "seoyun", "facilitator", "서윤", "진행자"]
    },
    analyst: {
      name: "Ian",
      title: "Analyst",
      mentionAliases: ["analyst", "an", "ian", "risk", "이안", "분석가"]
    }
  }
};

export const DEFAULT_AGENT_ID: AgentId = "assistant";

export function getAgents(locale: AppLocale = DEFAULT_LOCALE): Agent[] {
  const assistantRole = getRoleDefinitionForAgent("assistant", locale);
  const analystRole = getRoleDefinitionForAgent("analyst", locale);
  const agentCopy = AGENT_COPY[locale];

  return [
    {
      id: "assistant",
      roleDefinitionId: ROLE_DEFINITION_ID_BY_AGENT_ID.assistant,
      name: agentCopy.assistant.name,
      title: agentCopy.assistant.title,
      tagline: assistantRole.name,
      emoji: "SY",
      role: assistantRole.shortDescription,
      color: "emerald",
      mentionAliases: agentCopy.assistant.mentionAliases,
      systemPrompt: buildRoleSystemPrompt("assistant", locale)
    },
    {
      id: "analyst",
      roleDefinitionId: ROLE_DEFINITION_ID_BY_AGENT_ID.analyst,
      name: agentCopy.analyst.name,
      title: agentCopy.analyst.title,
      tagline: analystRole.name,
      emoji: "IA",
      role: analystRole.shortDescription,
      color: "amber",
      mentionAliases: agentCopy.analyst.mentionAliases,
      systemPrompt: buildRoleSystemPrompt("analyst", locale)
    }
  ];
}

export function getAgentsById(locale: AppLocale = DEFAULT_LOCALE) {
  return Object.fromEntries(getAgents(locale).map((agent) => [agent.id, agent])) as Record<AgentId, Agent>;
}

export function getAgent(agentId: AgentId, locale: AppLocale = DEFAULT_LOCALE) {
  return getAgentsById(locale)[agentId];
}

export function detectMentionedAgentId(message: string, locale: AppLocale = DEFAULT_LOCALE): AgentId | undefined {
  const matches = message.matchAll(/@([^\s@]+)/g);
  const agents = getAgents(locale);

  for (const match of matches) {
    const raw = (match[1] ?? "").trim();
    const token = normalizeMentionToken(raw);
    const found = agents.find((agent) => agent.mentionAliases.includes(token));
    if (found) {
      return found.id;
    }
  }

  return undefined;
}

function normalizeMentionToken(value: string) {
  return value.toLowerCase().replace(/[.,!?;:(){}\[\]"']/g, "").trim();
}

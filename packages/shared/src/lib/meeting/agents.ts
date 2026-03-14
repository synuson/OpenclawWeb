import { DEFAULT_LOCALE, type AppLocale } from "@/lib/i18n/config";
import type { AgentAvatarPreset, AgentAvatarVariant, AgentId, AgentPersonaConfig, AgentPersonaOverrides } from "@/lib/meeting/types";
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
  avatarVariant: AgentAvatarVariant;
  avatarPreset: AgentAvatarPreset;
  toneStyle: string;
  mentionAliases: string[];
  systemPrompt: string;
  voiceId?: string;
};

type AgentCopyEntry = {
  name: string;
  title: string;
  mentionAliases: string[];
  toneStyle: string;
  avatarVariant: AgentAvatarVariant;
  avatarPreset: AgentAvatarPreset;
};

const AGENT_COPY: Record<
  AppLocale,
  Record<
    AgentId,
    AgentCopyEntry
  >
> = {
  ko: {
    assistant: {
      name: "서윤",
      title: "진행자",
      mentionAliases: ["assistant", "moderator", "mc", "seoyun", "서윤", "진행자"],
      toneStyle: "차분하고 또렷하게 결론을 먼저 말한 뒤, 필요한 맥락만 짧게 덧붙입니다.",
      avatarVariant: "aurora",
      avatarPreset: "core"
    },
    analyst: {
      name: "이안",
      title: "분석가",
      mentionAliases: ["analyst", "an", "ian", "이안", "분석가"],
      toneStyle: "숫자와 리스크를 먼저 짚고, 과장 없이 판단 근거를 선명하게 정리합니다.",
      avatarVariant: "sunset",
      avatarPreset: "orbit"
    }
  },
  en: {
    assistant: {
      name: "Seoyun",
      title: "Facilitator",
      mentionAliases: ["assistant", "moderator", "mc", "seoyun", "facilitator", "서윤", "진행자"],
      toneStyle: "Lead with the conclusion, keep the flow calm, and add only the context that helps the user act.",
      avatarVariant: "aurora",
      avatarPreset: "core"
    },
    analyst: {
      name: "Ian",
      title: "Analyst",
      mentionAliases: ["analyst", "an", "ian", "risk", "이안", "분석가"],
      toneStyle: "Prioritize numbers, risk, and verification. Keep the judgment direct and compact.",
      avatarVariant: "sunset",
      avatarPreset: "orbit"
    }
  }
};

export const DEFAULT_AGENT_ID: AgentId = "assistant";

function getDefaultAgentEntry(agentId: AgentId, locale: AppLocale) {
  return AGENT_COPY[locale][agentId];
}

function normalizeAvatarVariant(value: string | undefined, fallback: AgentAvatarVariant): AgentAvatarVariant {
  return value === "aurora" || value === "graphite" || value === "sunset" || value === "lagoon" ? value : fallback;
}

function normalizeAvatarPreset(value: string | undefined, fallback: AgentAvatarPreset): AgentAvatarPreset {
  return value === "core" || value === "orbit" || value === "signal" || value === "grid" ? value : fallback;
}

function sanitizeDisplayName(value: string | undefined, fallback: string) {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 24) : fallback;
}

function sanitizeToneStyle(value: string | undefined, fallback: string) {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 140) : fallback;
}

function buildPersonaPrompt(agentId: AgentId, locale: AppLocale, persona: AgentPersonaConfig) {
  return locale === "ko"
    ? [
        `현재 화면에서 너의 이름은 ${persona.displayName}이다.`,
        `${agentId === "assistant" ? "사용자와 대화 흐름을 정리하는 진행자" : "시장과 근거를 분석하는 분석가"} 역할은 유지하되, 말투는 다음 지시를 따른다.`,
        `말투: ${persona.toneStyle}`,
        "메인 채팅에서는 도구 이름이나 내부 시스템을 드러내지 말고, 필요한 조사를 마친 뒤 자연스럽게 답한다."
      ].join("\n")
    : [
        `In this interface your visible name is ${persona.displayName}.`,
        `Keep your core role as the ${agentId === "assistant" ? "facilitator" : "analyst"} while following this tone instruction.`,
        `Tone: ${persona.toneStyle}`,
        "Do not expose tool names or internal system details in the main chat. If research is needed, answer naturally after using it."
      ].join("\n");
}

function buildMentionAliases(defaults: string[], displayName: string) {
  return Array.from(
    new Set(
      [...defaults, displayName, displayName.replace(/\s+/g, "")]
        .map(normalizeMentionToken)
        .filter(Boolean)
    )
  );
}

function resolvePersonaConfig(
  agentId: AgentId,
  locale: AppLocale,
  overrides?: AgentPersonaOverrides
): AgentPersonaConfig {
  const defaults = getDefaultAgentEntry(agentId, locale);
  const custom = overrides?.[agentId];

  return {
    displayName: sanitizeDisplayName(custom?.displayName, defaults.name),
    toneStyle: sanitizeToneStyle(custom?.toneStyle, defaults.toneStyle),
    avatarVariant: normalizeAvatarVariant(custom?.avatarVariant, defaults.avatarVariant),
    avatarPreset: normalizeAvatarPreset(custom?.avatarPreset, defaults.avatarPreset)
  };
}

export function getDefaultAgentPersonas(locale: AppLocale = DEFAULT_LOCALE): Record<AgentId, AgentPersonaConfig> {
  return {
    assistant: resolvePersonaConfig("assistant", locale),
    analyst: resolvePersonaConfig("analyst", locale)
  };
}

export function getAgents(
  locale: AppLocale = DEFAULT_LOCALE,
  personaOverrides?: AgentPersonaOverrides
): Agent[] {
  const assistantRole = getRoleDefinitionForAgent("assistant", locale);
  const analystRole = getRoleDefinitionForAgent("analyst", locale);
  const agentCopy = AGENT_COPY[locale];
  const assistantPersona = resolvePersonaConfig("assistant", locale, personaOverrides);
  const analystPersona = resolvePersonaConfig("analyst", locale, personaOverrides);

  return [
    {
      id: "assistant",
      roleDefinitionId: ROLE_DEFINITION_ID_BY_AGENT_ID.assistant,
      name: assistantPersona.displayName,
      title: agentCopy.assistant.title,
      tagline: assistantRole.name,
      emoji: "SY",
      role: assistantRole.shortDescription,
      color: "emerald",
      avatarVariant: assistantPersona.avatarVariant,
      avatarPreset: assistantPersona.avatarPreset,
      toneStyle: assistantPersona.toneStyle,
      mentionAliases: buildMentionAliases(agentCopy.assistant.mentionAliases, assistantPersona.displayName),
      systemPrompt: `${buildRoleSystemPrompt("assistant", locale)}\n\n${buildPersonaPrompt("assistant", locale, assistantPersona)}`
    },
    {
      id: "analyst",
      roleDefinitionId: ROLE_DEFINITION_ID_BY_AGENT_ID.analyst,
      name: analystPersona.displayName,
      title: agentCopy.analyst.title,
      tagline: analystRole.name,
      emoji: "IA",
      role: analystRole.shortDescription,
      color: "amber",
      avatarVariant: analystPersona.avatarVariant,
      avatarPreset: analystPersona.avatarPreset,
      toneStyle: analystPersona.toneStyle,
      mentionAliases: buildMentionAliases(agentCopy.analyst.mentionAliases, analystPersona.displayName),
      systemPrompt: `${buildRoleSystemPrompt("analyst", locale)}\n\n${buildPersonaPrompt("analyst", locale, analystPersona)}`
    }
  ];
}

export function getAgentsById(locale: AppLocale = DEFAULT_LOCALE, personaOverrides?: AgentPersonaOverrides) {
  return Object.fromEntries(getAgents(locale, personaOverrides).map((agent) => [agent.id, agent])) as Record<AgentId, Agent>;
}

export function getAgent(agentId: AgentId, locale: AppLocale = DEFAULT_LOCALE, personaOverrides?: AgentPersonaOverrides) {
  return getAgentsById(locale, personaOverrides)[agentId];
}

export function detectMentionedAgentId(
  message: string,
  locale: AppLocale = DEFAULT_LOCALE,
  personaOverrides?: AgentPersonaOverrides
): AgentId | undefined {
  const matches = message.matchAll(/@([^\s@]+)/g);
  const agents = getAgents(locale, personaOverrides);

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

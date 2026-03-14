import { AGENTS_BY_ID } from "@/lib/meeting/agents";
import { getRoleDefinitionForAgent } from "@/lib/meeting/role-definitions";
import {
  callOpenClawMeetingChat,
  type OpenClawMeetingChatResult
} from "@/lib/openclaw/client";
import type { ChatHistoryItem, MeetingAction, Provider, RoundPhase } from "@/lib/meeting/types";

const ANALYST_SECTIONS = getRoleDefinitionForAgent("analyst").outputFormat.sections;
const FACILITATOR_SECTIONS = getRoleDefinitionForAgent("assistant").outputFormat.sections;
const BROWSER_INTENT_REGEX =
  /(browse|browser|openclaw|web|internet|search|look up|find|research|price target|filing|news|investigate|\ucc28\ud2b8|\ub274\uc2a4|\uac80\uc0c9|\ube0c\ub77c\uc6b0\uc800|\uc870\uc0ac)/i;
const URL_REGEX = /https?:\/\/[^\s)]+/i;
const DIRECT_PROVIDER_ORDER: Array<Exclude<Provider, "openclaw" | "mock">> = ["openai", "anthropic", "cerebras"];
const APP_SNAPSHOT_LABEL = "\uc571 \uc2a4\ub0c5\uc0f7";
const EMPTY_CONTENT_LINE = "- \ub0b4\uc6a9 \uc5c6\uc74c";

export type CallLLMArgs = {
  agentId: string;
  phase?: RoundPhase;
  agentSystemPrompt: string;
  message: string;
  history: ChatHistoryItem[];
  requiredSections?: string[];
};

export type CallLLMResult = {
  text: string;
  provider: Provider;
  model?: string;
  citations?: OpenClawMeetingChatResult["citations"];
};

function getForcedProvider(): Provider | undefined {
  const forced = (process.env.MEETING_LLM_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "openclaw" || forced === "openai" || forced === "anthropic" || forced === "cerebras" || forced === "mock") {
    return forced;
  }
  return undefined;
}

function hasProviderCredentials(provider: Exclude<Provider, "openclaw" | "mock">) {
  if (provider === "openai") {
    return Boolean(process.env.OPENAI_API_KEY);
  }
  if (provider === "anthropic") {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }
  return Boolean(process.env.CEREBRAS_API_KEY);
}

function dedupeProviders(providers: Provider[]) {
  return providers.filter((provider, index) => providers.indexOf(provider) === index);
}

function buildProviderChain(initialProvider: Provider): Provider[] {
  const forcedProvider = getForcedProvider();

  if (forcedProvider === "mock") {
    return ["mock"];
  }

  if (forcedProvider && forcedProvider !== "openclaw") {
    return dedupeProviders([forcedProvider, "mock"]);
  }

  if (forcedProvider === "openclaw" || initialProvider === "openclaw") {
    return dedupeProviders(["openclaw", ...DIRECT_PROVIDER_ORDER.filter(hasProviderCredentials), "mock"]);
  }

  return dedupeProviders([initialProvider, ...DIRECT_PROVIDER_ORDER.filter(hasProviderCredentials), "mock"]);
}

export function pickProvider(): Provider {
  const forcedProvider = getForcedProvider();
  if (forcedProvider) {
    return forcedProvider;
  }

  if (process.env.OPENCLAW_BASE_URL) {
    return "openclaw";
  }
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }
  if (process.env.CEREBRAS_API_KEY) {
    return "cerebras";
  }

  return "mock";
}

export function isoNow() {
  return new Date().toISOString();
}

export function asAssistantLine(item: ChatHistoryItem) {
  const agentName = item.agent ? AGENTS_BY_ID[item.agent]?.name : undefined;
  return agentName ? `${agentName}: ${item.content}` : item.content;
}

export async function getAgentContext(agentId: string) {
  const currentTime = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "full",
    timeStyle: "medium"
  }).format(new Date());

  return `Current time (Asia/Seoul): ${currentTime}\nResponding agent: ${AGENTS_BY_ID[agentId as keyof typeof AGENTS_BY_ID]?.name ?? agentId}`;
}

export function detectBrowserActions(message: string): MeetingAction[] {
  const trimmed = stripMentions(message).trim();
  const urlMatch = message.match(URL_REGEX);
  const url = urlMatch?.[0];
  const hasIntent = Boolean(url) || BROWSER_INTENT_REGEX.test(message);

  if (!hasIntent || !trimmed) {
    return [];
  }

  return [
    {
      type: "openclaw_task",
      instruction: trimmed,
      url
    }
  ];
}

export async function callLLM(provider: Provider, args: CallLLMArgs): Promise<CallLLMResult> {
  let lastError: Error | undefined;

  for (const candidate of buildProviderChain(provider)) {
    try {
      return await callProviderWithValidation(candidate, args);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown provider error");
      if (candidate === "mock") {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("No meeting provider could generate a response.");
}

function stripMentions(input: string) {
  return input.replace(/@([^\s@]+)/g, "").replace(/\s+/g, " ");
}

function formatSections(sections: Array<[string, string[]]>) {
  return sections
    .map(([title, lines]) => {
      const body = lines.length > 0 ? lines.join("\n") : EMPTY_CONTENT_LINE;
      return `## ${title}\n${body}`;
    })
    .join("\n\n");
}

function normalizeHeading(value: string) {
  return value
    .replace(/^#+\s*/, "")
    .replace(/^[-*]\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/:$/, "")
    .trim();
}

function hasRequiredSections(text: string, requiredSections?: string[]) {
  if (!requiredSections || requiredSections.length === 0) {
    return true;
  }

  const headings = new Set(
    text
      .split(/\r?\n/)
      .map((line) => normalizeHeading(line))
      .filter(Boolean)
  );

  return requiredSections.every((section) => headings.has(section));
}

function buildStructuredRetryMessage(message: string, requiredSections: string[]) {
  return [
    message,
    "",
    "Reply again using the exact section titles below in the same order.",
    ...requiredSections.map((section) => `- ${section}`),
    "",
    "Keep the response in Korean Markdown and do not rename the headings."
  ].join("\n");
}

async function callProviderWithValidation(provider: Provider, args: CallLLMArgs): Promise<CallLLMResult> {
  const initial = await callSingleProvider(provider, args);
  if (hasRequiredSections(initial.text, args.requiredSections)) {
    return initial;
  }

  if (!args.requiredSections || args.requiredSections.length === 0 || provider === "mock") {
    throw new Error(`${provider} response did not satisfy the required meeting sections.`);
  }

  const retry = await callSingleProvider(provider, {
    ...args,
    message: buildStructuredRetryMessage(args.message, args.requiredSections)
  });

  if (hasRequiredSections(retry.text, args.requiredSections)) {
    return retry;
  }

  throw new Error(`${provider} response is missing required meeting sections.`);
}

async function callSingleProvider(provider: Provider, args: CallLLMArgs): Promise<CallLLMResult> {
  if (provider === "mock") {
    return {
      provider,
      text: callMock(args)
    };
  }
  if (provider === "openclaw") {
    const result = await callOpenClawMeetingChat({
      agentId: args.agentId,
      phase: args.phase,
      systemPrompt: args.agentSystemPrompt,
      message: args.message,
      history: args.history,
      mode: "meeting"
    });

    return {
      provider,
      text: result.text,
      model: result.model,
      citations: result.citations
    };
  }
  if (provider === "cerebras") {
    return {
      provider,
      text: await callCerebras(args)
    };
  }
  if (provider === "anthropic") {
    return {
      provider,
      text: await callAnthropic(args)
    };
  }

  return {
    provider,
    text: await callOpenAI(args)
  };
}

function extractSourceLines(agentSystemPrompt: string) {
  const sources = [APP_SNAPSHOT_LABEL];
  for (const candidate of ["Upbit", "Twelve Data", "Kiwoom", "OpenClaw Demo Trading", "Kiwoom REST"]) {
    if (agentSystemPrompt.includes(candidate) && !sources.includes(candidate)) {
      sources.push(candidate);
    }
  }
  return sources.map((source) => `- ${source}`);
}

function buildAnalystMockReply(message: string, agentSystemPrompt: string) {
  const lowerMessage = message.toLowerCase();
  const focus =
    /btc|bitcoin|\ube44\ud2b8\ucf54\uc778/.test(lowerMessage)
      ? "\ube44\ud2b8\ucf54\uc778 \uc218\uae09\uacfc \ubcc0\ub3d9\uc131"
      : /kospi|kosdaq|samsung|005930|kr|\uad6d\ub0b4/.test(lowerMessage)
        ? "\uad6d\ub0b4 \uc99d\uc2dc \uc218\uae09\uacfc \ub300\ud615\uc8fc \ud750\ub984"
        : /nasdaq|s&p|qqq|aapl|nvda|us|\ubbf8\uad6d/.test(lowerMessage)
          ? "\ubbf8\uad6d \uc9c0\uc218\uc640 AI \ub300\ud615\uc8fc \uc21c\ud658"
          : "\uc2dc\uc7a5 \uc804\ubc18\uacfc \ud3ec\uc9c0\uc158 \ub9ac\uc2a4\ud06c";

  return formatSections([
    [ANALYST_SECTIONS[0], [`- \ud604\uc7ac \ud575\uc2ec \ud655\uc778 \ub300\uc0c1\uc740 ${focus}\uc785\ub2c8\ub2e4.`, `- \uc9c1\uc804 \ud750\ub984\uc740 \uc720\uc9c0\ub418\uace0 \uc788\uc9c0\ub9cc \ucd94\uaca9 \uc9c4\uc785 \uc5ec\ubd80\ub294 \uac70\ub798\ub300\uae08\uacfc \uc9c0\uc9c0 \uad6c\uac04\uc744 \ud568\uaed8 \ubd10\uc57c \ud569\ub2c8\ub2e4.`]],
    [ANALYST_SECTIONS[1], [`- \ub9ac\uc2a4\ud06c: \ub2e8\uae30 \uacfc\uc5f4 \ud6c4 \ubcc0\ub3d9\uc131 \ud655\ub300 | \uc601\ud5a5\ub3c4: high | \ubc1c\uc0dd\ud655\ub960: medium | \uadfc\uac70: \uac00\uaca9 \ubc18\uc751\uc774 \ube60\ub974\uace0 \ucd94\uaca9 \ub9e4\uc218 \uc720\uc785 \uac00\ub2a5\uc131\uc774 \ud07d\ub2c8\ub2e4. | \ub300\uc751: \ucd94\uaca9 \ube44\uc911\uc744 \uc904\uc774\uace0 \uc190\uc808 \uae30\uc900\uc744 \uba3c\uc800 \uc815\ud569\ub2c8\ub2e4.`]],
    [ANALYST_SECTIONS[2], extractSourceLines(agentSystemPrompt)],
    [ANALYST_SECTIONS[3], ["- \ubca0\uc774\uc2a4: \ud604\uc7ac \ucd94\uc138\ub294 \uc720\uc9c0\ub418\uc9c0\ub9cc \ud655\uc778 \uc804\uae4c\uc9c0\ub294 \ubcf4\uc218\uc801\uc73c\ub85c \uc811\uadfc\ud569\ub2c8\ub2e4.", "- \ube44\uad00: \uc9c0\uc9c0\uc120 \uc774\ud0c8\uacfc \ub274\uc2a4 \uc545\ud654\uac00 \uacb9\uce58\uba74 \ub2e8\uae30 \ubc29\uc5b4 \uc804\ud658\uc774 \ud544\uc694\ud569\ub2c8\ub2e4."]],
    [ANALYST_SECTIONS[4], ["- \uc2e0\uaddc \uc9c4\uc785\uc740 \ubd84\ud560 \uae30\uc900\uc73c\ub85c \uc2dc\uc791\ud558\uace0, \ub2e4\uc74c \ud655\uc778 \uc2dc\uc810\uae4c\uc9c0 \uc190\uc2e4 \ud55c\ub3c4\ub97c \uba3c\uc800 \uc815\ud558\ub294 \uc811\uadfc\uc774 \uc801\uc808\ud569\ub2c8\ub2e4."]]
  ]);
}

function buildFacilitatorMockReply(message: string, agentSystemPrompt: string) {
  const lowerMessage = message.toLowerCase();
  const hasOrderIntent = /(buy|sell|order|\ub9e4\uc218|\ub9e4\ub3c4|\uc8fc\ubb38)/.test(lowerMessage);
  const hasResearchIntent = BROWSER_INTENT_REGEX.test(lowerMessage);
  const actionTask = hasOrderIntent
    ? "\ubaa8\uc758\ud22c\uc790 \ud654\uba74\uc5d0\uc11c \uc8fc\ubb38 \uac00\uc815\uacfc \ub9ac\uc2a4\ud06c \ud55c\ub3c4\ub97c \uac80\uc99d\ud55c\ub2e4"
    : hasResearchIntent
      ? "OpenClaw \uc870\uc0ac \ubc94\uc704\ub97c \ud655\uc815\ud558\uace0 \ud544\uc694\ud55c URL\uc744 \uc815\ub9ac\ud55c\ub2e4"
      : "\ub2e4\uc74c \ud655\uc778 \uc2dc\uc810\uacfc \ud310\ub2e8 \uae30\uc900\uc744 \ud655\uc815\ud55c\ub2e4";
  const actionOwner = hasOrderIntent ? "\uc774\uc548" : "\uc11c\uc724";
  const sourceLine = agentSystemPrompt.includes("OpenClaw")
    ? "- \ucd94\uac00 \uc870\uc0ac\uac00 \ud544\uc694\ud558\uba74 OpenClaw \uacb0\uacfc\ub97c \uadfc\uac70\uc5d0 \ud569\uce69\ub2c8\ub2e4."
    : "- \ud604\uc7ac \uc2a4\ub0c5\uc0f7 \uae30\uc900\uc73c\ub85c\ub3c4 \uacb0\ub860\uc744 \ub0bc \uc218 \uc788\uc2b5\ub2c8\ub2e4.";

  return formatSections([
    [FACILITATOR_SECTIONS[0], ["- \ud604\uc7ac \uc815\ubcf4\ub9cc\uc73c\ub85c\ub3c4 \ub2e4\uc74c \uc561\uc158\uc740 \uc815\ud560 \uc218 \uc788\uc9c0\ub9cc, \uc2e4\ud589 \uc804 \ub9c8\uc9c0\ub9c9 \ud655\uc778 \ud56d\ubaa9\uc740 \ub0a8\uaca8\ub450\ub294 \uac83\uc774 \uc548\uc804\ud569\ub2c8\ub2e4."]],
    [FACILITATOR_SECTIONS[1], ["- \ubd84\uc11d\uac00 \uad00\uc810\uc5d0\uc11c\ub294 \ucd94\uc138\ub294 \uc720\ud6a8\ud558\uc9c0\ub9cc \ub9ac\uc2a4\ud06c \uad00\ub9ac\uac00 \ubc18\ub4dc\uc2dc \uc120\ud589\ub418\uc5b4\uc57c \ud569\ub2c8\ub2e4.", sourceLine]],
    [FACILITATOR_SECTIONS[2], [`- \uc791\uc5c5: ${actionTask} | \ub2f4\ub2f9: ${actionOwner} | \uae30\ud55c: TBD | \uc0c1\ud0dc: todo`]],
    [FACILITATOR_SECTIONS[3], ["- \ud575\uc2ec \uc9c0\uc9c0 \uad6c\uac04\uacfc \ub274\uc2a4 \uc774\ubca4\ud2b8\ub97c \uc5b4\ub290 \ubc94\uc704\uae4c\uc9c0 \ucd94\uac00 \uac80\uc99d\ud560\uc9c0 \uc544\uc9c1 \ud655\uc815\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4."]],
    [FACILITATOR_SECTIONS[4], ["- \uc774\ubc88 \ub77c\uc6b4\ub4dc\ub294 \ucd94\uc138\uc640 \ub9ac\uc2a4\ud06c\ub97c \ud655\uc778\ud588\uace0, \uc2e4\ud589 \uc804 \uac80\uc99d \ud56d\ubaa9\uc744 \ub0a8\uae30\ub294 \ucabd\uc73c\ub85c \uc815\ub9ac\ud588\uc2b5\ub2c8\ub2e4."]]
  ]);
}

function callMock(args: CallLLMArgs) {
  const isAnalyst = args.agentSystemPrompt.includes("[ROLE:analyst]");
  return isAnalyst
    ? buildAnalystMockReply(args.message, args.agentSystemPrompt)
    : buildFacilitatorMockReply(args.message, args.agentSystemPrompt);
}

async function callCerebras(args: CallLLMArgs) {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    throw new Error("CEREBRAS_API_KEY is not set.");
  }

  const model = process.env.CEREBRAS_MODEL || "qwen-3-235b-a22b-instruct-2507";
  const messages = [
    { role: "system", content: args.agentSystemPrompt },
    ...args.history.map((item) =>
      item.role === "user"
        ? { role: "user", content: item.content }
        : { role: "assistant", content: asAssistantLine(item) }
    ),
    { role: "user", content: args.message }
  ];

  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: 700,
      temperature: 0.4
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Cerebras error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content?.trim() || "(empty response)";
}

async function callAnthropic(args: CallLLMArgs) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
  const messages = [
    ...args.history.map((item) =>
      item.role === "user"
        ? { role: "user", content: item.content }
        : { role: "assistant", content: asAssistantLine(item) }
    ),
    { role: "user", content: args.message }
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system: args.agentSystemPrompt,
      messages
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Anthropic error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const text = (data.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");

  return text.trim() || "(empty response)";
}

function extractOpenAIOutputText(data: unknown) {
  const record = data as {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };

  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text.trim();
  }

  for (const item of record.output ?? []) {
    if (item.type === "message" && Array.isArray(item.content)) {
      const text = item.content
        .filter((chunk) => chunk.type === "output_text" && typeof chunk.text === "string")
        .map((chunk) => chunk.text)
        .join("");
      if (text.trim()) {
        return text.trim();
      }
    }
  }

  return "";
}

async function callOpenAI(args: CallLLMArgs) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const input = [
    { role: "system", content: args.agentSystemPrompt },
    ...args.history.map((item) =>
      item.role === "user"
        ? { role: "user", content: item.content }
        : { role: "assistant", content: asAssistantLine(item) }
    ),
    { role: "user", content: args.message }
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input,
      temperature: 0.4,
      max_output_tokens: 700
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return extractOpenAIOutputText(data) || "(empty response)";
}

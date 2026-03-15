import { DEFAULT_LOCALE, getIntlLocale, type AppLocale } from "@/lib/i18n/config";
import { getAgentsById } from "@/lib/meeting/agents";
import { getActionItemFieldLabels, getRoleDefinitionForAgent } from "@/lib/meeting/role-definitions";
import {
  callOpenClawMeetingChat,
  streamOpenClawMeetingChat,
  type OpenClawMeetingChatResult
} from "@/lib/openclaw/client";
import type { AgentId, ChatHistoryItem, MeetingAction, Provider, RoundPhase } from "@/lib/meeting/types";

const BROWSER_INTENT_REGEX = /(browse|browser|openclaw|web|internet|search|look up|find|research|latest|source|verify|price target|filing|news|investigate|chart|뉴스|검색|브라우저|웹|인터넷|조사|최신|출처|검증|기사|차트)/i;
const URL_REGEX = /https?:\/\/[^\s)]+/i;
const DIRECT_PROVIDER_ORDER: Array<Exclude<Provider, "openclaw" | "mock">> = ["openai", "anthropic", "cerebras"];

export type CallLLMArgs = {
  agentId: AgentId;
  phase?: RoundPhase;
  agentSystemPrompt: string;
  message: string;
  history: ChatHistoryItem[];
  locale?: AppLocale;
  requiredSections?: string[];
  maxTokens?: number;
  onPartialText?: (text: string) => void | Promise<void>;
};

export type CallLLMResult = {
  text: string;
  provider: Provider;
  model?: string;
  citations?: OpenClawMeetingChatResult["citations"];
  elapsedMs?: number;
  resolvedPath?: string;
  streamed?: boolean;
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

export function asAssistantLine(item: ChatHistoryItem, locale: AppLocale = DEFAULT_LOCALE) {
  const agentsById = getAgentsById(locale);
  const agentName = item.agent ? agentsById[item.agent]?.name : undefined;
  return agentName ? `${agentName}: ${item.content}` : item.content;
}

export async function getAgentContext(agentId: AgentId, locale: AppLocale = DEFAULT_LOCALE) {
  const currentTime = new Intl.DateTimeFormat(getIntlLocale(locale), {
    timeZone: "Asia/Seoul",
    dateStyle: "full",
    timeStyle: "medium"
  }).format(new Date());
  const agentsById = getAgentsById(locale);
  const agentName = agentsById[agentId]?.name ?? agentId;

  return locale === "ko"
    ? `현재 시각(Asia/Seoul): ${currentTime}\n응답 에이전트: ${agentName}`
    : `Current time (Asia/Seoul): ${currentTime}\nResponding agent: ${agentName}`;
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

function formatSections(sections: Array<[string, string[]]>, locale: AppLocale) {
  const emptyLine = locale === "ko" ? "- 내용 없음" : "- No content";
  return sections
    .map(([title, lines]) => {
      const body = lines.length > 0 ? lines.join("\n") : emptyLine;
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

  return requiredSections.every((section) => headings.has(normalizeHeading(section)));
}

function buildStructuredRetryMessage(message: string, requiredSections: string[], locale: AppLocale) {
  return locale === "ko"
    ? [
        message,
        "",
        "아래 섹션 제목을 정확히 같은 순서로 다시 사용해서 답하세요.",
        ...requiredSections.map((section) => `- ${section}`),
        "",
        "한국어 Markdown 형식을 유지하고 제목 이름을 바꾸지 마세요."
      ].join("\n")
    : [
        message,
        "",
        "Reply again using the exact section titles below in the same order.",
        ...requiredSections.map((section) => `- ${section}`),
        "",
        "Keep the response in English Markdown and do not rename the headings."
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

  // OpenClaw replies are usually good enough for the UI even if one heading is omitted.
  // Skipping the second validation call reduces round-trip latency.
  if (provider === "openclaw") {
    return initial;
  }

  const locale = args.locale ?? DEFAULT_LOCALE;
  const retry = await callSingleProvider(provider, {
    ...args,
    onPartialText: undefined,
    message: buildStructuredRetryMessage(args.message, args.requiredSections, locale)
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
    const result = args.onPartialText
      ? await streamOpenClawMeetingChat(
          {
            agentId: args.agentId,
            phase: args.phase,
            systemPrompt: args.agentSystemPrompt,
            message: args.message,
            history: args.history,
            locale: args.locale,
            mode: "meeting",
            maxTokens: args.maxTokens
          },
          {
            onPartialText: args.onPartialText
          }
        )
      : await callOpenClawMeetingChat({
          agentId: args.agentId,
          phase: args.phase,
          systemPrompt: args.agentSystemPrompt,
          message: args.message,
          history: args.history,
          locale: args.locale,
          mode: "meeting",
          maxTokens: args.maxTokens
        });

    return {
      provider,
      text: result.text,
      model: result.model,
      citations: result.citations,
      elapsedMs: result.elapsedMs,
      resolvedPath: result.resolvedPath,
      streamed: result.streamed
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
function getAnalystSections(locale: AppLocale) {
  return getRoleDefinitionForAgent("analyst", locale).outputFormat.sections;
}

function getFacilitatorSections(locale: AppLocale) {
  return getRoleDefinitionForAgent("assistant", locale).outputFormat.sections;
}

function getAppSnapshotLabel(locale: AppLocale) {
  return locale === "ko" ? "앱 스냅샷" : "App snapshot";
}

function extractSourceLines(agentSystemPrompt: string, locale: AppLocale) {
  const sources = [getAppSnapshotLabel(locale)];
  for (const candidate of ["Upbit", "Twelve Data", "Kiwoom", "OpenClaw Demo Trading", "Kiwoom REST"]) {
    if (agentSystemPrompt.includes(candidate) && !sources.includes(candidate)) {
      sources.push(candidate);
    }
  }
  return sources.map((source) => `- ${source}`);
}

function buildAnalystMockReply(message: string, agentSystemPrompt: string, locale: AppLocale) {
  const [metricsSection, risksSection, sourcesSection, scenariosSection, recommendationSection] = getAnalystSections(locale);
  const lowerMessage = message.toLowerCase();
  const focus =
    /btc|bitcoin|비트코인/.test(lowerMessage)
      ? locale === "ko"
        ? "비트코인 수급과 변동성"
        : "Bitcoin flow and volatility"
      : /kospi|kosdaq|samsung|005930|kr|국내/.test(lowerMessage)
        ? locale === "ko"
          ? "국내 증시 수급과 대형주 흐름"
          : "Korean equity flow and large-cap leadership"
        : /nasdaq|s&p|qqq|aapl|nvda|us|미국/.test(lowerMessage)
          ? locale === "ko"
            ? "미국 지수와 AI 대형주 순환"
            : "US index momentum and AI large-cap rotation"
          : locale === "ko"
            ? "자산군 전반의 리스크와 포지셔닝"
            : "Cross-asset risk and positioning";

  return formatSections(
    [
      [
        metricsSection,
        locale === "ko"
          ? [
              `- 현재 핵심 포인트: ${focus}`,
              "- 스냅샷 기준으로 추세는 유지되지만 단기 과열 여부를 재확인할 필요가 있습니다.",
              "- 의사결정 임계값은 직전 고점과 저점 이탈 여부, 거래대금 유지 여부입니다."
            ]
          : [
              `- Current focus: ${focus}`,
              "- The snapshot still supports the trend, but short-term overheating needs a recheck.",
              "- The decision threshold is whether price breaks the last swing levels and whether turnover holds up."
            ]
      ],
      [
        risksSection,
        locale === "ko"
          ? [
              "- 리스크: 변동성 재확대 | 영향도: high | 발생확률: medium | 근거: 단기 가격 반응이 빠르고 추격 매수 유입 가능성이 큼 | 대응: 포지션 크기 축소 후 재확인",
              "- 리스크: 뉴스 공백 구간 오판 | 영향도: medium | 발생확률: medium | 근거: 가격 신호만으로 판단 시 해석 오류 가능 | 대응: 뉴스와 수급을 함께 확인"
            ]
          : [
              "- Risk: volatility expansion | Impact: high | Probability: medium | Evidence: short-term price reactions are fast and chase flows can build quickly | Mitigation: cut size and re-validate",
              "- Risk: misreading a news vacuum | Impact: medium | Probability: medium | Evidence: price-only interpretation can be misleading | Mitigation: validate with news and flow together"
            ]
      ],
      [sourcesSection, extractSourceLines(agentSystemPrompt, locale)],
      [
        scenariosSection,
        locale === "ko"
          ? [
              "- 베이스: 현재 추세 유지, 다만 눌림 확인 전까지 추격은 제한",
              "- 낙관: 거래대금과 모멘텀이 동반 유지되면 추가 상승 여지 확대",
              "- 비관: 지지선 이탈과 뉴스 악화가 겹치면 단기 방어 전환 필요"
            ]
          : [
              "- Base: the current trend holds, but chasing stays limited until a pullback confirms",
              "- Bull: upside expands if turnover and momentum stay aligned",
              "- Bear: if support breaks while news deteriorates, shift to defense quickly"
            ]
      ],
      [
        recommendationSection,
        locale === "ko"
          ? ["- 신규 판단은 소규모로 시작하고, 다음 확인 시점까지 리스크 한도를 먼저 정하세요."]
          : ["- Start any new exposure small and define the risk limit before the next checkpoint."]
      ]
    ],
    locale
  );
}

function buildFacilitatorMockReply(message: string, agentSystemPrompt: string, locale: AppLocale) {
  const [conclusionSection, evidenceSection, actionsSection, unresolvedSection, minutesSection] = getFacilitatorSections(locale);
  const labels = getActionItemFieldLabels(locale);
  const agentsById = getAgentsById(locale);
  const lowerMessage = message.toLowerCase();
  const hasOrderIntent = /(buy|sell|order|매수|매도|주문)/.test(lowerMessage);
  const hasResearchIntent = BROWSER_INTENT_REGEX.test(lowerMessage);
  const actionTask = hasOrderIntent
    ? locale === "ko"
      ? "모의투자 패널에서 주문 가정을 검증한다"
      : "Validate the order thesis in the paper-trading panel"
    : hasResearchIntent
      ? locale === "ko"
        ? "OpenClaw 후속 조사 범위를 확정한다"
        : "Define the scope for the OpenClaw follow-up"
      : locale === "ko"
        ? "다음 확인 시점과 판단 기준을 확정한다"
        : "Lock the next checkpoint and decision criteria";
  const actionOwner = hasOrderIntent ? agentsById.analyst.name : agentsById.assistant.name;
  const sourceLine = agentSystemPrompt.includes("OpenClaw")
    ? locale === "ko"
      ? "- 추가 조사가 필요하면 OpenClaw 결과를 근거에 합칩니다."
      : "- If more research is needed, fold the OpenClaw findings into the evidence."
    : locale === "ko"
      ? "- 현재 스냅샷만으로도 결론을 낼 수 있습니다."
      : "- The current snapshot is enough to reach a working conclusion.";

  return formatSections(
    [
      [
        conclusionSection,
        locale === "ko"
          ? ["- 현재 정보만으로도 다음 액션을 정할 수 있지만, 실행 전 마지막 확인 절차는 유지해야 합니다."]
          : ["- The current information is enough to define the next action, but the final pre-execution check still needs to stay in place."]
      ],
      [
        evidenceSection,
        locale === "ko"
          ? [
              "- 분석가 관점에서는 추세 활용 여지는 있으나 리스크 관리가 선행되어야 합니다.",
              sourceLine
            ]
          : [
              "- From the analyst view, the trend is usable, but risk management has to come first.",
              sourceLine
            ]
      ],
      [
        actionsSection,
        [
          `- ${labels.task}: ${actionTask} | ${labels.owner}: ${actionOwner} | ${labels.dueAt}: ${labels.tbd} | ${labels.status}: todo`
        ]
      ],
      [
        unresolvedSection,
        locale === "ko"
          ? ["- 외부 뉴스와 실시간 호가를 어디까지 추가 검증할지 아직 확정되지 않았습니다."]
          : ["- The scope of additional validation for external news and live quotes is still open."]
      ],
      [
        minutesSection,
        locale === "ko"
          ? ["- 이번 라운드는 추세 활용 가능성을 확인했고, 실행 전 검증 절차를 남기는 것으로 정리합니다."]
          : ["- This round confirmed that the trend may be tradable, while preserving a final validation step before execution."]
      ]
    ],
    locale
  );
}

function callMock(args: CallLLMArgs) {
  const locale = args.locale ?? DEFAULT_LOCALE;
  const lowerMessage = args.message.toLowerCase();
  const focus =
    /btc|bitcoin|비트코인/.test(lowerMessage)
      ? locale === "ko"
        ? "비트코인 흐름과 변동성"
        : "Bitcoin flow and volatility"
      : /kospi|kosdaq|samsung|005930|kr|국내/.test(lowerMessage)
        ? locale === "ko"
          ? "국내 증시 수급과 대형주 흐름"
          : "Korean equity flow and large-cap leadership"
        : /nasdaq|s&p|qqq|aapl|nvda|us|미국/.test(lowerMessage)
          ? locale === "ko"
            ? "미국 지수와 AI 대형주 순환"
            : "US index momentum and AI large-cap rotation"
          : locale === "ko"
            ? "시장 전반의 리스크와 포지션"
            : "Cross-asset risk and positioning";

  if (args.agentId === "analyst") {
    const [metricsSection, risksSection, sourcesSection, scenariosSection, recommendationSection] = getAnalystSections(locale);

    return formatSections(
      [
        [
          metricsSection,
          locale === "ko"
            ? [
                `- 현재 핵심 관찰 포인트: ${focus}`,
                "- 시장 스냅샷 기준으로 추세는 유지되지만 단기 과열 여부를 다시 확인할 필요가 있습니다.",
                "- 의사결정 임계값은 직전 고점 돌파 여부와 거래대금 유지 여부입니다."
              ]
            : [
                `- Current focus: ${focus}`,
                "- The snapshot still supports the trend, but short-term overheating needs a recheck.",
                "- The decision threshold is whether price breaks the last swing levels and whether turnover holds up."
              ]
        ],
        [
          risksSection,
          locale === "ko"
            ? [
                "- 리스크: 변동성 확대 | 영향도: high | 발생확률: medium | 근거: 단기 가격 반응이 빠르고 추격 매수가 붙을 수 있습니다. | 대응: 신규 비중을 줄이고 재확인합니다.",
                "- 리스크: 뉴스 공백 해석 오류 | 영향도: medium | 발생확률: medium | 근거: 가격만으로 판단하면 오해할 수 있습니다. | 대응: 뉴스와 수급을 함께 점검합니다."
              ]
            : [
                "- Risk: volatility expansion | Impact: high | Probability: medium | Evidence: short-term price reactions are fast and chase flows can build quickly | Mitigation: cut size and re-validate",
                "- Risk: misreading a news vacuum | Impact: medium | Probability: medium | Evidence: price-only interpretation can be misleading | Mitigation: validate with news and flow together"
              ]
        ],
        [sourcesSection, extractSourceLines(args.agentSystemPrompt, locale)],
        [
          scenariosSection,
          locale === "ko"
            ? [
                "- 베이스: 현재 추세 유지, 다만 눌림 확인 전까지는 추격 매수 제한",
                "- 낙관: 거래대금과 모멘텀이 동반되면 추가 상승 여지 확대",
                "- 비관: 지지선 이탈과 뉴스 약화가 겹치면 단기 방어 전환 필요"
              ]
            : [
                "- Base: the current trend holds, but chasing stays limited until a pullback confirms",
                "- Bull: upside expands if turnover and momentum stay aligned",
                "- Bear: if support breaks while news deteriorates, shift to defense quickly"
              ]
        ],
        [
          recommendationSection,
          locale === "ko"
            ? ["- 신규 판단은 작은 비중으로 시작하고, 다음 확인 시점까지의 리스크 한도를 먼저 정하세요."]
            : ["- Start any new exposure small and define the risk limit before the next checkpoint."]
        ]
      ],
      locale
    );
  }

  const [conclusionSection, evidenceSection, actionsSection, unresolvedSection, minutesSection] = getFacilitatorSections(locale);
  const labels = getActionItemFieldLabels(locale);
  const actionTask = BROWSER_INTENT_REGEX.test(lowerMessage)
    ? locale === "ko"
      ? "OpenClaw 후속 조사 범위를 확정한다"
      : "Define the scope for the OpenClaw follow-up"
    : locale === "ko"
      ? "다음 확인 시점과 판단 기준을 확정한다"
      : "Lock the next checkpoint and decision criteria";

  return formatSections(
    [
      [
        conclusionSection,
        locale === "ko"
          ? ["- 현재 정보만으로도 다음 액션을 정할 수 있지만, 실행 전 마지막 검증 절차는 유지해야 합니다."]
          : ["- The current information is enough to define the next action, but the final pre-execution check still needs to stay in place."]
      ],
      [
        evidenceSection,
        locale === "ko"
          ? [
              "- 분석가 관점에서는 추세 활용 가능성이 있으나, 리스크 관리가 먼저입니다.",
              "- 현재 스냅샷을 근거로 작업 결론을 정리했습니다."
            ]
          : [
              "- From the analyst view, the trend is usable, but risk management has to come first.",
              "- The current snapshot is enough to support the working conclusion."
            ]
      ],
      [[actionsSection][0], [`- ${labels.task}: ${actionTask} | ${labels.owner}: ${locale === "ko" ? "서윤" : "Seoyun"} | ${labels.dueAt}: ${labels.tbd} | ${labels.status}: todo`]],
      [
        unresolvedSection,
        locale === "ko"
          ? ["- 외부 뉴스와 실시간 호가를 어디까지 추가 검증할지는 아직 열려 있습니다."]
          : ["- The scope of additional validation for external news and live quotes is still open."]
      ],
      [
        minutesSection,
        locale === "ko"
          ? ["- 이번 라운드는 추세 활용 가능성을 확인했고, 실행 전 검증 단계를 유지하는 것으로 정리합니다."]
          : ["- This round confirmed that the trend may be tradable, while preserving a final validation step before execution."]
      ]
    ],
    locale
  );
}

async function callCerebras(args: CallLLMArgs) {
  const locale = args.locale ?? DEFAULT_LOCALE;
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
        : { role: "assistant", content: asAssistantLine(item, locale) }
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
  const locale = args.locale ?? DEFAULT_LOCALE;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
  const messages = [
    ...args.history.map((item) =>
      item.role === "user"
        ? { role: "user", content: item.content }
        : { role: "assistant", content: asAssistantLine(item, locale) }
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
  const locale = args.locale ?? DEFAULT_LOCALE;
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
        : { role: "assistant", content: asAssistantLine(item, locale) }
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

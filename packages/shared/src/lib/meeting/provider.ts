import { DEFAULT_LOCALE, getIntlLocale, type AppLocale } from "@/lib/i18n/config";
import { getAgentsById } from "@/lib/meeting/agents";
import {
  getActionItemFieldLabels,
  ROLE_SECTION_LABELS
} from "@/lib/meeting/role-definitions";
import type { ChatHistoryItem, MeetingAction, Provider } from "@/lib/meeting/types";

export function pickProvider(): Provider {
  const forced = (process.env.MEETING_LLM_PROVIDER ?? "").toLowerCase();
  if (forced === "cerebras" || forced === "anthropic" || forced === "openai" || forced === "mock") {
    return forced;
  }

  if (process.env.CEREBRAS_API_KEY) {
    return "cerebras";
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }
  if (process.env.OPENAI_API_KEY) {
    return "openai";
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

export async function getAgentContext(agentId: string, locale: AppLocale = DEFAULT_LOCALE) {
  const currentTime = new Intl.DateTimeFormat(getIntlLocale(locale), {
    timeZone: "Asia/Seoul",
    dateStyle: "full",
    timeStyle: "medium"
  }).format(new Date());
  const agentsById = getAgentsById(locale);
  const agentName = agentsById[agentId as keyof typeof agentsById]?.name ?? agentId;

  return locale === "ko"
    ? `현재 시각(Asia/Seoul): ${currentTime}\n응답 에이전트: ${agentName}`
    : `Current time (Asia/Seoul): ${currentTime}\nResponding agent: ${agentName}`;
}

export function detectBrowserActions(message: string): MeetingAction[] {
  const trimmed = stripMentions(message).trim();
  const urlMatch = message.match(/https?:\/\/[^\s)]+/i);
  const url = urlMatch?.[0];
  const hasIntent =
    Boolean(url) ||
    /(browse|browser|openclaw|web|internet|search|look up|find|research|price target|filing|news|investigate|chart|뉴스|검색|웹|브라우저|조사)/i.test(
      message
    );

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

export async function callLLM(
  provider: Provider,
  args: {
    agentSystemPrompt: string;
    message: string;
    history: ChatHistoryItem[];
    locale?: AppLocale;
  }
): Promise<string> {
  if (provider === "mock") {
    return callMock(args);
  }
  if (provider === "cerebras") {
    return callCerebras(args);
  }
  if (provider === "anthropic") {
    return callAnthropic(args);
  }
  return callOpenAI(args);
}

function stripMentions(input: string) {
  return input.replace(/@([^\s@]+)/g, "").replace(/\s+/g, " ");
}

function formatSections(sections: Array<[string, string[]]>, locale: AppLocale) {
  return sections
    .map(([title, lines]) => {
      const body = lines.length > 0 ? lines.join("\n") : locale === "ko" ? "- 내용 없음" : "- No content";
      return `## ${title}\n${body}`;
    })
    .join("\n\n");
}

function extractSourceLines(agentSystemPrompt: string, locale: AppLocale) {
  const sources = [locale === "ko" ? "앱 스냅샷" : "App snapshot"];
  for (const candidate of ["Upbit", "Twelve Data", "Kiwoom", "OpenClaw Demo Trading", "Kiwoom REST"]) {
    if (agentSystemPrompt.includes(candidate) && !sources.includes(candidate)) {
      sources.push(candidate);
    }
  }
  return sources.map((source) => `- ${source}`);
}

function buildAnalystMockReply(message: string, agentSystemPrompt: string, locale: AppLocale) {
  const lowerMessage = message.toLowerCase();
  const sections = ROLE_SECTION_LABELS[locale].analyst;
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
        sections.metrics,
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
        sections.risks,
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
      [sections.sources, extractSourceLines(agentSystemPrompt, locale)],
      [
        sections.scenarios,
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
        sections.recommendation,
        locale === "ko"
          ? ["- 신규 판단은 소규모로 시작하고, 다음 확인 시점까지 리스크 한도를 먼저 정하세요."]
          : ["- Start any new exposure small and define the risk limit before the next checkpoint."]
      ]
    ],
    locale
  );
}

function buildFacilitatorMockReply(message: string, agentSystemPrompt: string, locale: AppLocale) {
  const lowerMessage = message.toLowerCase();
  const sections = ROLE_SECTION_LABELS[locale].assistant;
  const labels = getActionItemFieldLabels(locale);
  const agentsById = getAgentsById(locale);
  const hasOrderIntent = /(buy|sell|order|매수|매도|주문)/.test(lowerMessage);
  const hasResearchIntent = /(browse|browser|openclaw|web|research|뉴스|검색|조사)/.test(lowerMessage);
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

  return formatSections(
    [
      [
        sections.conclusion,
        locale === "ko"
          ? [
              "- 현재 정보만으로도 다음 액션을 정할 수 있지만, 실행 전 마지막 확인 절차는 유지해야 합니다."
            ]
          : [
              "- The current information is enough to define the next action, but the final pre-execution check still needs to stay in place."
            ]
      ],
      [
        sections.evidence,
        locale === "ko"
          ? [
              "- 분석가 관점에서는 추세 활용 여지는 있으나 리스크 관리가 선행되어야 합니다.",
              "- 출처는 앱 스냅샷 기준으로 충분하며, 필요 시 추가 웹 조사를 붙이면 됩니다."
            ]
          : [
              "- From the analyst view, the trend is usable, but risk management has to come first.",
              "- The current app snapshot is sufficient as a base source, and extra web research can be added if needed."
            ]
      ],
      [
        sections.actions,
        [
          `- ${labels.task}: ${actionTask} | ${labels.owner}: ${actionOwner} | ${labels.dueAt}: ${labels.tbd} | ${labels.status}: todo`
        ]
      ],
      [
        sections.unresolved,
        locale === "ko"
          ? ["- 외부 뉴스와 실시간 호가를 어디까지 추가 검증할지 아직 확정되지 않았습니다."]
          : ["- The scope of additional validation for external news and live quotes is still open."]
      ],
      [
        sections.minutes,
        locale === "ko"
          ? ["- 이번 라운드는 추세 활용 가능성을 확인했고, 실행 전 검증 절차를 남기는 것으로 정리합니다."]
          : ["- This round confirmed that the trend may be tradable, while preserving a final validation step before execution."]
      ]
    ],
    locale
  );
}

function callMock(args: {
  agentSystemPrompt: string;
  message: string;
  history: ChatHistoryItem[];
  locale?: AppLocale;
}) {
  const locale = args.locale ?? DEFAULT_LOCALE;
  const isAnalyst = args.agentSystemPrompt.includes("[ROLE:analyst]");
  return isAnalyst
    ? buildAnalystMockReply(args.message, args.agentSystemPrompt, locale)
    : buildFacilitatorMockReply(args.message, args.agentSystemPrompt, locale);
}

async function callCerebras(args: {
  agentSystemPrompt: string;
  message: string;
  history: ChatHistoryItem[];
  locale?: AppLocale;
}) {
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

async function callAnthropic(args: {
  agentSystemPrompt: string;
  message: string;
  history: ChatHistoryItem[];
  locale?: AppLocale;
}) {
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

async function callOpenAI(args: {
  agentSystemPrompt: string;
  message: string;
  history: ChatHistoryItem[];
  locale?: AppLocale;
}) {
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

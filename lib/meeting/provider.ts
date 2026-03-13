import { AGENTS_BY_ID } from "@/lib/meeting/agents";
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

  return `현재 시각(Asia/Seoul): ${currentTime}\n응답 에이전트: ${AGENTS_BY_ID[agentId as keyof typeof AGENTS_BY_ID]?.name ?? agentId}`;
}

export function detectBrowserActions(message: string): MeetingAction[] {
  const trimmed = stripMentions(message).trim();
  const urlMatch = message.match(/https?:\/\/[^\s)]+/i);
  const url = urlMatch?.[0];
  const hasIntent =
    Boolean(url) ||
    /(browse|browser|openclaw|web|internet|search|look up|find|research|price target|filing|news|investigate|차트|뉴스|검색|웹|브라우저|조사)/i.test(
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

function formatSections(sections: Array<[string, string[]]>) {
  return sections
    .map(([title, lines]) => {
      const body = lines.length > 0 ? lines.join("\n") : "- 내용 없음";
      return `## ${title}\n${body}`;
    })
    .join("\n\n");
}

function extractSourceLines(agentSystemPrompt: string) {
  const sources = ["앱 스냅샷"];
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
    /btc|bitcoin|비트코인/.test(lowerMessage)
      ? "비트코인 수급과 변동성"
      : /kospi|kosdaq|samsung|005930|kr|국내/.test(lowerMessage)
        ? "국내 증시 수급과 대형주 흐름"
        : /nasdaq|s&p|qqq|aapl|nvda|us|미국/.test(lowerMessage)
          ? "미국 지수와 AI 대형주 순환"
          : "자산군 전반의 리스크와 포지셔닝";

  return formatSections([
    [
      "핵심 수치 요약",
      [
        `- 현재 핵심 포인트: ${focus}`,
        "- 스냅샷 기준으로 추세는 유지되지만 단기 과열 여부를 재확인할 필요가 있습니다.",
        "- 의사결정 임계값은 직전 고점/저점 이탈 여부와 거래대금 유지 여부입니다."
      ]
    ],
    [
      "리스크 맵(영향도×발생확률)",
      [
        "- 리스크: 변동성 재확대 | 영향도: high | 발생확률: medium | 근거: 단기 가격 반응이 빠르고 추격 매수 유입 가능성이 큼 | 대응: 포지션 크기 축소 후 재확인",
        "- 리스크: 뉴스 공백 구간 오판 | 영향도: medium | 발생확률: medium | 근거: 가격 신호만으로 판단 시 해석 오류 가능 | 대응: 뉴스와 수급을 함께 확인"
      ]
    ],
    ["근거 데이터 출처", extractSourceLines(agentSystemPrompt)],
    [
      "시나리오별 전망",
      [
        "- 베이스: 현재 추세 유지, 다만 눌림 확인 전까지 추격은 제한",
        "- 낙관: 거래대금과 모멘텀이 동반 유지되면 추가 상승 여지 확대",
        "- 비관: 지지선 이탈과 뉴스 악화가 겹치면 단기 방어 전환 필요"
      ]
    ],
    [
      "권고안",
      ["- 신규 판단은 소규모로 시작하고, 다음 확인 시점까지 리스크 한도를 먼저 정하세요."]
    ]
  ]);
}

function buildFacilitatorMockReply(message: string, agentSystemPrompt: string) {
  const lowerMessage = message.toLowerCase();
  const hasOrderIntent = /(buy|sell|order|매수|매도|주문)/.test(lowerMessage);
  const hasResearchIntent = /(browse|browser|openclaw|web|research|뉴스|검색|조사)/.test(lowerMessage);
  const actionTask = hasOrderIntent
    ? "모의투자 패널에서 주문 가정을 검증한다"
    : hasResearchIntent
      ? "OpenClaw 후속 조사 범위를 확정한다"
      : "다음 확인 시점과 판단 기준을 확정한다";

  const actionOwner = hasOrderIntent ? "이안" : "서윤";

  return formatSections([
    [
      "결론",
      ["- 현재 정보만으로도 다음 액션을 정할 수 있지만, 실행 전 마지막 확인 절차는 유지해야 합니다."]
    ],
    [
      "근거 요약",
      [
        "- 분석가 관점에서는 추세 활용 여지는 있으나 리스크 관리가 선행되어야 합니다.",
        "- 출처는 앱 스냅샷 기준으로 충분하며, 필요 시 추가 웹 조사를 붙이면 됩니다."
      ]
    ],
    [
      "다음 액션(담당/기한)",
      [`- 작업: ${actionTask} | 담당: ${actionOwner} | 기한: TBD | 상태: todo`]
    ],
    [
      "미해결 이슈",
      ["- 외부 뉴스와 실시간 호가를 어디까지 추가 검증할지 아직 확정되지 않았습니다."]
    ],
    [
      "회의록 요약",
      ["- 이번 라운드는 추세 활용 가능성을 확인했고, 실행 전 검증 절차를 남기는 것으로 정리합니다."]
    ]
  ]);
}

function callMock(args: { agentSystemPrompt: string; message: string; history: ChatHistoryItem[] }) {
  const isAnalyst = args.agentSystemPrompt.includes("[ROLE:analyst]");
  return isAnalyst
    ? buildAnalystMockReply(args.message, args.agentSystemPrompt)
    : buildFacilitatorMockReply(args.message, args.agentSystemPrompt);
}

async function callCerebras(args: {
  agentSystemPrompt: string;
  message: string;
  history: ChatHistoryItem[];
}) {
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

async function callAnthropic(args: {
  agentSystemPrompt: string;
  message: string;
  history: ChatHistoryItem[];
}) {
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

async function callOpenAI(args: {
  agentSystemPrompt: string;
  message: string;
  history: ChatHistoryItem[];
}) {
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
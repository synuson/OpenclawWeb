import { AGENTS_BY_ID } from "@/lib/meeting/agents";
import { getRoleDefinitionForAgent } from "@/lib/meeting/role-definitions";
import { callLLM, detectBrowserActions, isoNow, pickProvider } from "@/lib/meeting/provider";
import type {
  ChatHistoryItem,
  MeetingMinutes,
  MeetingRoundRequest,
  MeetingRoundResponse,
  MeetingTurn,
  PortfolioSnapshot
} from "@/lib/meeting/types";
import { uid } from "@/lib/utils";

const ANALYST_SECTIONS = getRoleDefinitionForAgent("analyst").outputFormat.sections;
const FACILITATOR_SECTIONS = getRoleDefinitionForAgent("assistant").outputFormat.sections;

type ParsedSections = Record<string, string[]>;

type NormalizedActionItem = {
  task: string;
  owner: string;
  dueAt: string;
  status: "todo" | "doing" | "done";
};

function trimText(value: string, maxLength = 260) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function normalizeHeading(value: string) {
  return value
    .replace(/^#+\s*/, "")
    .replace(/^[-*]\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/:$/, "")
    .trim();
}

function parseSections(text: string, sectionNames: string[]) {
  const sections = Object.fromEntries(sectionNames.map((name) => [name, [] as string[]])) as ParsedSections;
  let currentSection: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const heading = normalizeHeading(line);
    const matched = sectionNames.find((sectionName) => sectionName === heading);
    if (matched) {
      currentSection = matched;
      continue;
    }

    if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  return sections;
}

function parseDueAt(value: string | undefined) {
  const raw = (value ?? "").trim();
  if (!raw || raw.toUpperCase() === "TBD") {
    return "TBD";
  }

  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? "TBD" : new Date(timestamp).toISOString();
}

function parseActionItemLine(line: string): NormalizedActionItem {
  const cleaned = line.replace(/^[-*]\s*/, "").trim();
  const tokens = cleaned.split("|").map((token) => token.trim());
  const fields = new Map<string, string>();

  for (const token of tokens) {
    const [label, ...rest] = token.split(":");
    if (!label || rest.length === 0) {
      continue;
    }
    fields.set(label.trim(), rest.join(":").trim());
  }

  const task = fields.get("작업") || cleaned || "후속 확인";
  const owner = fields.get("담당") || "TBD";
  const dueAt = parseDueAt(fields.get("기한"));
  const status = fields.get("상태");

  return {
    task,
    owner,
    dueAt,
    status: status === "doing" || status === "done" ? status : "todo"
  };
}

function formatActionItem(item: NormalizedActionItem) {
  return `작업: ${item.task} | 담당: ${item.owner || "TBD"} | 기한: ${item.dueAt || "TBD"} | 상태: ${item.status}`;
}

function extractActionItemsFromSections(sections: ParsedSections, userMessage: string) {
  const lines = sections["다음 액션(담당/기한)"] ?? [];
  if (lines.length > 0) {
    return lines.map(parseActionItemLine).map(formatActionItem);
  }

  return [formatActionItem({ task: trimText(userMessage, 90), owner: "TBD", dueAt: "TBD", status: "todo" })];
}

function firstSectionText(sections: ParsedSections, sectionName: string) {
  return (sections[sectionName] ?? []).join(" ").trim();
}

function renderHistory(history: ChatHistoryItem[]) {
  if (history.length === 0) {
    return "이전 회의 대화가 없습니다.";
  }

  return history
    .slice(-8)
    .map((item) => {
      const speaker = item.role === "user" ? "사용자" : AGENTS_BY_ID[item.agent ?? "assistant"]?.name || "에이전트";
      return `- ${speaker}: ${item.content}`;
    })
    .join("\n");
}

function renderMarketSnapshot(request: MeetingRoundRequest) {
  if (!request.marketSnapshot) {
    return "시장 스냅샷이 제공되지 않았습니다.";
  }

  const snapshot = request.marketSnapshot;
  const indexLines = snapshot.indices
    .slice(0, 3)
    .map(
      (item) =>
        `${item.name} ${item.price.toFixed(item.currency === "KRW" ? 0 : 2)} (${item.changePercent.toFixed(2)}%)`
    );
  const watchLines = snapshot.watchlist
    .slice(0, 4)
    .map(
      (item) =>
        `${item.symbol} ${item.price.toFixed(item.currency === "KRW" ? 0 : 2)} (${item.changePercent.toFixed(2)}%)`
    );

  return [
    `활성 탭: ${snapshot.tab}`,
    `헤드라인: ${snapshot.headline}`,
    `데이터 제공자: ${snapshot.provider}`,
    indexLines.length > 0 ? `지수: ${indexLines.join(", ")}` : "지수: 없음",
    watchLines.length > 0 ? `관심종목: ${watchLines.join(", ")}` : "관심종목: 없음",
    snapshot.notes.length > 0 ? `메모: ${snapshot.notes.join(" | ")}` : "메모: 없음"
  ].join("\n");
}

function renderPortfolio(snapshot?: PortfolioSnapshot | null) {
  if (!snapshot) {
    return "포트폴리오 스냅샷이 제공되지 않았습니다.";
  }

  const positions =
    snapshot.positions.length > 0
      ? snapshot.positions
          .slice(0, 5)
          .map(
            (position) =>
              `${position.symbol} 수량 ${position.quantity}, 평균가 ${position.averagePrice.toFixed(0)}, 손익 ${position.unrealizedPnlPercent.toFixed(2)}%`
          )
          .join("; ")
      : "보유 포지션 없음";

  return [
    `브로커: ${snapshot.broker} (${snapshot.mode})`,
    `예수금: ${snapshot.cash.toFixed(0)} ${snapshot.currency}`,
    `총자산: ${snapshot.equity.toFixed(0)} ${snapshot.currency}`,
    `포지션: ${positions}`
  ].join("\n");
}

function renderPriorMinutes(minutes?: MeetingMinutes | null) {
  if (!minutes) {
    return "이전 회의록이 없습니다.";
  }

  return [
    `요약: ${minutes.summary}`,
    `액션 아이템: ${minutes.actionItems.join("; ") || "없음"}`,
    `매매 메모: ${minutes.tradeNotes.join("; ") || "없음"}`
  ].join("\n");
}

function collectSourceLabels(request: MeetingRoundRequest) {
  const labels = ["앱 스냅샷"];

  if (request.marketSnapshot?.provider && !labels.includes(request.marketSnapshot.provider)) {
    labels.push(request.marketSnapshot.provider);
  }
  if (request.portfolioSnapshot?.broker && !labels.includes(request.portfolioSnapshot.broker)) {
    labels.push(request.portfolioSnapshot.broker);
  }

  return labels;
}

function renderSourceHints(request: MeetingRoundRequest) {
  return collectSourceLabels(request)
    .map((label) => `- ${label}`)
    .join("\n");
}

function buildMinutes(args: {
  request: MeetingRoundRequest;
  analystText: string;
  assistantText: string;
  sessionId: string;
}): MeetingMinutes {
  const snapshot = args.request.marketSnapshot;
  const portfolio = args.request.portfolioSnapshot;
  const analystSections = parseSections(args.analystText, ANALYST_SECTIONS);
  const facilitatorSections = parseSections(args.assistantText, FACILITATOR_SECTIONS);
  const marketLines = [...(snapshot?.indices ?? []), ...(snapshot?.watchlist ?? [])]
    .slice(0, 4)
    .map(
      (item) => `${item.symbol} ${item.price.toFixed(item.currency === "KRW" ? 0 : 2)} (${item.changePercent.toFixed(2)}%)`
    );

  const tradeNotes = portfolio
    ? portfolio.positions.length > 0
      ? portfolio.positions
          .slice(0, 3)
          .map(
            (position) => `${position.symbol}: ${position.quantity}주, 평가손익 ${position.unrealizedPnlPercent.toFixed(2)}%`
          )
      : ["모의 포트폴리오에 열린 포지션이 없습니다."]
    : ["매매 스냅샷을 불러오지 못했습니다."];

  return {
    sessionId: args.sessionId,
    title: `${new Date().toLocaleDateString("ko-KR")} 금융 회의록`,
    updatedAt: isoNow(),
    activeTab: args.request.activeTab,
    summary: trimText(
      firstSectionText(facilitatorSections, "회의록 요약") ||
        firstSectionText(facilitatorSections, "결론") ||
        args.assistantText,
      240
    ),
    marketSnapshot: marketLines.length > 0 ? marketLines : ["이번 라운드에서 저장된 시세가 없습니다."],
    keyPoints: [
      trimText(firstSectionText(analystSections, "권고안") || firstSectionText(analystSections, "핵심 수치 요약") || args.analystText, 220),
      trimText(firstSectionText(facilitatorSections, "근거 요약") || firstSectionText(facilitatorSections, "결론") || args.assistantText, 220)
    ],
    actionItems: extractActionItemsFromSections(facilitatorSections, args.request.message),
    tradeNotes
  };
}

export async function runMeetingRound(request: MeetingRoundRequest): Promise<MeetingRoundResponse> {
  const provider = pickProvider();
  const sessionId = request.minutes?.sessionId || uid("session");
  const sharedContext = [
    "당신은 금융 회의실 안에 있습니다. 반드시 한국어로, 짧고 실무적으로 답하세요.",
    renderMarketSnapshot(request),
    renderPortfolio(request.portfolioSnapshot),
    renderPriorMinutes(request.minutes),
    "근거 데이터 출처로 사용할 수 있는 후보:",
    renderSourceHints(request),
    "최근 대화:",
    renderHistory(request.history)
  ].join("\n\n");

  const analystText = await callLLM(provider, {
    agentSystemPrompt: `${AGENTS_BY_ID.analyst.systemPrompt}\n\n${sharedContext}`,
    history: request.history,
    message: [
      `사용자 요청:\n${request.message}`,
      "아래 섹션 제목을 그대로 사용하세요:",
      ANALYST_SECTIONS.map((section) => `- ${section}`).join("\n")
    ].join("\n\n")
  });

  const analystTurn: MeetingTurn = {
    id: uid("turn"),
    agentId: "analyst",
    speakerLabel: AGENTS_BY_ID.analyst.name,
    text: analystText,
    timestamp: isoNow(),
    provider,
    phase: "analysis"
  };

  const assistantHistory: ChatHistoryItem[] = [
    ...request.history,
    {
      role: "assistant",
      agent: "analyst",
      content: analystText
    }
  ];

  let assistantText = await callLLM(provider, {
    agentSystemPrompt: `${AGENTS_BY_ID.assistant.systemPrompt}\n\n${sharedContext}`,
    history: assistantHistory,
    message: [
      `사용자 요청:\n${request.message}`,
      `분석가 메모:\n${analystText}`,
      "아래 섹션 제목을 그대로 사용하세요:",
      FACILITATOR_SECTIONS.map((section) => `- ${section}`).join("\n")
    ].join("\n\n")
  });

  const actions = detectBrowserActions(request.message);
  if (actions.length > 0 && !/openclaw|browser|research|browse|조사|웹/i.test(assistantText)) {
    assistantText = `${assistantText}\n\n## 미해결 이슈\n- 추가 웹 조사가 필요하면 OpenClaw 후속 조사를 실행하세요.`;
  }

  const assistantTurn: MeetingTurn = {
    id: uid("turn"),
    agentId: "assistant",
    speakerLabel: AGENTS_BY_ID.assistant.name,
    text: assistantText,
    timestamp: isoNow(),
    provider,
    phase: "summary"
  };

  return {
    turns: [analystTurn, assistantTurn],
    minutes: buildMinutes({
      request,
      analystText,
      assistantText,
      sessionId
    }),
    provider,
    actions
  };
}
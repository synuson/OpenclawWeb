import { DEFAULT_LOCALE, getIntlLocale, type AppLocale } from "@/lib/i18n/config";
import { detectMentionedAgentId, getAgentsById, type Agent } from "@/lib/meeting/agents";
import {
  getActionItemFieldLabels,
  getRoleDefinitionForAgent,
  ROLE_SECTION_LABELS
} from "@/lib/meeting/role-definitions";
import { callLLM, detectBrowserActions, isoNow, pickProvider } from "@/lib/meeting/provider";
import { runMeetingResearchTask } from "@/lib/openclaw/client";
import type {
  AgentId,
  ChatHistoryItem,
  MeetingAction,
  MeetingMinutes,
  MeetingRoundResearch,
  MeetingRoundRequest,
  MeetingRoundResponse,
  MeetingTurn,
  PortfolioSnapshot
} from "@/lib/meeting/types";
import { uid } from "@/lib/utils";

type ParsedSections = Record<string, string[]>;

type NormalizedActionItem = {
  task: string;
  owner: string;
  dueAt: string;
  status: "todo" | "doing" | "done";
};

type DraftTurn = {
  agentId: AgentId;
  phase: MeetingTurn["phase"];
  rawText: string;
  visibleText: string;
  timestamp: string;
  provider: MeetingTurn["provider"];
};

const URL_PATTERN = /https?:\/\/[^\s)]+/i;
const ANALYST_LEAD_PATTERN =
  /(btc|bitcoin|eth|crypto|kospi|kosdaq|nasdaq|s&p|qqq|aapl|nvda|tsla|stock|chart|price|valuation|multiple|earnings|risk|volatility|macro|etf|실적|리스크|변동성|지표|차트|시세|밸류|주가|공시|뉴스)/i;
const ASSISTANT_LEAD_PATTERN =
  /(summary|summarize|decision|plan|action|what should|next step|recommend|buy or sell|요약|정리|결론|계획|액션|다음 단계|어떻게 할까|추천|사야|말아야)/i;
const RESEARCH_TRIGGER_PATTERN =
  /(browse|browser|openclaw|web|internet|search|look up|find|research|latest|news|filing|verify|source|url|link|기사|최신|출처|검증|링크|뉴스|웹|브라우저|조사)/i;
const RESEARCH_FOLLOWUP_PATTERN =
  /(openclaw|browser follow-up|external verification|source verification|follow-up research|추가 조사 필요|추가 검증 필요|출처 확인 필요|링크 확인 필요|OpenClaw 후속)/i;
const HEADING_PATTERN = /^#{1,6}\s*/;

function trimText(value: string, maxLength = 260) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function otherAgent(agentId: AgentId): AgentId {
  return agentId === "assistant" ? "analyst" : "assistant";
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

function parseDueAt(value: string | undefined, locale: AppLocale) {
  const labels = getActionItemFieldLabels(locale);
  const raw = (value ?? "").trim();
  if (!raw || raw.toUpperCase() === labels.tbd) {
    return labels.tbd;
  }

  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? labels.tbd : new Date(timestamp).toISOString();
}

function parseActionItemLine(line: string, locale: AppLocale): NormalizedActionItem {
  const labels = getActionItemFieldLabels(locale);
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

  const task = fields.get(labels.task) || cleaned || labels.fallbackTask;
  const owner = fields.get(labels.owner) || labels.tbd;
  const dueAt = parseDueAt(fields.get(labels.dueAt), locale);
  const status = fields.get(labels.status);

  return {
    task,
    owner,
    dueAt,
    status: status === "doing" || status === "done" ? status : "todo"
  };
}

function formatActionItem(item: NormalizedActionItem, locale: AppLocale) {
  const labels = getActionItemFieldLabels(locale);
  return `${labels.task}: ${item.task} | ${labels.owner}: ${item.owner || labels.tbd} | ${labels.dueAt}: ${
    item.dueAt || labels.tbd
  } | ${labels.status}: ${item.status}`;
}

function extractActionItemsFromSections(sections: ParsedSections, userMessage: string, locale: AppLocale) {
  const lines = sections[ROLE_SECTION_LABELS[locale].assistant.actions] ?? [];
  if (lines.length > 0) {
    return lines.map((line) => parseActionItemLine(line, locale)).map((item) => formatActionItem(item, locale));
  }

  return [
    formatActionItem(
      {
        task: trimText(userMessage, 90),
        owner: getActionItemFieldLabels(locale).tbd,
        dueAt: getActionItemFieldLabels(locale).tbd,
        status: "todo"
      },
      locale
    )
  ];
}

function firstSectionText(sections: ParsedSections, sectionName: string) {
  return (sections[sectionName] ?? []).join(" ").trim();
}

function renderHistory(
  history: ChatHistoryItem[],
  locale: AppLocale,
  agentsById: Record<AgentId, Agent>
) {
  if (history.length === 0) {
    return locale === "ko" ? "이전 대화 기록이 없습니다." : "There is no prior meeting history.";
  }

  return history
    .slice(-4)
    .map((item) => {
      const speaker =
        item.role === "user"
          ? locale === "ko"
            ? "사용자"
            : "User"
          : agentsById[item.agent ?? "assistant"]?.name || (locale === "ko" ? "에이전트" : "Agent");
      return `- ${speaker}: ${item.content}`;
    })
    .join("\n");
}

function renderMarketSnapshot(request: MeetingRoundRequest, locale: AppLocale) {
  if (!request.marketSnapshot) {
    return locale === "ko" ? "시장 스냅샷이 제공되지 않았습니다." : "No market snapshot was provided.";
  }

  const snapshot = request.marketSnapshot;
  const sessionLabel =
    snapshot.session === "open"
      ? locale === "ko"
        ? "개장"
        : "Open"
      : snapshot.session === "pre"
        ? locale === "ko"
          ? "장전"
          : "Pre-market"
        : snapshot.session === "post"
          ? locale === "ko"
            ? "시간외"
            : "After-hours"
          : snapshot.session === "closed"
            ? locale === "ko"
              ? "휴장"
              : "Closed"
            : locale === "ko"
              ? "상시"
              : "Always on";

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

  if (locale === "ko") {
    return [
      `활성 탭: ${snapshot.tab}`,
      `헤드라인: ${snapshot.headline}`,
      `데이터 제공자: ${snapshot.provider}`,
      `데이터 상태: ${snapshot.status} / 장 상태: ${sessionLabel}`,
      `기준 시각: ${snapshot.updatedAt}`,
      indexLines.length > 0 ? `지수: ${indexLines.join(", ")}` : "지수: 없음",
      watchLines.length > 0 ? `관심 종목: ${watchLines.join(", ")}` : "관심 종목: 없음",
      snapshot.notes.length > 0 ? `메모: ${snapshot.notes.join(" | ")}` : "메모: 없음"
    ].join("\n");
  }

  return [
    `Active tab: ${snapshot.tab}`,
    `Headline: ${snapshot.headline}`,
    `Data provider: ${snapshot.provider}`,
    `Data status: ${snapshot.status} / Market session: ${sessionLabel}`,
    `Reference time: ${snapshot.updatedAt}`,
    indexLines.length > 0 ? `Indices: ${indexLines.join(", ")}` : "Indices: none",
    watchLines.length > 0 ? `Watchlist: ${watchLines.join(", ")}` : "Watchlist: none",
    snapshot.notes.length > 0 ? `Notes: ${snapshot.notes.join(" | ")}` : "Notes: none"
  ].join("\n");
}

function renderPortfolio(snapshot?: PortfolioSnapshot | null, locale: AppLocale = DEFAULT_LOCALE) {
  if (!snapshot) {
    return locale === "ko" ? "포트폴리오 스냅샷이 제공되지 않았습니다." : "No portfolio snapshot was provided.";
  }

  const positions =
    snapshot.positions.length > 0
      ? snapshot.positions
          .slice(0, 5)
          .map((position) =>
            locale === "ko"
              ? `${position.symbol} 수량 ${position.quantity}, 평균 ${position.averagePrice.toFixed(0)}, 손익 ${position.unrealizedPnlPercent.toFixed(2)}%`
              : `${position.symbol} qty ${position.quantity}, avg ${position.averagePrice.toFixed(0)}, PnL ${position.unrealizedPnlPercent.toFixed(2)}%`
          )
          .join("; ")
      : locale === "ko"
        ? "보유 포지션 없음"
        : "No open positions";

  return locale === "ko"
    ? [
        `브로커: ${snapshot.broker} (${snapshot.mode})`,
        `현금: ${snapshot.cash.toFixed(0)} ${snapshot.currency}`,
        `총자산: ${snapshot.equity.toFixed(0)} ${snapshot.currency}`,
        `포지션: ${positions}`
      ].join("\n")
    : [
        `Broker: ${snapshot.broker} (${snapshot.mode})`,
        `Cash: ${snapshot.cash.toFixed(0)} ${snapshot.currency}`,
        `Equity: ${snapshot.equity.toFixed(0)} ${snapshot.currency}`,
        `Positions: ${positions}`
      ].join("\n");
}

function renderPriorMinutes(minutes?: MeetingMinutes | null, locale: AppLocale = DEFAULT_LOCALE) {
  if (!minutes) {
    return locale === "ko" ? "이전 회의록이 없습니다." : "There are no prior meeting minutes.";
  }

  return locale === "ko"
    ? [
        `요약: ${minutes.summary}`,
        `액션 아이템: ${minutes.actionItems.join("; ") || "없음"}`,
        `매매 메모: ${minutes.tradeNotes.join("; ") || "없음"}`
      ].join("\n")
    : [
        `Summary: ${minutes.summary}`,
        `Action items: ${minutes.actionItems.join("; ") || "none"}`,
        `Trade notes: ${minutes.tradeNotes.join("; ") || "none"}`
      ].join("\n");
}

function collectSourceLabels(request: MeetingRoundRequest, locale: AppLocale) {
  const labels = [locale === "ko" ? "앱 스냅샷" : "App snapshot"];

  if (request.marketSnapshot?.provider && !labels.includes(request.marketSnapshot.provider)) {
    labels.push(request.marketSnapshot.provider);
  }
  if (request.portfolioSnapshot?.broker && !labels.includes(request.portfolioSnapshot.broker)) {
    labels.push(request.portfolioSnapshot.broker);
  }

  return labels;
}

function renderSourceHints(request: MeetingRoundRequest, locale: AppLocale) {
  return collectSourceLabels(request, locale)
    .map((label) => `- ${label}`)
    .join("\n");
}

function buildSharedContext(
  request: MeetingRoundRequest,
  locale: AppLocale,
  agentsById: Record<AgentId, Agent>
) {
  return locale === "ko"
    ? [
        "당신은 금융 미팅룸 안에서 사용자와 직접 대화하는 에이전트입니다. 핵심만 짧고 자연스럽게 답하세요.",
        renderMarketSnapshot(request, locale),
        renderPortfolio(request.portfolioSnapshot, locale),
        renderPriorMinutes(request.minutes, locale),
        "근거 후보:",
        renderSourceHints(request, locale),
        "최근 대화:",
        renderHistory(request.history, locale, agentsById)
      ].join("\n\n")
    : [
        "You are an agent inside a finance meeting room. Reply naturally and concisely for a live chat.",
        renderMarketSnapshot(request, locale),
        renderPortfolio(request.portfolioSnapshot, locale),
        renderPriorMinutes(request.minutes, locale),
        "Candidate evidence sources:",
        renderSourceHints(request, locale),
        "Recent conversation:",
        renderHistory(request.history, locale, agentsById)
      ].join("\n\n");
}

function chooseFirstSpeaker(message: string, mentionedAgentId?: AgentId): AgentId {
  if (mentionedAgentId) {
    return mentionedAgentId;
  }

  const normalized = message.toLowerCase();
  if (ASSISTANT_LEAD_PATTERN.test(normalized) && !ANALYST_LEAD_PATTERN.test(normalized)) {
    return "assistant";
  }

  if (ANALYST_LEAD_PATTERN.test(normalized) || URL_PATTERN.test(message) || RESEARCH_TRIGGER_PATTERN.test(normalized)) {
    return "analyst";
  }

  return "assistant";
}

function compactDisplayLine(line: string) {
  const normalized = line
    .replace(HEADING_PATTERN, "")
    .replace(/^[-*]\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  const [firstSegment] = normalized.split("|");
  return firstSegment.trim();
}

function getPreferredDisplayLines(agentId: AgentId, rawText: string, locale: AppLocale) {
  const sectionLabels = ROLE_SECTION_LABELS[locale];
  const sectionNames = getRoleDefinitionForAgent(agentId, locale).outputFormat.sections;
  const parsed = parseSections(rawText, sectionNames);

  const preferred =
    agentId === "assistant"
      ? [
          firstSectionText(parsed, sectionLabels.assistant.conclusion),
          firstSectionText(parsed, sectionLabels.assistant.evidence),
          (parsed[sectionLabels.assistant.actions] ?? [])[0] ?? ""
        ]
      : [
          firstSectionText(parsed, sectionLabels.analyst.recommendation),
          firstSectionText(parsed, sectionLabels.analyst.metrics),
          (parsed[sectionLabels.analyst.risks] ?? [])[0] ?? ""
        ];

  const preferredLines = preferred
    .flatMap((block) => block.split(/\r?\n/))
    .map(compactDisplayLine)
    .filter(Boolean);

  if (preferredLines.length > 0) {
    return preferredLines.slice(0, 3);
  }

  return rawText
    .split(/\r?\n/)
    .map(compactDisplayLine)
    .filter(Boolean)
    .slice(0, 3);
}

function buildVisibleTurnText(agentId: AgentId, rawText: string, locale: AppLocale) {
  const lines = getPreferredDisplayLines(agentId, rawText, locale);
  if (lines.length === 0) {
    return trimText(rawText.replace(/\s+/g, " ").trim(), 260);
  }

  return lines.join("\n\n");
}

function appendHistory(history: ChatHistoryItem[], turn: DraftTurn): ChatHistoryItem[] {
  return [
    ...history,
    {
      role: "assistant",
      agent: turn.agentId,
      content: turn.rawText
    }
  ];
}

function getTurnPhase(agentId: AgentId): MeetingTurn["phase"] {
  return agentId === "analyst" ? "analysis" : "summary";
}

function buildTurnRequest(args: {
  agentId: AgentId;
  locale: AppLocale;
  agentsById: Record<AgentId, Agent>;
  message: string;
  teammateNote?: string;
  researchContext?: string;
  finalize?: boolean;
}) {
  const { agentId, locale, agentsById, message, teammateNote, researchContext, finalize } = args;
  const counterpartName = agentsById[otherAgent(agentId)].name;
  const sections = getRoleDefinitionForAgent(agentId, locale).outputFormat.sections;
  const sectionBlock = sections.map((section) => `- ${section}`).join("\n");

  return locale === "ko"
    ? [
        `사용자 요청:\n${message}`,
        teammateNote ? `${counterpartName} 메모:\n${teammateNote}` : null,
        researchContext ? `OpenClaw 조사 결과:\n${researchContext}` : null,
        "아래 섹션 제목을 정확히 그대로 사용하세요.",
        sectionBlock,
        finalize
          ? "최종 답변입니다. 각 섹션은 1~2개의 짧은 bullet 또는 문장으로 정리하고 인사말은 쓰지 마세요."
          : "메인 채팅용 짧은 답변입니다. 각 섹션은 1~2개의 짧은 bullet 또는 문장으로 정리하고 인사말은 쓰지 마세요.",
        "중복을 피하고 핵심 판단과 근거만 남기세요."
      ]
        .filter(Boolean)
        .join("\n\n")
    : [
        `User request:\n${message}`,
        teammateNote ? `${counterpartName} note:\n${teammateNote}` : null,
        researchContext ? `OpenClaw findings:\n${researchContext}` : null,
        "Use the exact section titles below.",
        sectionBlock,
        finalize
          ? "This is the final answer for the main chat. Keep each section to one or two short bullets or sentences, with no greeting."
          : "Write a concise main-chat reply with one or two short bullets or sentences per section and no greeting.",
        "Avoid repetition and focus on judgment plus evidence."
      ]
        .filter(Boolean)
        .join("\n\n");
}

function chooseResearchAgent(
  message: string,
  firstSpeakerId: AgentId,
  draftTurns: DraftTurn[],
  mentionedAgentId?: AgentId
): AgentId {
  if (mentionedAgentId) {
    return mentionedAgentId;
  }

  const latestResearchTurn = [...draftTurns]
    .reverse()
    .find((turn) => RESEARCH_TRIGGER_PATTERN.test(turn.rawText));

  if (latestResearchTurn) {
    return latestResearchTurn.agentId;
  }

  return ANALYST_LEAD_PATTERN.test(message.toLowerCase()) || URL_PATTERN.test(message) ? "analyst" : firstSpeakerId;
}

function buildResearchContext(research: MeetingRoundResearch, locale: AppLocale) {
  const heading = locale === "ko" ? "조사 요약" : "Research summary";
  const notesHeading = locale === "ko" ? "핵심 메모" : "Key notes";

  return [
    `${heading}: ${research.task.summary}`,
    `${locale === "ko" ? "상태" : "Status"}: ${research.task.status}`,
    `${notesHeading}:`,
    ...(research.artifacts.notes.length > 0
      ? research.artifacts.notes.slice(0, 4).map((note) => `- ${note}`)
      : [`- ${research.task.summary}`])
  ].join("\n");
}

function detectDirectResearchAction(message: string): MeetingAction[] {
  const normalized = message.replace(/@([^\s@]+)/g, "").replace(/\s+/g, " ").trim();
  const urlMatch = message.match(URL_PATTERN);
  const url = urlMatch?.[0];
  const hasIntent =
    Boolean(url) ||
    RESEARCH_TRIGGER_PATTERN.test(message) ||
    /최신|뉴스|출처|검증|링크|기사|웹|브라우저|조사/.test(message);

  if (!hasIntent || !normalized) {
    return [];
  }

  return [
    {
      type: "openclaw_task",
      instruction: normalized,
      url
    }
  ];
}

function detectRoundActions(message: string, draftTurns: DraftTurn[]) {
  const directActions = detectDirectResearchAction(message);
  if (directActions.length > 0) {
    return directActions;
  }

  const draftText = draftTurns.map((turn) => turn.rawText).join("\n\n");
  if (!RESEARCH_FOLLOWUP_PATTERN.test(draftText)) {
    return [];
  }

  return detectBrowserActions(draftText);
}

function buildMinutes(args: {
  request: MeetingRoundRequest;
  turns: DraftTurn[];
  sessionId: string;
  locale: AppLocale;
  research?: MeetingRoundResearch;
}): MeetingMinutes {
  const { locale } = args;
  const sectionLabels = ROLE_SECTION_LABELS[locale];
  const analystSectionsList = getRoleDefinitionForAgent("analyst", locale).outputFormat.sections;
  const facilitatorSectionsList = getRoleDefinitionForAgent("assistant", locale).outputFormat.sections;
  const analystTurn = args.turns.find((turn) => turn.agentId === "analyst") ?? args.turns[0];
  const assistantTurn = [...args.turns].reverse().find((turn) => turn.agentId === "assistant") ?? args.turns[args.turns.length - 1];
  const analystText = analystTurn?.rawText || args.request.message;
  const assistantText = assistantTurn?.rawText || analystText;
  const analystSections = parseSections(analystText, analystSectionsList);
  const facilitatorSections = parseSections(assistantText, facilitatorSectionsList);
  const snapshot = args.request.marketSnapshot;
  const portfolio = args.request.portfolioSnapshot;
  const marketLines = [...(snapshot?.indices ?? []), ...(snapshot?.watchlist ?? [])]
    .slice(0, 4)
    .map(
      (item) => `${item.symbol} ${item.price.toFixed(item.currency === "KRW" ? 0 : 2)} (${item.changePercent.toFixed(2)}%)`
    );

  const tradeNotes = portfolio
    ? portfolio.positions.length > 0
      ? portfolio.positions.slice(0, 3).map((position) =>
          locale === "ko"
            ? `${position.symbol}: ${position.quantity}주, 평균 ${position.averagePrice.toFixed(0)}, 손익 ${position.unrealizedPnlPercent.toFixed(2)}%`
            : `${position.symbol}: ${position.quantity} shares, avg ${position.averagePrice.toFixed(0)}, PnL ${position.unrealizedPnlPercent.toFixed(2)}%`
        )
      : [
          locale === "ko"
            ? "모의 포트폴리오에 현재 열린 포지션이 없습니다."
            : "There are no open positions in the paper portfolio."
        ]
    : [
        locale === "ko"
          ? "매매 스냅샷을 불러오지 못했습니다."
          : "The trading snapshot could not be loaded."
      ];

  if (args.research?.artifacts.notes.length) {
    tradeNotes.unshift(trimText(args.research.artifacts.notes[0], 180));
  } else if (args.research?.task.summary) {
    tradeNotes.unshift(trimText(args.research.task.summary, 180));
  }

  return {
    sessionId: args.sessionId,
    title:
      locale === "ko"
        ? `${new Date().toLocaleDateString(getIntlLocale(locale))} 금융 회의록`
        : `${new Date().toLocaleDateString(getIntlLocale(locale))} Meeting Minutes`,
    updatedAt: isoNow(),
    activeTab: args.request.activeTab,
    summary: trimText(
      args.research?.task.summary ||
        firstSectionText(facilitatorSections, sectionLabels.assistant.minutes) ||
        firstSectionText(facilitatorSections, sectionLabels.assistant.conclusion) ||
        assistantText,
      240
    ),
    marketSnapshot:
      marketLines.length > 0
        ? marketLines
        : [
            locale === "ko"
              ? "이번 라운드에 저장된 시세가 없습니다."
              : "No market snapshot was saved in this round."
          ],
    keyPoints: [
      trimText(
        firstSectionText(analystSections, sectionLabels.analyst.recommendation) ||
          firstSectionText(analystSections, sectionLabels.analyst.metrics) ||
          analystText,
        220
      ),
      trimText(
        args.research?.task.summary ||
          firstSectionText(facilitatorSections, sectionLabels.assistant.evidence) ||
          firstSectionText(facilitatorSections, sectionLabels.assistant.conclusion) ||
          assistantText,
        220
      )
    ],
    actionItems: extractActionItemsFromSections(facilitatorSections, args.request.message, locale),
    tradeNotes
  };
}

export async function runMeetingRound(request: MeetingRoundRequest): Promise<MeetingRoundResponse> {
  const locale = request.locale ?? DEFAULT_LOCALE;
  const agentsById = getAgentsById(locale, request.personaOverrides);
  const preferredProvider = pickProvider();
  let activeProvider = preferredProvider;
  const sessionId = request.minutes?.sessionId || uid("session");
  const mentionedAgentId = detectMentionedAgentId(request.message, locale, request.personaOverrides);
  const firstSpeakerId = chooseFirstSpeaker(request.message, mentionedAgentId);
  const supportSpeakerId = otherAgent(firstSpeakerId);
  const sharedContext = buildSharedContext(request, locale, agentsById);

  const draftTurns: DraftTurn[] = [];
  const firstPhase = getTurnPhase(firstSpeakerId);
  const firstSections = getRoleDefinitionForAgent(firstSpeakerId, locale).outputFormat.sections;
  const firstResult = await callLLM(activeProvider, {
    agentId: firstSpeakerId,
    phase: firstPhase,
    agentSystemPrompt: `${agentsById[firstSpeakerId].systemPrompt}\n\n${sharedContext}`,
    history: request.history,
    locale,
    requiredSections: firstSections,
    message: buildTurnRequest({
      agentId: firstSpeakerId,
      locale,
      agentsById,
      message: request.message
    })
  });

  activeProvider = firstResult.provider;
  draftTurns.push({
    agentId: firstSpeakerId,
    phase: firstPhase,
    rawText: firstResult.text,
    visibleText: buildVisibleTurnText(firstSpeakerId, firstResult.text, locale),
    timestamp: isoNow(),
    provider: firstResult.provider
  });

  if (!mentionedAgentId) {
    const supportHistory = appendHistory(request.history, draftTurns[0]);
    const supportPhase = getTurnPhase(supportSpeakerId);
    const supportSections = getRoleDefinitionForAgent(supportSpeakerId, locale).outputFormat.sections;
    const supportResult = await callLLM(activeProvider, {
      agentId: supportSpeakerId,
      phase: supportPhase,
      agentSystemPrompt: `${agentsById[supportSpeakerId].systemPrompt}\n\n${sharedContext}`,
      history: supportHistory,
      locale,
      requiredSections: supportSections,
      message: buildTurnRequest({
        agentId: supportSpeakerId,
        locale,
        agentsById,
        message: request.message,
        teammateNote: firstResult.text
      })
    });

    activeProvider = supportResult.provider;
    draftTurns.push({
      agentId: supportSpeakerId,
      phase: supportPhase,
      rawText: supportResult.text,
      visibleText: buildVisibleTurnText(supportSpeakerId, supportResult.text, locale),
      timestamp: isoNow(),
      provider: supportResult.provider
    });
  }

  const usedOpenClawProvider = draftTurns.some((turn) => turn.provider === "openclaw");
  const actions = usedOpenClawProvider ? [] : detectRoundActions(request.message, draftTurns);

  let research: MeetingRoundResearch | undefined;
  let stopReason: MeetingRoundResponse["meta"]["stopReason"] = "conversation_complete";

  if (actions[0]) {
    const researchAgentId = chooseResearchAgent(request.message, firstSpeakerId, draftTurns, mentionedAgentId);
    research = await runMeetingResearchTask({
      agentId: researchAgentId,
      instruction: actions[0].instruction,
      url: actions[0].url,
      sessionId,
      locale
    });

    const finalHistory = draftTurns.reduce<ChatHistoryItem[]>(appendHistory, request.history);
    const finalSections = getRoleDefinitionForAgent(researchAgentId, locale).outputFormat.sections;
    const finalResult = await callLLM(activeProvider, {
      agentId: researchAgentId,
      phase: "summary",
      agentSystemPrompt: `${agentsById[researchAgentId].systemPrompt}\n\n${sharedContext}`,
      history: finalHistory,
      locale,
      requiredSections: finalSections,
      message: buildTurnRequest({
        agentId: researchAgentId,
        locale,
        agentsById,
        message: request.message,
        teammateNote: draftTurns[draftTurns.length - 1]?.rawText,
        researchContext: buildResearchContext(research, locale),
        finalize: true
      })
    });

    activeProvider = finalResult.provider;
    draftTurns.push({
      agentId: researchAgentId,
      phase: "summary",
      rawText: finalResult.text,
      visibleText: buildVisibleTurnText(researchAgentId, finalResult.text, locale),
      timestamp: isoNow(),
      provider: finalResult.provider
    });

    stopReason = research.task.status === "succeeded" ? "research_complete" : "research_failed";
  }

  const turns: MeetingTurn[] = draftTurns.map((turn) => ({
    id: uid("turn"),
    agentId: turn.agentId,
    speakerLabel: agentsById[turn.agentId].name,
    text: turn.visibleText,
    timestamp: turn.timestamp,
    provider: turn.provider,
    phase: turn.phase
  }));

  const finalSpeakerId = draftTurns[draftTurns.length - 1]?.agentId ?? firstSpeakerId;
  const researchAgentId = research?.task.agentId === "assistant" || research?.task.agentId === "analyst" ? research.task.agentId : undefined;
  const roundProvider = draftTurns[draftTurns.length - 1]?.provider ?? activeProvider;

  return {
    turns,
    minutes: buildMinutes({
      request,
      turns: draftTurns,
      sessionId,
      locale,
      research
    }),
    provider: roundProvider,
    meta: {
      firstSpeakerId,
      finalSpeakerId,
      usedResearch: Boolean(research),
      researchAgentId,
      researchStatus: research?.task.status,
      stopReason
    },
    research,
    actions
  };
}

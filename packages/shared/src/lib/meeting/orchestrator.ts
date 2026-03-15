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
  MeetingResponseMode,
  MeetingRoundRequest,
  MeetingRoundResearch,
  MeetingRoundResponse,
  MeetingRoundStreamEvent,
  MeetingSpeedMode,
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
  id: string;
  agentId: AgentId;
  phase: MeetingTurn["phase"];
  rawText: string;
  visibleText: string;
  timestamp: string;
  provider: MeetingTurn["provider"];
};

type RunMeetingRoundOptions = {
  onEvent?: (event: MeetingRoundStreamEvent) => void | Promise<void>;
};

const URL_PATTERN = /https?:\/\/[^\s)]+/i;
const ANALYST_LEAD_PATTERN =
  /(btc|bitcoin|eth|crypto|kospi|kosdaq|nasdaq|s&p|qqq|aapl|nvda|tsla|stock|chart|price|valuation|multiple|earnings|risk|volatility|macro|etf|실적|리스크|변동성|지수|차트|시세|밸류|주가|공시|뉴스)/i;
const ASSISTANT_LEAD_PATTERN =
  /(summary|summarize|decision|plan|action|what should|next step|recommend|buy or sell|요약|정리|결론|계획|액션|다음 단계|어떻게 할까|추천|사야|팔아)/i;
const RESEARCH_TRIGGER_PATTERN =
  /(browse|browser|openclaw|web|internet|search|look up|find|research|latest|news|filing|verify|source|url|link|기사|최신|출처|검증|링크|웹|브라우저|조사)/i;
const RESEARCH_FOLLOWUP_PATTERN =
  /(openclaw|browser follow-up|external verification|source verification|follow-up research|추가 조사 필요|추가 검증 필요|출처 확인 필요|링크 확인 필요|OpenClaw 연결)/i;
const HEADING_PATTERN = /^#{1,6}\s*/;
const FAST_MODE_MAX_TOKENS = 170;
const BALANCED_MODE_MAX_TOKENS = 240;

function trimText(value: string, maxLength = 260) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function otherAgent(agentId: AgentId): AgentId {
  return agentId === "assistant" ? "analyst" : "assistant";
}

function normalizeHeading(value: string) {
  return value.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").replace(/\*\*/g, "").replace(/:$/, "").trim();
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
    const matched = sectionNames.find((sectionName) => normalizeHeading(sectionName) === heading);
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
  agentsById: Record<AgentId, Agent>,
  limit = 2
) {
  if (history.length === 0) {
    return locale === "ko" ? "이전 대화 기록이 없습니다." : "There is no prior meeting history.";
  }

  return history
    .slice(-limit)
    .map((item) => {
      const speaker =
        item.role === "user"
          ? locale === "ko"
            ? "사용자"
            : "User"
          : agentsById[item.agent ?? "assistant"]?.name || (locale === "ko" ? "에이전트" : "Agent");
      return `- ${speaker}: ${trimText(item.content.replace(/\s+/g, " ").trim(), 180)}`;
    })
    .join("\n");
}

function renderMarketSnapshot(request: MeetingRoundRequest, locale: AppLocale) {
  if (!request.marketSnapshot) {
    return locale === "ko" ? "시장 스냅샷이 없습니다." : "No market snapshot was provided.";
  }

  const snapshot = request.marketSnapshot;
  const indexLines = snapshot.indices
    .slice(0, 2)
    .map((item) => `${item.symbol} ${item.price.toFixed(item.currency === "KRW" ? 0 : 2)} (${item.changePercent.toFixed(2)}%)`);
  const watchLines = snapshot.watchlist
    .slice(0, 2)
    .map((item) => `${item.symbol} ${item.price.toFixed(item.currency === "KRW" ? 0 : 2)} (${item.changePercent.toFixed(2)}%)`);

  return locale === "ko"
    ? [
        `활성 시장: ${snapshot.tab}`,
        `헤드라인: ${snapshot.headline}`,
        `제공자: ${snapshot.provider}`,
        indexLines.length > 0 ? `지수: ${indexLines.join(", ")}` : null,
        watchLines.length > 0 ? `관심 종목: ${watchLines.join(", ")}` : null
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Active market: ${snapshot.tab}`,
        `Headline: ${snapshot.headline}`,
        `Provider: ${snapshot.provider}`,
        indexLines.length > 0 ? `Indices: ${indexLines.join(", ")}` : null,
        watchLines.length > 0 ? `Watchlist: ${watchLines.join(", ")}` : null
      ]
        .filter(Boolean)
        .join("\n");
}

function renderPortfolio(snapshot?: PortfolioSnapshot | null, locale: AppLocale = DEFAULT_LOCALE) {
  if (!snapshot) {
    return locale === "ko" ? "포트폴리오 스냅샷이 없습니다." : "No portfolio snapshot was provided.";
  }

  const positions =
    snapshot.positions.length > 0
      ? snapshot.positions
          .slice(0, 2)
          .map((position) =>
            locale === "ko"
              ? `${position.symbol} ${position.quantity}주 / 손익 ${position.unrealizedPnlPercent.toFixed(2)}%`
              : `${position.symbol} ${position.quantity} shares / PnL ${position.unrealizedPnlPercent.toFixed(2)}%`
          )
          .join("; ")
      : locale === "ko"
        ? "보유 포지션 없음"
        : "No open positions";

  return locale === "ko"
    ? [`브로커: ${snapshot.broker}`, `현금: ${snapshot.cash.toFixed(0)} ${snapshot.currency}`, `포지션: ${positions}`].join("\n")
    : [`Broker: ${snapshot.broker}`, `Cash: ${snapshot.cash.toFixed(0)} ${snapshot.currency}`, `Positions: ${positions}`].join("\n");
}

function renderPriorMinutes(minutes?: MeetingMinutes | null, locale: AppLocale = DEFAULT_LOCALE) {
  if (!minutes) {
    return locale === "ko" ? "이전 회의록이 없습니다." : "There are no prior meeting minutes.";
  }

  return locale === "ko"
    ? [`요약: ${trimText(minutes.summary, 160)}`, `액션: ${minutes.actionItems[0] ?? "없음"}`].join("\n")
    : [`Summary: ${trimText(minutes.summary, 160)}`, `Action: ${minutes.actionItems[0] ?? "none"}`].join("\n");
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
  agentsById: Record<AgentId, Agent>,
  speedMode: MeetingSpeedMode
) {
  const isFastMode = speedMode === "fast";
  const prefix =
    locale === "ko"
      ? isFastMode
        ? "빠른 응답용 금융 컨텍스트입니다. 핵심만 읽고 바로 판단부터 말하세요."
        : "실시간 금융 회의용 요약 컨텍스트입니다. 핵심만 읽고 짧고 선명하게 답하세요."
      : isFastMode
        ? "Fast finance context. Read the essentials and lead with the judgment."
        : "Compact finance meeting context. Read the essentials and answer briefly.";

  const blocks = isFastMode
    ? [prefix, renderMarketSnapshot(request, locale), renderPortfolio(request.portfolioSnapshot, locale), renderHistory(request.history, locale, agentsById, 1)]
    : [
        prefix,
        renderMarketSnapshot(request, locale),
        renderPortfolio(request.portfolioSnapshot, locale),
        renderPriorMinutes(request.minutes, locale),
        locale === "ko" ? "근거 후보:" : "Candidate evidence:",
        renderSourceHints(request, locale),
        locale === "ko" ? "최근 대화:" : "Recent conversation:",
        renderHistory(request.history, locale, agentsById, 2)
      ];

  return blocks.join("\n\n");
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

function resolveRequestedAgents(message: string, responseMode: MeetingResponseMode | undefined, mentionedAgentId?: AgentId) {
  if (responseMode === "assistant") {
    return ["assistant"] as AgentId[];
  }

  if (responseMode === "analyst") {
    return ["analyst"] as AgentId[];
  }

  const firstSpeakerId = chooseFirstSpeaker(message, mentionedAgentId);
  if (responseMode === "both") {
    return [firstSpeakerId, otherAgent(firstSpeakerId)] as AgentId[];
  }

  return [firstSpeakerId] as AgentId[];
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

  const preferredLines = preferred.flatMap((block) => block.split(/\r?\n/)).map(compactDisplayLine).filter(Boolean);
  if (preferredLines.length > 0) {
    return preferredLines.slice(0, 3);
  }

  return rawText.split(/\r?\n/).map(compactDisplayLine).filter(Boolean).slice(0, 3);
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
  speedMode?: MeetingSpeedMode;
}) {
  const { agentId, locale, agentsById, message, teammateNote, researchContext, finalize, speedMode = "balanced" } = args;
  const counterpartName = agentsById[otherAgent(agentId)].name;
  const sections = getRoleDefinitionForAgent(agentId, locale).outputFormat.sections;
  const sectionBlock = sections.map((section) => `- ${section}`).join("\n");
  const teammateLabel = locale === "ko" ? `${counterpartName} 메모` : `${counterpartName} note`;
  const researchLabel = locale === "ko" ? "OpenClaw 조사 결과" : "OpenClaw findings";

  if (speedMode === "fast") {
    return locale === "ko"
      ? [
          `사용자 요청:\n${message}`,
          teammateNote ? `${teammateLabel}:\n${trimText(teammateNote, 220)}` : null,
          researchContext ? `${researchLabel}:\n${trimText(researchContext, 220)}` : null,
          finalize
            ? "빠른 최종 응답입니다. 제목 없이 2~3문장으로 답하고, 첫 문장에서 결론을 먼저 말하세요."
            : "빠른 응답 모드입니다. 제목 없이 2~3문장으로 답하고, 첫 문장에서 판단을 먼저 말하세요."
        ]
          .filter(Boolean)
          .join("\n\n")
      : [
          `User request:\n${message}`,
          teammateNote ? `${teammateLabel}:\n${trimText(teammateNote, 220)}` : null,
          researchContext ? `${researchLabel}:\n${trimText(researchContext, 220)}` : null,
          finalize
            ? "Fast final reply. No headings. Answer in two or three short sentences and lead with the conclusion."
            : "Fast reply mode. No headings. Answer in two or three short sentences and lead with the judgment."
        ]
          .filter(Boolean)
          .join("\n\n");
  }

  return locale === "ko"
    ? [
        `사용자 요청:\n${message}`,
        teammateNote ? `${teammateLabel}:\n${trimText(teammateNote, 420)}` : null,
        researchContext ? `${researchLabel}:\n${trimText(researchContext, 420)}` : null,
        "아래 섹션 제목을 그대로 사용하세요.",
        sectionBlock,
        finalize
          ? "최종 응답입니다. 각 섹션은 1문장 또는 1 bullet로만 쓰고, 인사는 넣지 마세요."
          : "실시간 회의용 답변입니다. 각 섹션은 1문장 또는 1 bullet로만 쓰세요."
      ]
        .filter(Boolean)
        .join("\n\n")
    : [
        `User request:\n${message}`,
        teammateNote ? `${teammateLabel}:\n${trimText(teammateNote, 420)}` : null,
        researchContext ? `${researchLabel}:\n${trimText(researchContext, 420)}` : null,
        "Use the exact section titles below.",
        sectionBlock,
        finalize
          ? "This is the final reply. Keep each section to one sentence or one bullet with no greeting."
          : "This is a live meeting reply. Keep each section to one sentence or one bullet."
      ]
        .filter(Boolean)
        .join("\n\n");
}

function chooseResearchAgent(
  message: string,
  firstSpeakerId: AgentId,
  draftTurns: DraftTurn[],
  requestedAgents: AgentId[],
  mentionedAgentId?: AgentId
): AgentId {
  if (requestedAgents.length === 1) {
    return requestedAgents[0];
  }
  if (mentionedAgentId) {
    return mentionedAgentId;
  }

  const latestResearchTurn = [...draftTurns].reverse().find((turn) => RESEARCH_TRIGGER_PATTERN.test(turn.rawText));
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
  const hasIntent = Boolean(url) || RESEARCH_TRIGGER_PATTERN.test(message);

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
    .map((item) => `${item.symbol} ${item.price.toFixed(item.currency === "KRW" ? 0 : 2)} (${item.changePercent.toFixed(2)}%)`);

  const tradeNotes = portfolio
    ? portfolio.positions.length > 0
      ? portfolio.positions.slice(0, 3).map((position) =>
          locale === "ko"
            ? `${position.symbol}: ${position.quantity}주, 평균 ${position.averagePrice.toFixed(0)}, 손익 ${position.unrealizedPnlPercent.toFixed(2)}%`
            : `${position.symbol}: ${position.quantity} shares, avg ${position.averagePrice.toFixed(0)}, PnL ${position.unrealizedPnlPercent.toFixed(2)}%`
        )
      : [locale === "ko" ? "현재 보유 포지션이 없습니다." : "There are no open positions in the paper portfolio."]
    : [locale === "ko" ? "매매 스냅샷을 불러오지 못했습니다." : "The trading snapshot could not be loaded."];

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
        : [locale === "ko" ? "이번 라운드에 저장된 시세가 없습니다." : "No market snapshot was saved in this round."],
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

async function emitRoundEvent(options: RunMeetingRoundOptions, event: MeetingRoundStreamEvent) {
  await options.onEvent?.(event);
}

export async function runMeetingRound(
  request: MeetingRoundRequest,
  options: RunMeetingRoundOptions = {}
): Promise<MeetingRoundResponse> {
  const roundStartedAt = Date.now();
  const locale = request.locale ?? DEFAULT_LOCALE;
  const speedMode = request.speedMode ?? "balanced";
  const isFastMode = speedMode === "fast";
  const agentsById = getAgentsById(locale, request.personaOverrides);
  const preferredProvider = pickProvider();
  let activeProvider = preferredProvider;
  const sessionId = request.minutes?.sessionId || uid("session");
  const mentionedAgentId = detectMentionedAgentId(request.message, locale, request.personaOverrides);
  const requestedAgents = resolveRequestedAgents(request.message, request.responseMode, mentionedAgentId);
  const firstSpeakerId = requestedAgents[0] ?? chooseFirstSpeaker(request.message, mentionedAgentId);
  const supportSpeakerId = requestedAgents[1];
  const sharedContext = buildSharedContext(request, locale, agentsById, speedMode);
  const draftTurns: DraftTurn[] = [];
  let providerMs = 0;
  let resolvedChatPath: string | undefined;

  await emitRoundEvent(options, {
    type: "start",
    ts: isoNow(),
    firstSpeakerId,
    responseMode: request.responseMode ?? "auto"
  });

  const runTurn = async (args: {
    agentId: AgentId;
    history: ChatHistoryItem[];
    message: string;
    phase?: MeetingTurn["phase"];
  }) => {
    const agentId = args.agentId;
    const turnId = uid("turn");
    const phase = args.phase ?? getTurnPhase(agentId);
    const sections = isFastMode ? undefined : getRoleDefinitionForAgent(agentId, locale).outputFormat.sections;

    await emitRoundEvent(options, {
      type: "turn_start",
      ts: isoNow(),
      turnId,
      agentId,
      phase,
      speakerLabel: agentsById[agentId].name,
      provider: activeProvider
    });

    const result = await callLLM(activeProvider, {
      agentId,
      phase,
      agentSystemPrompt: `${agentsById[agentId].systemPrompt}\n\n${sharedContext}`,
      history: args.history,
      locale,
      requiredSections: sections,
      maxTokens: isFastMode ? FAST_MODE_MAX_TOKENS : BALANCED_MODE_MAX_TOKENS,
      message: args.message,
      onPartialText: async (text) => {
        await emitRoundEvent(options, {
          type: "turn_partial",
          ts: isoNow(),
          turnId,
          agentId,
          phase,
          text,
          provider: activeProvider
        });
      }
    });

    activeProvider = result.provider;
    providerMs += result.elapsedMs ?? 0;
    if (result.resolvedPath) {
      resolvedChatPath = result.resolvedPath;
    }

    const draftTurn: DraftTurn = {
      id: turnId,
      agentId,
      phase,
      rawText: result.text,
      visibleText: buildVisibleTurnText(agentId, result.text, locale),
      timestamp: isoNow(),
      provider: result.provider
    };
    draftTurns.push(draftTurn);

    const turn: MeetingTurn = {
      id: draftTurn.id,
      agentId: draftTurn.agentId,
      speakerLabel: agentsById[draftTurn.agentId].name,
      text: draftTurn.visibleText,
      timestamp: draftTurn.timestamp,
      provider: draftTurn.provider,
      phase: draftTurn.phase
    };

    await emitRoundEvent(options, {
      type: "turn_complete",
      ts: isoNow(),
      turn
    });

    return draftTurn;
  };

  const firstTurn = await runTurn({
    agentId: firstSpeakerId,
    history: request.history,
    message: buildTurnRequest({
      agentId: firstSpeakerId,
      locale,
      agentsById,
      message: request.message,
      speedMode
    })
  });

  if (supportSpeakerId) {
    await runTurn({
      agentId: supportSpeakerId,
      history: appendHistory(request.history, firstTurn),
      message: buildTurnRequest({
        agentId: supportSpeakerId,
        locale,
        agentsById,
        message: request.message,
        teammateNote: firstTurn.rawText,
        speedMode
      })
    });
  }

  const usedOpenClawProvider = draftTurns.some((turn) => turn.provider === "openclaw");
  const actions = usedOpenClawProvider || isFastMode ? [] : detectRoundActions(request.message, draftTurns);

  let research: MeetingRoundResearch | undefined;
  let stopReason: MeetingRoundResponse["meta"]["stopReason"] = "conversation_complete";

  if (actions[0]) {
    const researchAction = actions[0];
    const researchAgentId = chooseResearchAgent(request.message, firstSpeakerId, draftTurns, requestedAgents, mentionedAgentId);

    await emitRoundEvent(options, {
      type: "research_start",
      ts: isoNow(),
      agentId: researchAgentId,
      instruction: researchAction.instruction,
      url: researchAction.url
    });

    research = await runMeetingResearchTask({
      agentId: researchAgentId,
      instruction: researchAction.instruction,
      url: researchAction.url,
      sessionId,
      locale
    });

    await emitRoundEvent(options, {
      type: "research_complete",
      ts: isoNow(),
      research
    });

    const finalHistory = draftTurns.reduce<ChatHistoryItem[]>(appendHistory, request.history);
    await runTurn({
      agentId: researchAgentId,
      phase: "summary",
      history: finalHistory,
      message: buildTurnRequest({
        agentId: researchAgentId,
        locale,
        agentsById,
        message: request.message,
        teammateNote: draftTurns[draftTurns.length - 1]?.rawText,
        researchContext: buildResearchContext(research, locale),
        finalize: true,
        speedMode
      })
    });

    stopReason = research.task.status === "succeeded" ? "research_complete" : "research_failed";
  }

  const turns: MeetingTurn[] = draftTurns.map((turn) => ({
    id: turn.id,
    agentId: turn.agentId,
    speakerLabel: agentsById[turn.agentId].name,
    text: turn.visibleText,
    timestamp: turn.timestamp,
    provider: turn.provider,
    phase: turn.phase
  }));

  const finalSpeakerId = draftTurns[draftTurns.length - 1]?.agentId ?? firstSpeakerId;
  const researchAgentId =
    research?.task.agentId === "assistant" || research?.task.agentId === "analyst" ? research.task.agentId : undefined;
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
      stopReason,
      timings: {
        providerMs,
        totalMs: Date.now() - roundStartedAt,
        resolvedChatPath
      }
    },
    research,
    actions
  };
}
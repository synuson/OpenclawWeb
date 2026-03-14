import { DEFAULT_LOCALE, getIntlLocale, type AppLocale } from "@/lib/i18n/config";
import { getAgentsById } from "@/lib/meeting/agents";
import {
  getActionItemFieldLabels,
  getRoleDefinitionForAgent,
  ROLE_SECTION_LABELS
} from "@/lib/meeting/role-definitions";
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

  return [formatActionItem({ task: trimText(userMessage, 90), owner: getActionItemFieldLabels(locale).tbd, dueAt: getActionItemFieldLabels(locale).tbd, status: "todo" }, locale)];
}

function firstSectionText(sections: ParsedSections, sectionName: string) {
  return (sections[sectionName] ?? []).join(" ").trim();
}

function renderHistory(history: ChatHistoryItem[], locale: AppLocale) {
  if (history.length === 0) {
    return locale === "ko" ? "이전 회의 대화가 없습니다." : "There is no prior meeting history.";
  }

  const agentsById = getAgentsById(locale);
  return history
    .slice(-8)
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
        ? "\uac1c\uc7a5"
        : "Open"
      : snapshot.session === "pre"
        ? locale === "ko"
          ? "\uc7a5\uc804"
          : "Pre-market"
        : snapshot.session === "post"
          ? locale === "ko"
            ? "\uc2dc\uac04\uc678"
            : "After-hours"
          : snapshot.session === "closed"
            ? locale === "ko"
              ? "\ud734\uc7a5"
              : "Closed"
            : locale === "ko"
              ? "\uc0c1\uc2dc"
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
      indexLines.length > 0 ? `지수: ${indexLines.join(", ")}` : "지수: 없음",
      watchLines.length > 0 ? `관심종목: ${watchLines.join(", ")}` : "관심종목: 없음",
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
              ? `${position.symbol} 수량 ${position.quantity}, 평균가 ${position.averagePrice.toFixed(0)}, 손익 ${position.unrealizedPnlPercent.toFixed(2)}%`
              : `${position.symbol} qty ${position.quantity}, avg ${position.averagePrice.toFixed(0)}, PnL ${position.unrealizedPnlPercent.toFixed(2)}%`
          )
          .join("; ")
      : locale === "ko"
        ? "보유 포지션 없음"
        : "No open positions";

  return locale === "ko"
    ? [
        `브로커: ${snapshot.broker} (${snapshot.mode})`,
        `예수금: ${snapshot.cash.toFixed(0)} ${snapshot.currency}`,
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

function buildMinutes(args: {
  request: MeetingRoundRequest;
  analystText: string;
  assistantText: string;
  sessionId: string;
  locale: AppLocale;
}): MeetingMinutes {
  const { locale } = args;
  const analystSectionsList = getRoleDefinitionForAgent("analyst", locale).outputFormat.sections;
  const facilitatorSectionsList = getRoleDefinitionForAgent("assistant", locale).outputFormat.sections;
  const sectionLabels = ROLE_SECTION_LABELS[locale];
  const snapshot = args.request.marketSnapshot;
  const portfolio = args.request.portfolioSnapshot;
  const analystSections = parseSections(args.analystText, analystSectionsList);
  const facilitatorSections = parseSections(args.assistantText, facilitatorSectionsList);
  const marketLines = [...(snapshot?.indices ?? []), ...(snapshot?.watchlist ?? [])]
    .slice(0, 4)
    .map(
      (item) => `${item.symbol} ${item.price.toFixed(item.currency === "KRW" ? 0 : 2)} (${item.changePercent.toFixed(2)}%)`
    );

  const tradeNotes = portfolio
    ? portfolio.positions.length > 0
      ? portfolio.positions.slice(0, 3).map((position) =>
          locale === "ko"
            ? `${position.symbol}: ${position.quantity}주, 평가손익 ${position.unrealizedPnlPercent.toFixed(2)}%`
            : `${position.symbol}: ${position.quantity} shares, unrealized PnL ${position.unrealizedPnlPercent.toFixed(2)}%`
        )
      : [
          locale === "ko"
            ? "모의 포트폴리오에 열린 포지션이 없습니다."
            : "There are no open positions in the paper portfolio."
        ]
    : [
        locale === "ko"
          ? "매매 스냅샷을 불러오지 못했습니다."
          : "The trading snapshot could not be loaded."
      ];

  return {
    sessionId: args.sessionId,
    title:
      locale === "ko"
        ? `${new Date().toLocaleDateString(getIntlLocale(locale))} 금융 회의록`
        : `${new Date().toLocaleDateString(getIntlLocale(locale))} Meeting Minutes`,
    updatedAt: isoNow(),
    activeTab: args.request.activeTab,
    summary: trimText(
      firstSectionText(facilitatorSections, sectionLabels.assistant.minutes) ||
        firstSectionText(facilitatorSections, sectionLabels.assistant.conclusion) ||
        args.assistantText,
      240
    ),
    marketSnapshot:
      marketLines.length > 0
        ? marketLines
        : [
            locale === "ko"
              ? "이번 라운드에서 저장된 시세가 없습니다."
              : "No market snapshot was saved in this round."
          ],
    keyPoints: [
      trimText(
        firstSectionText(analystSections, sectionLabels.analyst.recommendation) ||
          firstSectionText(analystSections, sectionLabels.analyst.metrics) ||
          args.analystText,
        220
      ),
      trimText(
        firstSectionText(facilitatorSections, sectionLabels.assistant.evidence) ||
          firstSectionText(facilitatorSections, sectionLabels.assistant.conclusion) ||
          args.assistantText,
        220
      )
    ],
    actionItems: extractActionItemsFromSections(facilitatorSections, args.request.message, locale),
    tradeNotes
  };
}

export async function runMeetingRound(request: MeetingRoundRequest): Promise<MeetingRoundResponse> {
  const locale = request.locale ?? DEFAULT_LOCALE;
  const agentsById = getAgentsById(locale);
  const analystSections = getRoleDefinitionForAgent("analyst", locale).outputFormat.sections;
  const facilitatorSections = getRoleDefinitionForAgent("assistant", locale).outputFormat.sections;
  const assistantLabels = ROLE_SECTION_LABELS[locale].assistant;
  const provider = pickProvider();
  const sessionId = request.minutes?.sessionId || uid("session");
  const sharedContext =
    locale === "ko"
      ? [
          "당신은 금융 회의실 안에 있습니다. 반드시 한국어로, 짧고 실무적으로 답하세요.",
          renderMarketSnapshot(request, locale),
          renderPortfolio(request.portfolioSnapshot, locale),
          renderPriorMinutes(request.minutes, locale),
          "근거 데이터 출처로 사용할 수 있는 후보:",
          renderSourceHints(request, locale),
          "최근 대화:",
          renderHistory(request.history, locale)
        ].join("\n\n")
      : [
          "You are inside a finance meeting room. Answer in concise, practical English.",
          renderMarketSnapshot(request, locale),
          renderPortfolio(request.portfolioSnapshot, locale),
          renderPriorMinutes(request.minutes, locale),
          "Candidate evidence sources:",
          renderSourceHints(request, locale),
          "Recent conversation:",
          renderHistory(request.history, locale)
        ].join("\n\n");

  const analystText = await callLLM(provider, {
    agentSystemPrompt: `${agentsById.analyst.systemPrompt}\n\n${sharedContext}`,
    history: request.history,
    locale,
    message:
      locale === "ko"
        ? [`사용자 요청:\n${request.message}`, "아래 섹션 제목을 그대로 사용하세요:", analystSections.map((section) => `- ${section}`).join("\n")].join("\n\n")
        : [`User request:\n${request.message}`, "Use the section titles below exactly as written:", analystSections.map((section) => `- ${section}`).join("\n")].join("\n\n")
  });

  const analystTurn: MeetingTurn = {
    id: uid("turn"),
    agentId: "analyst",
    speakerLabel: agentsById.analyst.name,
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
    agentSystemPrompt: `${agentsById.assistant.systemPrompt}\n\n${sharedContext}`,
    history: assistantHistory,
    locale,
    message:
      locale === "ko"
        ? [
            `사용자 요청:\n${request.message}`,
            `분석가 메모:\n${analystText}`,
            "아래 섹션 제목을 그대로 사용하세요:",
            facilitatorSections.map((section) => `- ${section}`).join("\n")
          ].join("\n\n")
        : [
            `User request:\n${request.message}`,
            `Analyst notes:\n${analystText}`,
            "Use the section titles below exactly as written:",
            facilitatorSections.map((section) => `- ${section}`).join("\n")
          ].join("\n\n")
  });

  const actions = detectBrowserActions(request.message);
  if (
    actions.length > 0 &&
    !/(openclaw|browser|research|browse|조사|웹|issue|follow-up)/i.test(assistantText)
  ) {
    assistantText = `${assistantText}\n\n## ${assistantLabels.unresolved}\n- ${
      locale === "ko"
        ? "추가 웹 조사가 필요하면 OpenClaw 후속 조사를 실행하세요."
        : "Run an OpenClaw follow-up if additional web research is needed."
    }`;
  }

  const assistantTurn: MeetingTurn = {
    id: uid("turn"),
    agentId: "assistant",
    speakerLabel: agentsById.assistant.name,
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
      sessionId,
      locale
    }),
    provider,
    actions
  };
}

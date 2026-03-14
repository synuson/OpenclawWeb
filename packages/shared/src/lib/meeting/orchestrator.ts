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
const FACILITATOR_ACTION_SECTION = FACILITATOR_SECTIONS[2] ?? "";
const FACILITATOR_SUMMARY_SECTION = FACILITATOR_SECTIONS[4] ?? "";
const FACILITATOR_CONCLUSION_SECTION = FACILITATOR_SECTIONS[0] ?? "";
const FACILITATOR_RATIONALE_SECTION = FACILITATOR_SECTIONS[1] ?? "";
const ANALYST_SUMMARY_SECTION = ANALYST_SECTIONS[0] ?? "";
const ANALYST_RECOMMENDATION_SECTION = ANALYST_SECTIONS[4] ?? "";
const ACTION_LABEL = "\uc791\uc5c5";
const OWNER_LABEL = "\ub2f4\ub2f9";
const DUE_LABEL = "\uae30\ud55c";
const STATUS_LABEL = "\uc0c1\ud0dc";
const TBD = "TBD";

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
  if (!raw || raw.toUpperCase() === TBD) {
    return TBD;
  }

  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? TBD : new Date(timestamp).toISOString();
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

  const task = fields.get(ACTION_LABEL) || cleaned || "\ud6c4\uc18d \ud655\uc778";
  const owner = fields.get(OWNER_LABEL) || TBD;
  const dueAt = parseDueAt(fields.get(DUE_LABEL));
  const status = fields.get(STATUS_LABEL);

  return {
    task,
    owner,
    dueAt,
    status: status === "doing" || status === "done" ? status : "todo"
  };
}

function formatActionItem(item: NormalizedActionItem) {
  return `${ACTION_LABEL}: ${item.task} | ${OWNER_LABEL}: ${item.owner || TBD} | ${DUE_LABEL}: ${item.dueAt || TBD} | ${STATUS_LABEL}: ${item.status}`;
}

function extractActionItemsFromSections(sections: ParsedSections, userMessage: string) {
  const lines = sections[FACILITATOR_ACTION_SECTION] ?? [];
  if (lines.length > 0) {
    return lines.map(parseActionItemLine).map(formatActionItem);
  }

  return [formatActionItem({ task: trimText(userMessage, 90), owner: TBD, dueAt: TBD, status: "todo" })];
}

function firstSectionText(sections: ParsedSections, sectionName: string) {
  return (sections[sectionName] ?? []).join(" ").trim();
}

function renderHistory(history: ChatHistoryItem[]) {
  if (history.length === 0) {
    return "No prior meeting conversation.";
  }

  return history
    .slice(-8)
    .map((item) => {
      const speaker = item.role === "user" ? "User" : AGENTS_BY_ID[item.agent ?? "assistant"]?.name || "Agent";
      return `- ${speaker}: ${item.content}`;
    })
    .join("\n");
}

function renderMarketSnapshot(request: MeetingRoundRequest) {
  if (!request.marketSnapshot) {
    return "Market snapshot was not provided.";
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
    `Active tab: ${snapshot.tab}`,
    `Headline: ${snapshot.headline}`,
    `Provider: ${snapshot.provider}`,
    indexLines.length > 0 ? `Indices: ${indexLines.join(", ")}` : "Indices: none",
    watchLines.length > 0 ? `Watchlist: ${watchLines.join(", ")}` : "Watchlist: none",
    snapshot.notes.length > 0 ? `Notes: ${snapshot.notes.join(" | ")}` : "Notes: none"
  ].join("\n");
}

function renderPortfolio(snapshot?: PortfolioSnapshot | null) {
  if (!snapshot) {
    return "Portfolio snapshot was not provided.";
  }

  const positions =
    snapshot.positions.length > 0
      ? snapshot.positions
          .slice(0, 5)
          .map(
            (position) =>
              `${position.symbol} qty ${position.quantity}, avg ${position.averagePrice.toFixed(0)}, pnl ${position.unrealizedPnlPercent.toFixed(2)}%`
          )
          .join("; ")
      : "No open positions";

  return [
    `Broker: ${snapshot.broker} (${snapshot.mode})`,
    `Cash: ${snapshot.cash.toFixed(0)} ${snapshot.currency}`,
    `Equity: ${snapshot.equity.toFixed(0)} ${snapshot.currency}`,
    `Positions: ${positions}`
  ].join("\n");
}

function renderPriorMinutes(minutes?: MeetingMinutes | null) {
  if (!minutes) {
    return "No previous meeting minutes.";
  }

  return [
    `Summary: ${minutes.summary}`,
    `Action items: ${minutes.actionItems.join("; ") || "none"}`,
    `Trade notes: ${minutes.tradeNotes.join("; ") || "none"}`
  ].join("\n");
}

function collectSourceLabels(request: MeetingRoundRequest) {
  const labels = ["\uc571 \uc2a4\ub0c5\uc0f7"];

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
            (position) => `${position.symbol}: ${position.quantity}\uc8fc \ud3c9\uade0 \uc190\uc775 ${position.unrealizedPnlPercent.toFixed(2)}%`
          )
      : ["\ubaa8\uc758 \ud3ec\ud2b8\ud3f4\ub9ac\uc624\uc5d0 \uc5f4\ub9b0 \ud3ec\uc9c0\uc158\uc774 \uc5c6\uc2b5\ub2c8\ub2e4."]
    : ["\ub9e4\ub9e4 \uc2a4\ub0c5\uc0f7\uc744 \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4."];

  return {
    sessionId: args.sessionId,
    title: `${new Date().toLocaleDateString("ko-KR")} \uae08\uc735 \ud68c\uc758\ub85d`,
    updatedAt: isoNow(),
    activeTab: args.request.activeTab,
    summary: trimText(
      firstSectionText(facilitatorSections, FACILITATOR_SUMMARY_SECTION) ||
        firstSectionText(facilitatorSections, FACILITATOR_CONCLUSION_SECTION) ||
        args.assistantText,
      240
    ),
    marketSnapshot: marketLines.length > 0 ? marketLines : ["\uc774\ubc88 \ub77c\uc6b4\ub4dc\uc5d0\ub294 \uc694\uc57d\ud560 \uc2dc\uc138\uac00 \uc5c6\uc2b5\ub2c8\ub2e4."],
    keyPoints: [
      trimText(
        firstSectionText(analystSections, ANALYST_RECOMMENDATION_SECTION) ||
          firstSectionText(analystSections, ANALYST_SUMMARY_SECTION) ||
          args.analystText,
        220
      ),
      trimText(
        firstSectionText(facilitatorSections, FACILITATOR_RATIONALE_SECTION) ||
          firstSectionText(facilitatorSections, FACILITATOR_CONCLUSION_SECTION) ||
          args.assistantText,
        220
      )
    ],
    actionItems: extractActionItemsFromSections(facilitatorSections, args.request.message),
    tradeNotes
  };
}

export async function runMeetingRound(request: MeetingRoundRequest): Promise<MeetingRoundResponse> {
  const preferredProvider = pickProvider();
  const sessionId = request.minutes?.sessionId || uid("session");
  const sharedContext = [
    "You are inside a financial meeting room. Respond in Korean and stay concise.",
    renderMarketSnapshot(request),
    renderPortfolio(request.portfolioSnapshot),
    renderPriorMinutes(request.minutes),
    "Available evidence labels:",
    renderSourceHints(request),
    "Recent conversation:",
    renderHistory(request.history)
  ].join("\n\n");

  const analystResult = await callLLM(preferredProvider, {
    agentId: "analyst",
    phase: "analysis",
    agentSystemPrompt: `${AGENTS_BY_ID.analyst.systemPrompt}\n\n${sharedContext}`,
    history: request.history,
    requiredSections: ANALYST_SECTIONS,
    message: [
      `User request:\n${request.message}`,
      "Use the exact section titles below.",
      ANALYST_SECTIONS.map((section) => `- ${section}`).join("\n")
    ].join("\n\n")
  });

  const analystTurn: MeetingTurn = {
    id: uid("turn"),
    agentId: "analyst",
    speakerLabel: AGENTS_BY_ID.analyst.name,
    text: analystResult.text,
    timestamp: isoNow(),
    provider: analystResult.provider,
    phase: "analysis"
  };

  const assistantHistory: ChatHistoryItem[] = [
    ...request.history,
    {
      role: "assistant",
      agent: "analyst",
      content: analystResult.text
    }
  ];

  let assistantResult = await callLLM(preferredProvider, {
    agentId: "assistant",
    phase: "summary",
    agentSystemPrompt: `${AGENTS_BY_ID.assistant.systemPrompt}\n\n${sharedContext}`,
    history: assistantHistory,
    requiredSections: FACILITATOR_SECTIONS,
    message: [
      `User request:\n${request.message}`,
      `Analyst note:\n${analystResult.text}`,
      "Use the exact section titles below.",
      FACILITATOR_SECTIONS.map((section) => `- ${section}`).join("\n")
    ].join("\n\n")
  });

  const usedOpenClawProvider = analystResult.provider === "openclaw" || assistantResult.provider === "openclaw";
  const actions = usedOpenClawProvider ? [] : detectBrowserActions(request.message);
  const needsResearchHint = actions.length > 0 && !/(OpenClaw|research|browse|web)/i.test(assistantResult.text);

  if (needsResearchHint) {
    assistantResult = {
      ...assistantResult,
      text: `${assistantResult.text}\n\n## ${FACILITATOR_SECTIONS[3]}\n- \ucd94\uac00 \uc6f9 \uc870\uc0ac\uac00 \ud544\uc694\ud558\uba74 OpenClaw \uc870\uc0ac \ud328\ub110\uc5d0\uc11c \ud6c4\uc18d \ud655\uc778\uc744 \uc9c4\ud589\ud558\uc138\uc694.`
    };
  }

  const assistantTurn: MeetingTurn = {
    id: uid("turn"),
    agentId: "assistant",
    speakerLabel: AGENTS_BY_ID.assistant.name,
    text: assistantResult.text,
    timestamp: isoNow(),
    provider: assistantResult.provider,
    phase: "summary"
  };

  return {
    turns: [analystTurn, assistantTurn],
    minutes: buildMinutes({
      request,
      analystText: analystResult.text,
      assistantText: assistantResult.text,
      sessionId
    }),
    provider: assistantResult.provider,
    actions
  };
}

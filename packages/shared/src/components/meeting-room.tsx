"use client";

import { startTransition, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import {
  APP_LOCALE_COOKIE,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type AppLocale
} from "@/lib/i18n/config";
import { getAgents, getAgentsById, getDefaultAgentPersonas } from "@/lib/meeting/agents";
import type {
  AgentId,
  AgentStatus,
  AgentAvatarPreset,
  AgentAvatarVariant,
  AgentPersonaOverrides,
  AutoSpeakMode,
  Capabilities,
  ChatHistoryItem,
  OpenClawConnectionProbe,
  MeetingMinutes,
  MeetingRoundRequest,
  MeetingRoundResponse,
  MeetingResponseMode,
  MeetingSpeedMode,
  MeetingRoundStreamEvent,
  MeetingSessionRecord,
  MeetingTask,
  MeetingTaskArtifacts,
  MeetingTimelineItem,
  MarketSnapshot,
  MarketSessionState,
  PortfolioSnapshot,
  Provider,
  SpeechMode,
  TradeOrder,
  TradeOrderRequest,
  TtsMode,
  WorkspaceTab
} from "@/lib/meeting/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDictionary, labelForBadge, labelForOrderSide, labelForOrderType } from "@/lib/i18n/messages";
import {
  clamp,
  cn,
  formatCurrency,
  formatNumber,
  formatSignedNumber,
  formatSignedPercent,
  formatTime,
  uid
} from "@/lib/utils";

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  start: () => void;
  stop: () => void;
};

type TradeFormState = {
  symbol: string;
  side: TradeOrderRequest["side"];
  orderType: TradeOrderRequest["orderType"];
  quantity: string;
  limitPrice: string;
};

type DockTab = "session" | "minutes" | "research";

const MINUTES_STORAGE_KEY = "openclawweb.minutes.v1";
const PERSONA_STORAGE_KEY = "openclawweb.personas.v1";
const KR_DEFAULT_SYMBOLS = ["005930", "000660", "035420"];
const US_DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA"];
const WORKSPACE_TAB_MONOGRAMS: Record<WorkspaceTab, string> = {
  btc: "BTC",
  kr: "KR",
  us: "US",
  trading: "TR"
};
const LARGE_SELECT_CLASS_NAME =
  "h-11 rounded-full border border-ink/10 bg-white px-4 text-sm text-ink shadow-[0_12px_28px_rgba(18,24,36,0.05)] outline-none transition focus:border-cobalt/35 focus:ring-4 focus:ring-cobalt/10";
const SMALL_SELECT_CLASS_NAME =
  "h-9 rounded-full border border-ink/10 bg-white px-3 text-xs text-ink shadow-[0_10px_20px_rgba(18,24,36,0.05)] outline-none transition focus:border-cobalt/35 focus:ring-4 focus:ring-cobalt/10";
type MetricTone = "default" | "cobalt" | "mint" | "ember";
type MeetingCopy = ReturnType<typeof getDictionary>;
type ResponseModeOption = { value: MeetingResponseMode; label: string };
type SpeedModeOption = { value: MeetingSpeedMode; label: string };

const PERSONA_AVATAR_THEMES: Record<
  AgentAvatarVariant,
  {
    label: { ko: string; en: string };
    shellClass: string;
    haloClass: string;
    badgeClass: string;
    avatarClass: string;
    previewClass: string;
  }
> = {
  aurora: {
    label: { ko: "오로라", en: "Aurora" },
    shellClass: "bg-white",
    haloClass: "hidden",
    badgeClass: "border-emerald-200/70 bg-emerald-50 text-ink",
    avatarClass: "border-emerald-200 bg-emerald-50 text-ink",
    previewClass: "border-t-4 border-emerald-300 bg-white"
  },
  graphite: {
    label: { ko: "그래파이트", en: "Graphite" },
    shellClass: "bg-white",
    haloClass: "hidden",
    badgeClass: "border-slate-200 bg-slate-50 text-ink",
    avatarClass: "border-slate-200 bg-slate-50 text-ink",
    previewClass: "border-t-4 border-slate-300 bg-white"
  },
  sunset: {
    label: { ko: "선셋", en: "Sunset" },
    shellClass: "bg-white",
    haloClass: "hidden",
    badgeClass: "border-amber-200 bg-amber-50 text-ink",
    avatarClass: "border-amber-200 bg-amber-50 text-ink",
    previewClass: "border-t-4 border-amber-300 bg-white"
  },
  lagoon: {
    label: { ko: "라군", en: "Lagoon" },
    shellClass: "bg-white",
    haloClass: "hidden",
    badgeClass: "border-cyan-200 bg-cyan-50 text-ink",
    avatarClass: "border-cyan-200 bg-cyan-50 text-ink",
    previewClass: "border-t-4 border-cyan-300 bg-white"
  }
};

const PERSONA_AVATAR_PRESETS: Record<
  AgentAvatarPreset,
  {
    label: { ko: string; en: string };
  }
> = {
  core: {
    label: { ko: "코어", en: "Core" }
  },
  orbit: {
    label: { ko: "오빗", en: "Orbit" }
  },
  signal: {
    label: { ko: "시그널", en: "Signal" }
  },
  grid: {
    label: { ko: "그리드", en: "Grid" }
  }
};
function getResponseModeOptions(locale: AppLocale, assistantLabel: string, analystLabel: string): ResponseModeOption[] {
  return locale === "ko"
    ? [
        { value: "auto", label: "자동" },
        { value: "analyst", label: `${analystLabel}만` },
        { value: "assistant", label: `${assistantLabel}만` },
        { value: "both", label: "둘 다" }
      ]
    : [
        { value: "auto", label: "Auto" },
        { value: "analyst", label: `${analystLabel} only` },
        { value: "assistant", label: `${assistantLabel} only` },
        { value: "both", label: "Both" }
      ];
}

function getResponseModeCaption(mode: MeetingResponseMode, options: ResponseModeOption[], locale: AppLocale) {
  const label = options.find((option) => option.value === mode)?.label ?? options[0]?.label ?? "";
  return locale === "ko" ? `답변 대상: ${label}` : `Reply target: ${label}`;
}

function getSpeedModeOptions(locale: AppLocale): SpeedModeOption[] {
  return locale === "ko"
    ? [
        { value: "fast", label: "빠른 응답" },
        { value: "balanced", label: "정식 회의" }
      ]
    : [
        { value: "fast", label: "Fast reply" },
        { value: "balanced", label: "Full meeting" }
      ];
}

function getSpeedModeCaption(mode: MeetingSpeedMode, options: SpeedModeOption[], locale: AppLocale) {
  const label = options.find((option) => option.value === mode)?.label ?? options[0]?.label ?? "";
  return locale === "ko" ? `응답 모드: ${label}` : `Response mode: ${label}`;
}
function getPendingAgentStatus(mode: MeetingResponseMode): Record<AgentId, AgentStatus> {
  if (mode === "assistant") {
    return { assistant: "thinking", analyst: "idle" };
  }

  if (mode === "analyst") {
    return { assistant: "idle", analyst: "thinking" };
  }

  return { assistant: "thinking", analyst: "thinking" };
}

const MARKET_SESSION_LABELS: Record<AppLocale, Record<Exclude<MarketSessionState, "always">, string>> = {
  ko: {
    open: "개장",
    pre: "장전",
    post: "시간외",
    closed: "휴장"
  },
  en: {
    open: "Open",
    pre: "Pre-market",
    post: "After-hours",
    closed: "Closed"
  }
};

function labelForMarketSession(session: MarketSessionState | undefined, locale: AppLocale) {
  if (!session || session === "always") {
    return "";
  }

  return MARKET_SESSION_LABELS[locale][session];
}

function describeMarketSession(session: MarketSessionState | undefined, locale: AppLocale) {
  switch (session) {
    case "closed":
      return locale === "ko" ? "시장 휴장 · 마지막 종가 기준" : "Market closed · last close";
    case "pre":
      return locale === "ko" ? "장전 시세 구간" : "Pre-market session";
    case "post":
      return locale === "ko" ? "시간외 시세 구간" : "After-hours session";
    case "open":
      return locale === "ko" ? "정규장 진행 중" : "Regular session";
    default:
      return "";
  }
}

function getSnapshotUpdatedLabel(
  snapshot: MarketSnapshot | null,
  locale: AppLocale,
  fallbackLabel: string
) {
  if (snapshot?.session === "closed") {
    return locale === "ko" ? "마지막 종가" : "Last close";
  }

  if (snapshot?.session === "post") {
    return locale === "ko" ? "최신 체결" : "Latest trade";
  }

  return fallbackLabel;
}

function getSnapshotMetaDetail(snapshot: MarketSnapshot | null, locale: AppLocale) {
  if (!snapshot) {
    return "";
  }

  return [describeMarketSession(snapshot.session, locale), snapshot.provider].filter(Boolean).join(" · ");
}

function getMarketProviderLabel(snapshot: MarketSnapshot | null, copy: ReturnType<typeof getDictionary>) {
  if (!snapshot) {
    return copy.meeting.providerNames.demo;
  }

  const providerNames = copy.meeting.providerNames as Record<string, string>;
  return providerNames[snapshot.provider] ?? snapshot.provider;
}

function getMarketHeadline(
  snapshot: MarketSnapshot | null,
  activeTab: WorkspaceTab,
  copy: ReturnType<typeof getDictionary>,
  tabLabels: Record<WorkspaceTab, string>
) {
  if (activeTab === "btc") {
    return copy.meeting.btckrw;
  }

  if (activeTab === "trading") {
    return copy.meeting.paperTrade;
  }

  return snapshot?.headline && copy.app.lang === "en" ? snapshot.headline : tabLabels[activeTab];
}

function getSnapshotSummary(
  snapshot: MarketSnapshot | null,
  copy: ReturnType<typeof getDictionary>,
  locale: AppLocale
) {
  if (!snapshot) {
    return copy.meeting.noFeedNotes;
  }

  const lines = [];
  if (snapshot.session === "closed") {
    lines.push(copy.meeting.marketClosedNote);
  } else if (snapshot.session === "pre") {
    lines.push(copy.meeting.marketPreNote);
  } else if (snapshot.session === "post") {
    lines.push(copy.meeting.marketPostNote);
  } else {
    lines.push(copy.meeting.marketLiveNote);
  }

  if (snapshot.status === "demo") {
    lines.push(copy.meeting.marketDemoNote);
  } else if (snapshot.delayed || snapshot.status === "delayed") {
    lines.push(copy.meeting.marketDelayedNote);
  }

  lines.push(copy.meeting.marketFeedNote(getMarketProviderLabel(snapshot, copy)));

  return lines.join(" ");
}

function formatMarketVolume(value: number | undefined, locale: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "--";
  }

  return new Intl.NumberFormat(locale, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10_000 ? 1 : 0
  }).format(value);
}

function createTimelineItem(item: Omit<MeetingTimelineItem, "id"> & { id?: string }): MeetingTimelineItem {
  return { id: item.id ?? uid("timeline"), ...item };
}


async function fetchMeetingRoundStream(
  request: MeetingRoundRequest,
  onEvent: (event: MeetingRoundStreamEvent) => void | Promise<void>
) {
  const requestInit: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    cache: "no-store"
  };

  const response = await fetch("/api/meeting/round/stream", requestInit);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `${response.status}`);
  }

  if (!response.body) {
    const fallback = await fetch("/api/meeting/round", requestInit);
    if (!fallback.ok) {
      const text = await fallback.text().catch(() => "");
      throw new Error(text || `${fallback.status}`);
    }
    return (await fallback.json()) as MeetingRoundResponse;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse: MeetingRoundResponse | null = null;

  const flushLine = async (line: string) => {
    if (!line.trim()) {
      return;
    }

    const event = JSON.parse(line) as MeetingRoundStreamEvent;
    if (event.type === "final") {
      finalResponse = event.response;
      return;
    }

    if (event.type === "error") {
      throw new Error(event.message);
    }

    await onEvent(event);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n");
    while (boundary !== -1) {
      const line = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 1);
      await flushLine(line);
      boundary = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    await flushLine(buffer.trim());
  }

  if (!finalResponse) {
    throw new Error("Meeting stream ended before the final response arrived.");
  }

  return finalResponse;
}

function pickSpeechMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find(
    (candidate) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)
  );
}

function buildPersonaState(locale: AppLocale, source?: AgentPersonaOverrides | null): AgentPersonaOverrides {
  const defaults = getDefaultAgentPersonas(locale);
  return {
    assistant: { ...defaults.assistant, ...source?.assistant },
    analyst: { ...defaults.analyst, ...source?.analyst }
  };
}

function readStoredPersonas(locale: AppLocale) {
  if (typeof window === "undefined") {
    return buildPersonaState(locale);
  }

  try {
    const raw = window.localStorage.getItem(PERSONA_STORAGE_KEY);
    if (!raw) {
      return buildPersonaState(locale);
    }

    return buildPersonaState(locale, JSON.parse(raw) as AgentPersonaOverrides);
  } catch {
    return buildPersonaState(locale);
  }
}

function persistPersonas(personas: AgentPersonaOverrides) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PERSONA_STORAGE_KEY, JSON.stringify(personas));
}

function getAgentMonogram(name: string) {
  return Array.from(name.trim() || "AI")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function AgentAvatarBadge({
  name,
  preset,
  themeClass,
  size = "md"
}: {
  name: string;
  preset: AgentAvatarPreset;
  themeClass: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg"
      ? "h-[4.5rem] w-[4.5rem] rounded-[24px]"
      : size === "sm"
        ? "h-11 w-11 rounded-[16px]"
        : "h-12 w-12 rounded-[18px]";
  const monogram = getAgentMonogram(name);
  const chipClass = size === "lg" ? "bottom-1.5 right-1.5 px-1.5 py-0.5 text-[9px]" : "bottom-1 right-1 px-1 py-0 text-[8px]";

  return (
    <div className={cn("relative overflow-hidden border", sizeClass, themeClass)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.9),transparent_62%)]" />
      {preset === "core" ? (
        <>
          <div className="absolute inset-[22%] rounded-full border border-ink/12" />
          <div className="absolute inset-0 grid place-items-center">
            <div className="h-5 w-5 rounded-full bg-ink/78" />
          </div>
        </>
      ) : null}
      {preset === "orbit" ? (
        <>
          <div className="absolute inset-[20%] rounded-full border border-ink/16" />
          <div className="absolute left-[28%] top-[28%] h-4 w-4 rounded-full bg-ink/72" />
          <div className="absolute right-[24%] top-[22%] h-2.5 w-2.5 rounded-full bg-ink/40" />
        </>
      ) : null}
      {preset === "signal" ? (
        <div className="absolute inset-0 flex items-end justify-center gap-1 px-3 pb-3">
          <span className="w-1.5 rounded-full bg-ink/40" style={{ height: "34%" }} />
          <span className="w-1.5 rounded-full bg-ink/58" style={{ height: "52%" }} />
          <span className="w-1.5 rounded-full bg-ink/76" style={{ height: "72%" }} />
          <span className="w-1.5 rounded-full bg-ink/58" style={{ height: "46%" }} />
        </div>
      ) : null}
      {preset === "grid" ? (
        <div className="absolute inset-0 grid grid-cols-2 gap-1 p-3">
          <span className="rounded-[6px] bg-ink/76" />
          <span className="rounded-[6px] bg-ink/40" />
          <span className="rounded-[6px] bg-ink/52" />
          <span className="rounded-[6px] bg-ink/22" />
        </div>
      ) : null}
      <span className={cn("absolute rounded-full border border-ink/10 bg-white font-semibold tracking-[0.08em] text-ink", chipClass)}>
        {monogram}
      </span>
    </div>
  );
}

function dockPanelCopy(locale: AppLocale) {
  return locale === "ko"
    ? {
        stageNotice: "메시지를 보내면 적합한 AI가 먼저 답하고, 필요하면 조사까지 이어집니다.",
        liveScriptEyebrow: "라이브 스크립트",
        liveScriptTitle: "회의 대화",
        liveScriptDescription: "메인 발표 흐름과 실제 채팅을 한 스트림으로 정리합니다.",
        autoRouting: "AI 자동 라우팅",
        userCameraEyebrow: "내 카메라",
        userCameraTitle: "로컬 화면",
        userCameraDescription: "내 카메라 미리보기는 오른쪽 아래에 고정됩니다.",
        dockEyebrow: "도킹 패널",
        dockTitle: "편집 / 회의록 / 조사",
        dockDescription: "오른쪽 패널에서 AI 페르소나, 회의록, 조사 결과를 빠르게 확인합니다.",
        dockTabs: {
          session: "편집",
          minutes: "회의록",
          research: "조사기록"
        } satisfies Record<DockTab, string>,
        dockOpen: "패널 열림",
        dockClosed: "패널 닫힘",
        openDock: "열기",
        closeDock: "접기",
        personaEyebrow: "AI 페르소나 편집",
        personaTitle: "이름 / 말투 / 카드",
        personaDescription: "서윤과 이안의 표시 이름, 말투, 아바타 프리셋, 카드 테마를 조정합니다.",
        displayNameLabel: "이름",
        toneLabel: "말투",
        avatarLabel: "아바타",
        avatarToneLabel: "카드 테마",
        resetPersona: "초기화",
        sessionActivity: "편집 로그",
        sessionEmpty: "아직 편집 기록이 없습니다.",
        sessionWorkspace: "활성 시장",
        sessionParticipants: "표시 인원",
        sessionSavedAt: "최근 회의록",
        localeLabel: "언어",
        openSettings: "설정",
        minutesHistory: "저장된 회의록",
        researchNotes: "조사 메모",
        researchHistory: "조사 기록",
        researchStatus: "조사 상태",
        marketHubEyebrow: "시장 허브",
        marketHubDescription: "왼쪽에서 시장을 보고, 오른쪽에서 결정과 기록을 이어갑니다.",
        meetingOverviewTitle: "Workspace"
      }
    : {
        stageNotice: "When you send a message, the right AI responds first and research follows if needed.",
        liveScriptEyebrow: "Live script",
        liveScriptTitle: "Meeting transcript",
        liveScriptDescription: "Keep the main speaking flow and the actual chat in one stream.",
        autoRouting: "AI auto routing",
        userCameraEyebrow: "My camera",
        userCameraTitle: "Local view",
        userCameraDescription: "Your local camera preview stays pinned in the lower-right area.",
        dockEyebrow: "Docked panel",
        dockTitle: "Edit / Minutes / Research",
        dockDescription: "Use the right dock to adjust personas, review minutes, and inspect research.",
        dockTabs: {
          session: "Edit",
          minutes: "Minutes",
          research: "Research"
        } satisfies Record<DockTab, string>,
        dockOpen: "Dock open",
        dockClosed: "Dock closed",
        openDock: "Open",
        closeDock: "Collapse",
        personaEyebrow: "AI persona",
        personaTitle: "Name / tone / card",
        personaDescription: "Change the visible name, tone, avatar preset, and card theme for Seoyun and Ian.",
        displayNameLabel: "Name",
        toneLabel: "Tone",
        avatarLabel: "Avatar",
        avatarToneLabel: "Card theme",
        resetPersona: "Reset",
        sessionActivity: "Edit log",
        sessionEmpty: "No edit history yet.",
        sessionWorkspace: "Active market",
        sessionParticipants: "Visible participants",
        sessionSavedAt: "Latest minutes",
        localeLabel: "Language",
        openSettings: "Settings",
        minutesHistory: "Saved minutes",
        researchNotes: "Research notes",
        researchHistory: "Research history",
        researchStatus: "Research status",
        marketHubEyebrow: "Market hub",
        marketHubDescription: "Keep market selection on the left and decisions on the right.",
        meetingOverviewTitle: "Workspace"
      };
}

function extractHistory(items: MeetingTimelineItem[]): ChatHistoryItem[] {
  return items
    .filter((item) => item.kind === "message" && (item.speakerType === "user" || item.speakerType === "agent"))
    .slice(-4)
    .map((item) =>
      item.speakerType === "user"
        ? { role: "user", content: item.text }
        : { role: "assistant", content: item.text, agent: item.agentId }
    );
}

function extractTurns(items: MeetingTimelineItem[]) {
  return items
    .filter((item) => item.kind === "message" && item.speakerType === "agent" && item.agentId)
    .map((item) => ({
      id: item.id,
      agentId: item.agentId as AgentId,
      speakerLabel: item.speakerLabel,
      text: item.text,
      timestamp: item.ts,
      provider: (item.provider ?? "mock") as Provider,
      phase: (item.badge === "summary" ? "summary" : "analysis") as "summary" | "analysis"
    }));
}

function findLatestAgentMessage(items: MeetingTimelineItem[], agentId: AgentId) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const candidate = items[index];
    if (candidate.agentId === agentId) {
      return candidate.text;
    }
  }

  return undefined;
}

function buildMinutesMarkdown(
  minutes: MeetingMinutes,
  timeline: MeetingTimelineItem[],
  copy: ReturnType<typeof getDictionary>,
  tabLabels: Record<WorkspaceTab, string>
) {
  const lines = [
    `# ${minutes.title}`,
    "",
    `${copy.markdown.updated}: ${new Date(minutes.updatedAt).toLocaleString(copy.app.dateLocale)}`,
    `${copy.markdown.workspace}: ${tabLabels[minutes.activeTab]}`,
    "",
    `## ${copy.markdown.summary}`,
    minutes.summary,
    "",
    `## ${copy.markdown.marketSnapshot}`,
    ...minutes.marketSnapshot.map((line) => `- ${line}`),
    "",
    `## ${copy.markdown.keyPoints}`,
    ...minutes.keyPoints.map((line) => `- ${line}`),
    "",
    `## ${copy.markdown.actionItems}`,
    ...minutes.actionItems.map((line) => `- ${line}`),
    "",
    `## ${copy.markdown.tradeNotes}`,
    ...minutes.tradeNotes.map((line) => `- ${line}`),
    "",
    `## ${copy.markdown.timeline}`,
    ...timeline
      .filter((item) => item.kind === "message")
      .map((item) => `- [${formatTime(item.ts, copy.app.dateLocale)}] ${item.speakerLabel}: ${item.text}`)
  ];

  return lines.join("\n");
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Sparkline({
  snapshot,
  copy
}: {
  snapshot: MarketSnapshot | null;
  copy: ReturnType<typeof getDictionary>;
}) {
  const points = snapshot?.sparkline ?? [];
  if (points.length === 0) {
    return <div className="rounded-[18px] border border-dashed border-ink/10 p-4 text-xs text-mist">{copy.meeting.noIntradaySparkline}</div>;
  }

  const values = points.map((point) => point.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);

  return (
    <div className="flex h-20 items-end gap-1 rounded-[18px] border border-ink/10 bg-white/70 p-3">
      {points.map((point) => (
        <span
          key={point.ts}
          className="flex-1 rounded-full bg-cobalt/40"
          style={{ height: `${22 + ((point.price - min) / span) * 78}%` }}
        />
      ))}
    </div>
  );
}

function MarketQuoteCard({
  quote,
  copy,
  locale
}: {
  quote: MarketSnapshot["watchlist"][number];
  copy: ReturnType<typeof getDictionary>;
  locale: string;
}) {
  const isPositive = quote.changePercent >= 0;
  const borderClass = isPositive ? "border-mint/18" : "border-rose/16";
  const signalClass = isPositive ? "bg-mint" : "bg-rose";
  const progressWidth = `${clamp(Math.abs(quote.changePercent) * 8, 12, 100)}%`;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] border bg-white p-5 shadow-[0_16px_32px_rgba(18,24,36,0.06)]",
        borderClass
      )}
    >
      <div className="relative">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink">
                {quote.symbol}
              </span>
              <span className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-[11px] font-medium text-mist">
                {quote.market}
              </span>
            </div>
            <div className="mt-3 truncate text-lg font-semibold text-ink">{quote.name}</div>
          </div>
          <div className="rounded-[22px] border border-ink/10 bg-white px-4 py-3 shadow-[0_10px_24px_rgba(18,24,36,0.04)] sm:min-w-[148px] sm:text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{copy.meeting.marketChange}</div>
            <div className={cn("mt-2 text-xl font-semibold leading-none sm:text-2xl", isPositive ? "text-mint" : "text-rose")}>
              {formatSignedPercent(quote.changePercent)}
            </div>
            <div className={cn("mt-1 text-xs font-medium", isPositive ? "text-mint" : "text-rose")}>
              {formatSignedNumber(quote.change, quote.currency === "KRW" ? 0 : 2, locale)}
            </div>
          </div>
        </div>
        <div className="mt-5">
          <div>
            <div className="text-[2rem] font-semibold leading-none text-ink md:text-3xl">
              {formatCurrency(quote.price, quote.currency, locale)}
            </div>
            <div className="mt-2 text-sm text-mist">{quote.market}</div>
          </div>

        </div>
        <div className="mt-4">
          <div className="h-2 rounded-full bg-ink/6">
            <div className={cn("h-2 rounded-full", signalClass)} style={{ width: progressWidth }} />
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-[18px] border border-ink/10 bg-white px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{copy.meeting.marketPreviousClose}</div>
            <div className="mt-1 text-sm font-medium text-ink">
              {quote.previousClose ? formatCurrency(quote.previousClose, quote.currency, locale) : "--"}
            </div>
          </div>
          <div className="rounded-[18px] border border-ink/10 bg-white px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{copy.meeting.marketVolume}</div>
            <div className="mt-1 text-sm font-medium text-ink">{formatMarketVolume(quote.volume, locale)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketQuoteSection({
  title,
  quotes,
  copy,
  locale
}: {
  title: string;
  quotes: MarketSnapshot["watchlist"] | MarketSnapshot["indices"];
  copy: ReturnType<typeof getDictionary>;
  locale: string;
}) {
  if (quotes.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-mist">{title}</div>
        <Badge variant="secondary">{quotes.length}</Badge>
      </div>
      <div className="grid gap-3">
        {quotes.map((quote) => (
          <MarketQuoteCard key={quote.symbol} quote={quote} copy={copy} locale={locale} />
        ))}
      </div>
    </section>
  );
}


function SectionHeader({
  eyebrow,
  title,
  badge,
  description,
  actions
}: {
  eyebrow: string;
  title: string;
  badge?: ReactNode;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <div className="section-kicker">{eyebrow}</div>
        <div className="font-display text-2xl leading-none text-ink">{title}</div>
        {description ? <p className="max-w-3xl text-sm text-mist">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {badge}
        {actions}
      </div>
    </div>
  );
}

function OverviewMetric({
  label,
  value,
  detail,
  tone = "default"
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: MetricTone;
}) {
  return (
    <div
      className={cn(
        "metric-panel rounded-[24px] border p-4",
        tone === "default" && "border-ink/10 bg-white",
        tone === "cobalt" && "border-cobalt/12 bg-white",
        tone === "mint" && "border-mint/12 bg-white",
        tone === "ember" && "border-ember/14 bg-white"
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-mist">{label}</div>
      <div className="mt-3 text-xl font-semibold leading-none text-ink">{value}</div>
      {detail ? <div className="mt-2 text-xs text-mist">{detail}</div> : null}
    </div>
  );
}

function SnapshotStatTile({
  label,
  value,
  detail,
  accent = "default"
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: "default" | "positive" | "negative";
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] border bg-white px-4 py-4 shadow-[0_12px_24px_rgba(18,24,36,0.05)]",
        accent === "default" && "border-ink/10",
        accent === "positive" && "border-mint/18",
        accent === "negative" && "border-rose/18"
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{label}</div>
      <div className="mt-3 text-lg font-semibold leading-none text-ink">{value}</div>
      {detail ? <div className="mt-2 text-xs text-mist">{detail}</div> : null}
    </div>
  );
}

function SnapshotOverview({
  snapshot,
  activeTab,
  copy,
  locale,
  tabLabels
}: {
  snapshot: MarketSnapshot | null;
  activeTab: WorkspaceTab;
  copy: ReturnType<typeof getDictionary>;
  locale: AppLocale;
  tabLabels: Record<WorkspaceTab, string>;
}) {
  const heroQuote = snapshot?.watchlist?.[0] ?? snapshot?.indices?.[0];
  const intlLocale = copy.app.dateLocale;
  const providerLabel = getMarketProviderLabel(snapshot, copy);
  const headline = getMarketHeadline(snapshot, activeTab, copy, tabLabels);
  const heroAccent =
    activeTab === "btc"
      ? "bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.34),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(234,88,12,0.26),transparent_28%),linear-gradient(135deg,rgba(18,24,36,0.98),rgba(82,44,18,0.92))]"
      : activeTab === "kr"
        ? "bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.24),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.22),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(18,60,74,0.9))]"
        : "bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.24),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.18),transparent_28%),linear-gradient(135deg,rgba(18,24,36,0.98),rgba(28,46,92,0.92))]";
  const isPositive = (heroQuote?.changePercent ?? 0) >= 0;
  const priceChangeDetail = heroQuote
    ? `${formatSignedPercent(heroQuote.changePercent)} · ${formatSignedNumber(heroQuote.change, heroQuote.currency === "KRW" ? 0 : 2, intlLocale)}`
    : getSnapshotMetaDetail(snapshot, locale) || providerLabel;
  const normalizedPriceChangeDetail = priceChangeDetail;
  return (
    <div className={cn("mb-4 overflow-hidden rounded-[30px] border border-ink/10 p-6 text-white shadow-panel", heroAccent)}>
      <div className="mt-4 grid min-h-0 flex-1 gap-4 xl:grid-rows-[auto_minmax(0,1fr)]">
        <div className="relative">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{copy.meeting.tabBadge(tabLabels[activeTab])}</Badge>
            <Badge variant="outline" className="border-white/12 bg-white/10 text-white">
              {labelForBadge(snapshot?.status || "loading", locale)}
            </Badge>
            {snapshot?.session && snapshot.session !== "always" ? (
              <Badge variant="outline" className="border-white/12 bg-white/10 text-white">
                {labelForMarketSession(snapshot.session, locale)}
              </Badge>
            ) : null}
            {snapshot?.status === "live" ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                <span className="h-2 w-2 rounded-full bg-mint shadow-[0_0_12px_rgba(16,185,129,0.9)]" />
                {labelForBadge("live", locale)}
              </span>
            ) : null}
          </div>
          <div className="font-display text-[2.2rem] leading-none md:text-[2.8rem]">
            {headline}
          </div>
          <div className="mt-6 flex flex-wrap items-end gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/52">
                {heroQuote?.name || copy.meeting.marketOverview}
              </div>
              <div className="mt-3 text-[2.35rem] font-semibold leading-none tracking-[-0.04em] md:text-[3.25rem]">
                {heroQuote
                  ? formatCurrency(heroQuote.price, heroQuote.currency, intlLocale)
                  : labelForBadge(snapshot?.status || "loading", locale)}
              </div>
            </div>
            <div
              className={cn(
                "self-start rounded-full px-4 py-2 text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
                isPositive ? "bg-mint/14 text-mint" : "bg-rose/16 text-rose"
              )}
            >
              {normalizedPriceChangeDetail}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/68">
            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">{providerLabel}</span>
            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
              {describeMarketSession(snapshot?.session, locale) || labelForBadge(snapshot?.status || "ready", locale)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
              {getSnapshotUpdatedLabel(snapshot, locale, copy.markdown.updated)} {snapshot?.updatedAt ? formatTime(snapshot.updatedAt, intlLocale) : "--:--"}
            </span>
          </div>
        </div>
        <div className="grid gap-3">
          <SnapshotStatTile
            label={copy.meeting.marketPulse}
            value={labelForBadge(snapshot?.status || "loading", locale)}
            detail={labelForMarketSession(snapshot?.session, locale) || providerLabel}
            accent={isPositive ? "positive" : "negative"}
          />
          <SnapshotStatTile
            label={copy.meeting.marketSource}
            value={providerLabel}
            detail={snapshot?.updatedAt ? formatTime(snapshot.updatedAt, intlLocale) : "--:--"}
          />
          <SnapshotStatTile
            label={copy.meeting.marketPreviousClose}
            value={
              heroQuote?.previousClose
                ? formatCurrency(heroQuote.previousClose, heroQuote.currency, intlLocale)
                : "--"
            }
            detail={heroQuote?.symbol || copy.meeting.marketSnapshot}
          />
          <SnapshotStatTile
            label={copy.meeting.marketVolume}
            value={formatMarketVolume(heroQuote?.volume, intlLocale)}
            detail={heroQuote?.market || copy.meeting.marketWatch}
          />
        </div>
      </div>
    </div>
  );
}

function TimelineEntry({ item, locale = DEFAULT_LOCALE }: { item: MeetingTimelineItem; locale?: AppLocale }) {
  const isUser = item.speakerType === "user";
  const isAgent = item.speakerType === "agent";
  const isTask = item.kind === "task";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[24px] border p-4 shadow-[0_14px_36px_rgba(18,24,36,0.05)]",
        isUser && "border-ink/28 bg-white text-ink",
        isAgent && "border-cobalt/12 bg-white",
        isTask && "border-ember/14 bg-white",
        !isUser && !isAgent && !isTask && "border-ink/10 bg-white"
      )}
    >
      <span
        className={cn(
          "absolute inset-y-4 left-3 w-1 rounded-full",
          isUser && "bg-ink/22",
          isAgent && "bg-cobalt/55",
          isTask && "bg-ember/55",
          !isUser && !isAgent && !isTask && "bg-ink/12"
        )}
      />
      <div className="pl-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
          <span className="text-mist">{formatTime(item.ts, getDictionary(locale).app.dateLocale)}</span>
          <span className="text-ink/72">{item.speakerLabel}</span>
          {item.badge ? (
            <Badge
              variant="outline"
              className={cn(
                isUser && "border-ink/12 bg-white text-ink",
                isAgent && "border-cobalt/14 bg-cobalt/10 text-cobalt",
                isTask && "border-ember/14 bg-ember/12 text-ember"
              )}
            >
              {labelForBadge(item.badge, locale)}
            </Badge>
          ) : null}
          {isAgent && item.provider ? <Badge variant="secondary">{item.provider}</Badge> : null}
        </div>
        <div className="whitespace-pre-wrap text-sm leading-6 text-ink/90">
          {item.text}
        </div>
      </div>
    </div>
  );
}

function BroadcastSpeakerCard({
  agent,
  status,
  latestMessage,
  locale
}: {
  agent: ReturnType<typeof getAgents>[number];
  status: AgentStatus;
  latestMessage: string;
  locale: AppLocale;
}) {
  const copy = getDictionary(locale);
  const theme = PERSONA_AVATAR_THEMES[agent.avatarVariant];

  return (
    <div
      className={cn(
        "relative flex h-full min-h-[288px] flex-col justify-between overflow-hidden rounded-[30px] border border-ink/10 p-5 text-ink shadow-[0_22px_48px_rgba(18,24,36,0.08)]",
        theme.shellClass,
        status === "thinking" && "status-ring-thinking",
        status === "speaking" && "status-ring-speaking",
        status === "browsing" && "status-ring-browsing",
        status === "idle" && "status-ring-idle"
      )}
    >
      <div className={cn("pointer-events-none absolute -right-16 top-8 h-44 w-44 rounded-full blur-3xl", theme.haloClass)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] backdrop-blur-md", theme.badgeClass)}>
          {agent.title}
        </div>
        <Badge variant="outline" className="border-ink/10 bg-white text-ink">
          {copy.agentStatus[status]}
        </Badge>
      </div>
        <div className="relative mt-6 flex flex-1 flex-col justify-between gap-5">
          <div className="flex items-start gap-4">
            <AgentAvatarBadge name={agent.name} preset={agent.avatarPreset} themeClass={theme.avatarClass} size="lg" />
          <div className="min-w-0 space-y-2">
            <div className="font-display text-[2.15rem] leading-none">{agent.name}</div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-mist">{agent.tagline}</div>
            <div className="line-clamp-2 rounded-[18px] border border-ink/10 bg-white px-3 py-2 text-[11px] leading-5 text-ink/72">
              {agent.toneStyle}
            </div>
          </div>
        </div>
        <div className="rounded-[26px] border border-ink/10 bg-white/90 p-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-mist">{agent.emoji}</div>
          <p className="line-clamp-4 text-sm leading-6 text-ink/84">{latestMessage}</p>
        </div>
      </div>
    </div>
  );
}
function UserCameraDockCard({
  locale,
  copy,
  cameraReady,
  videoRef,
  snapshotUpdatedAt
}: {
  locale: AppLocale;
  copy: MeetingCopy;
  cameraReady: boolean;
  videoRef: RefObject<HTMLVideoElement>;
  snapshotUpdatedAt: string;
}) {
  const panelCopy = dockPanelCopy(locale);

  return (
    <Card className="flex h-full min-h-[288px] flex-col p-4">
      <SectionHeader
        eyebrow={panelCopy.userCameraEyebrow}
        title={panelCopy.userCameraTitle}
        badge={<Badge variant="outline">{snapshotUpdatedAt}</Badge>}
        description={panelCopy.userCameraDescription}
      />
      <div className="relative mt-4 flex min-h-0 flex-1 overflow-hidden rounded-[26px] border border-ink/10 bg-[linear-gradient(180deg,rgba(16,25,39,0.94),rgba(27,39,58,0.9))] shadow-[0_18px_42px_rgba(18,24,36,0.12)]">
        <video ref={videoRef} autoPlay muted playsInline className={cn("h-full w-full object-cover", !cameraReady && "hidden")} />
        {cameraReady ? (
          <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md">
            {copy.meeting.localCam}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm leading-6 text-white/78">
            {copy.meeting.cameraFallback}
          </div>
        )}
      </div>
    </Card>
  );
}

function MeetingScriptConsolePanel({
  copy,
  locale,
  timeline,
  input,
  isSending,
  sttMode,
  isListening,
  isRecording,
  browserSpeechSupported,
  openAiSttSupported,
  responseMode,
  responseModeOptions,
  speedMode,
  speedModeOptions,
  showAdvancedControls,
  composerRef,
  onInputChange,
  onComposerKeyDown,
  onMicAction,
  onResponseModeChange,
  onSpeedModeChange,
  onToggleAdvancedControls,
  onSend,
  onReset
}: {
  copy: MeetingCopy;
  locale: AppLocale;
  timeline: MeetingTimelineItem[];
  input: string;
  isSending: boolean;
  sttMode: SpeechMode;
  isListening: boolean;
  isRecording: boolean;
  browserSpeechSupported: boolean;
  openAiSttSupported: boolean;
  responseMode: MeetingResponseMode;
  responseModeOptions: ResponseModeOption[];
  speedMode: MeetingSpeedMode;
  speedModeOptions: SpeedModeOption[];
  showAdvancedControls: boolean;
  composerRef: RefObject<HTMLTextAreaElement>;
  onInputChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onMicAction: () => void;
  onResponseModeChange: (mode: MeetingResponseMode) => void;
  onSpeedModeChange: (mode: MeetingSpeedMode) => void;
  onToggleAdvancedControls: () => void;
  onSend: () => void;
  onReset: () => void;
}) {
  const panelCopy = dockPanelCopy(locale);
  const timelineItems = timeline ?? [];
  const scriptEntries = timelineItems.filter((item) => item.kind === "message");
  const activeResponseModeLabel = getResponseModeCaption(responseMode, responseModeOptions, locale);
  const activeSpeedModeLabel = getSpeedModeCaption(speedMode, speedModeOptions, locale);
  const activeResponseModeOption = responseModeOptions.find((option) => option.value === responseMode)?.label ?? "";
  const activeSpeedModeOption = speedModeOptions.find((option) => option.value === speedMode)?.label ?? "";
  const hasAdvancedOverrides = responseMode !== "auto" || speedMode !== "fast";
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const viewport = transcriptRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement | null;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      stickToBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 72;
    };

    handleScroll();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) {
      return;
    }

    transcriptEndRef.current?.scrollIntoView({ block: "end" });
  }, [scriptEntries.length]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[30px] border border-ink/10 bg-white p-4 shadow-[0_24px_56px_rgba(18,24,36,0.08)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="section-kicker">{panelCopy.liveScriptEyebrow}</div>
          <div className="font-display text-2xl leading-none text-ink">{panelCopy.liveScriptTitle}</div>
          <p className="max-w-3xl text-sm text-mist">{panelCopy.liveScriptDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{isSending ? copy.meeting.runningMeeting : panelCopy.autoRouting}</Badge>
          <Badge variant="outline">{copy.meeting.participants(3)}</Badge>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 rounded-[20px] border border-ink/10 bg-paper/55 px-3 py-3">
        <div className="min-w-0 space-y-1">
          <div className="text-xs font-semibold text-ink">
            {hasAdvancedOverrides
              ? locale === "ko"
                ? "지금 맞춤 답변 설정으로 진행 중입니다."
                : "Custom reply settings are active."
              : locale === "ko"
                ? "기본 빠른 회의 흐름으로 진행 중입니다."
                : "The default fast meeting flow is active."}
          </div>
          <div className="text-xs leading-5 text-mist">{copy.meeting.browserMicHint}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasAdvancedOverrides ? <Badge variant="outline">{activeResponseModeOption}</Badge> : null}
          {speedMode !== "fast" ? <Badge variant="outline">{activeSpeedModeOption}</Badge> : null}
          <Button type="button" size="sm" variant="outline" onClick={onToggleAdvancedControls}>
            {showAdvancedControls
              ? locale === "ko"
                ? "설정 닫기"
                : "Hide settings"
              : locale === "ko"
                ? "고급 설정"
                : "Advanced settings"}
          </Button>
        </div>
      </div>

      <div ref={transcriptRef} className="min-h-0 flex-1">
        <ScrollArea className="meeting-column-scroll h-full min-h-0 rounded-[26px] border border-ink/10 bg-white p-3">
          <div className="space-y-3">
            {scriptEntries.length > 0 ? (
              scriptEntries.map((item) => {
                const isUser = item.speakerType === "user";
                const isAgent = item.speakerType === "agent";
                const isSystem = item.speakerType === "system";
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "max-w-[92%] rounded-[24px] border px-4 py-3 shadow-[0_14px_34px_rgba(18,24,36,0.04)]",
                      isUser && "ml-auto border-ink/28 bg-white text-ink",
                      isAgent && "mr-auto border-cobalt/12 bg-white text-ink",
                      isSystem && "mr-auto border-ink/8 bg-paper/70 text-ink/78"
                    )}
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em]">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="font-semibold text-mist">{item.speakerLabel}</span>
                        {item.badge ? <Badge variant="outline">{labelForBadge(item.badge, locale)}</Badge> : null}
                      </div>
                      <span className="text-mist">{formatTime(item.ts, copy.app.dateLocale)}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-6 text-ink/88">{item.text}</div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[22px] border border-dashed border-ink/12 bg-white/55 px-4 py-10 text-center text-sm text-mist">
                {copy.meeting.timelineEmpty}
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>
        </ScrollArea>
      </div>

      <form
        className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_136px]"
        onSubmit={(event) => {
          event.preventDefault();
          void onSend();
        }}
      >
        <div className="min-w-0 rounded-[28px] border border-cobalt/10 bg-white p-3 shadow-[0_18px_42px_rgba(18,24,36,0.05)]">
          <div className="mb-3 space-y-3 px-2">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onMicAction}
                  disabled={(sttMode === "browser" && !browserSpeechSupported) || (sttMode === "whisper" && !openAiSttSupported) || isSending}
                >
                  {sttMode === "browser"
                    ? isListening
                      ? copy.meeting.stopMic
                      : copy.meeting.speakAndRun
                    : isRecording
                      ? copy.meeting.stopWhisper
                      : copy.meeting.whisperAndRun}
                </Button>
                <Badge variant="outline">{sttMode === "browser" ? copy.meeting.browserStt : copy.meeting.whisper}</Badge>
              </div>
              {showAdvancedControls ? (
                <Button type="button" variant="outline" size="sm" onClick={onToggleAdvancedControls} disabled={isSending}>
                  {locale === "ko" ? "간단히 보기" : "Simple view"}
                </Button>
              ) : null}
            </div>
            {showAdvancedControls ? (
              <div className="grid gap-2 rounded-[20px] border border-ink/10 bg-paper/45 p-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs text-mist">
                  <span>{locale === "ko" ? "답변 대상" : "Reply target"}</span>
                  <select
                    value={responseMode}
                    onChange={(event) => onResponseModeChange(event.target.value as MeetingResponseMode)}
                    disabled={isSending}
                    className={SMALL_SELECT_CLASS_NAME}
                  >
                    {responseModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-mist">
                  <span>{locale === "ko" ? "응답 모드" : "Response mode"}</span>
                  <select
                    value={speedMode}
                    onChange={(event) => onSpeedModeChange(event.target.value as MeetingSpeedMode)}
                    disabled={isSending}
                    className={SMALL_SELECT_CLASS_NAME}
                  >
                    {speedModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="text-xs leading-5 text-mist md:col-span-2">
                  <div>{activeResponseModeLabel}</div>
                  <div className="mt-1">{activeSpeedModeLabel}</div>
                </div>
              </div>
            ) : null}
          </div>
          <Textarea
            ref={composerRef}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={copy.meeting.placeholder}
            disabled={isSending}
            rows={4}
            autoFocus
            className="max-h-[220px] min-h-[120px] resize-none border-0 bg-transparent px-2 py-1 shadow-none focus:border-0 focus:ring-0"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-2 text-xs text-mist">
            <span>{copy.meeting.enterHint}</span>
            <span>{panelCopy.stageNotice}</span>
          </div>
        </div>
        <div className="flex gap-3 xl:flex-col">
          <Button type="submit" disabled={isSending || !input.trim()} className="h-14 flex-1 rounded-[24px] xl:flex-none">
            <span className="text-base font-semibold">{isSending ? copy.meeting.runningMeeting : copy.meeting.runMeeting}</span>
          </Button>
          <Button type="button" variant="destructive" onClick={onReset} className="h-14 flex-1 rounded-[24px] xl:flex-none">
            <span className="text-base font-semibold">{copy.meeting.reset}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}

function ParticipantStagePanel({
  copy,
  locale,
  agents,
  agentStatus,
  latestMessages,
  cameraEnabled,
  cameraReady,
  videoRef,
  focusMode,
  activeTabLabel,
  snapshotStatusLabel,
  snapshotDetail,
  snapshotUpdatedAt,
  timeline,
  input,
  isSending,
  sttMode,
  isListening,
  isRecording,
  browserSpeechSupported,
  openAiSttSupported,
  responseMode,
  responseModeOptions,
  speedMode,
  speedModeOptions,
  showAdvancedControls,
  composerRef,
  onInputChange,
  onComposerKeyDown,
  onMicAction,
  onResponseModeChange,
  onSpeedModeChange,
  onToggleAdvancedControls,
  onToggleFocusMode,
  onToggleCamera,
  onSend,
  onReset
}: {
  copy: MeetingCopy;
  locale: AppLocale;
  agents: ReturnType<typeof getAgents>;
  agentStatus: Record<AgentId, AgentStatus>;
  latestMessages: Record<AgentId, string>;
  cameraEnabled: boolean;
  cameraReady: boolean;
  videoRef: RefObject<HTMLVideoElement>;
  focusMode: boolean;
  activeTabLabel: string;
  snapshotStatusLabel: string;
  snapshotDetail: string;
  snapshotUpdatedAt: string;
  timeline: MeetingTimelineItem[];
  input: string;
  isSending: boolean;
  sttMode: SpeechMode;
  isListening: boolean;
  isRecording: boolean;
  browserSpeechSupported: boolean;
  openAiSttSupported: boolean;
  responseMode: MeetingResponseMode;
  responseModeOptions: ResponseModeOption[];
  speedMode: MeetingSpeedMode;
  speedModeOptions: SpeedModeOption[];
  showAdvancedControls: boolean;
  composerRef: RefObject<HTMLTextAreaElement>;
  onInputChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onMicAction: () => void;
  onResponseModeChange: (mode: MeetingResponseMode) => void;
  onSpeedModeChange: (mode: MeetingSpeedMode) => void;
  onToggleAdvancedControls: () => void;
  onToggleFocusMode: () => void;
  onToggleCamera: () => void;
  onSend: () => void;
  onReset: () => void;
}) {
  return (
    <Card className="flex h-full min-h-0 flex-col p-4 lg:p-5">
      <SectionHeader
        eyebrow={copy.meeting.stageEyebrow}
        title={copy.meeting.stageTitle}
        badge={
          <>
            <Badge variant="secondary">{copy.meeting.participants(agents.length + 1)}</Badge>
            <Badge variant="outline">{activeTabLabel}</Badge>
            <Badge variant="outline">{snapshotStatusLabel}</Badge>
            <Button type="button" size="sm" variant="outline" onClick={onToggleCamera} className="h-8 rounded-full">
              {cameraEnabled ? (locale === "ko" ? "카메라 끄기" : "Hide camera") : locale === "ko" ? "카메라 켜기" : "Show camera"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onToggleFocusMode} className="h-8 rounded-full">
              {focusMode ? (locale === "ko" ? "집중 해제" : "Exit focus") : locale === "ko" ? "집중 모드" : "Focus mode"}
            </Button>
          </>
        }
        description={snapshotDetail}
      />
      <div className="mt-4 grid min-h-0 flex-1 gap-4 xl:grid-rows-[auto_minmax(0,1fr)]">
        <div className="grid gap-4 xl:grid-cols-2 xl:auto-rows-fr">
          {agents.map((agent) => (
            <BroadcastSpeakerCard
              key={agent.id}
              agent={agent}
              status={agentStatus[agent.id]}
              latestMessage={latestMessages[agent.id]}
              locale={locale}
            />
          ))}
        </div>
        <div className={cn("grid min-h-0 gap-4", cameraEnabled ? "xl:grid-cols-[minmax(0,1.28fr)_minmax(260px,0.72fr)]" : "xl:grid-cols-1")}>
          <MeetingScriptConsolePanel
            copy={copy}
            locale={locale}
            timeline={timeline}
            input={input}
            isSending={isSending}
            sttMode={sttMode}
            isListening={isListening}
            isRecording={isRecording}
            browserSpeechSupported={browserSpeechSupported}
            openAiSttSupported={openAiSttSupported}
            responseMode={responseMode}
            responseModeOptions={responseModeOptions}
            speedMode={speedMode}
            speedModeOptions={speedModeOptions}
            showAdvancedControls={showAdvancedControls}
            composerRef={composerRef}
            onInputChange={onInputChange}
            onComposerKeyDown={onComposerKeyDown}
            onMicAction={onMicAction}
            onResponseModeChange={onResponseModeChange}
            onSpeedModeChange={onSpeedModeChange}
            onToggleAdvancedControls={onToggleAdvancedControls}
            onSend={onSend}
            onReset={onReset}
          />
          {cameraEnabled ? (
            <UserCameraDockCard
              locale={locale}
              copy={copy}
              cameraReady={cameraReady}
              videoRef={videoRef}
              snapshotUpdatedAt={snapshotUpdatedAt}
            />
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function ResearchWorkbenchPanel({
  copy,
  locale,
  selectedTask,
  selectedArtifacts,
  taskHistory,
  selectedTaskId,
  completedTaskCount,
  onSelectTask
}: {
  copy: MeetingCopy;
  locale: AppLocale;
  selectedTask: MeetingTask | null;
  selectedArtifacts?: MeetingTaskArtifacts;
  taskHistory: MeetingTask[];
  selectedTaskId: string | null;
  completedTaskCount: number;
  onSelectTask: (taskId: string) => void;
}) {
  const screenshotUrl = selectedArtifacts?.screenshot || selectedTask?.screenshot;

  return (
    <Card className="p-4">
      <SectionHeader
        eyebrow={copy.meeting.openClawResearch}
        title={copy.meeting.recentTasks}
        badge={
          <>
            <Badge variant="secondary">{taskHistory.length}</Badge>
            {taskHistory.length > 0 ? <Badge variant="outline">{completedTaskCount}</Badge> : null}
          </>
        }
        description={selectedTask?.summary || copy.meeting.openClawIdle}
      />
      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.08fr)_minmax(280px,0.92fr)]">
        <div className="rounded-[26px] border border-ink/10 bg-[#101927] p-4 text-white shadow-panel">
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/55">{copy.meeting.openClawResearch}</div>
          {screenshotUrl ? (
            <div
              className="aspect-[16/10] min-h-[240px] rounded-[22px] border border-white/10 bg-cover bg-center"
              style={{ backgroundImage: `url(${screenshotUrl})` }}
            />
          ) : (
            <div className="grid aspect-[16/10] min-h-[240px] place-items-center rounded-[22px] border border-dashed border-white/15 text-sm text-white/60">
              {copy.meeting.noResearchTask}
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/55">{copy.meeting.openClawSummary}</div>
              <div className="mt-1 text-sm text-white/80">{selectedTask?.summary || copy.meeting.openClawIdle}</div>
            </div>
            <Badge variant="secondary">{labelForBadge(selectedTask?.status || "standby", locale)}</Badge>
          </div>
          {selectedArtifacts?.notes?.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {selectedArtifacts.notes.slice(0, 4).map((note) => (
                <div key={note} className="rounded-[16px] border border-white/10 bg-white/6 px-3 py-2 text-sm text-white/72">
                  {note}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="rounded-[26px] border border-ink/10 bg-white/68 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <div className="mb-3 flex items-center justify-between gap-2 px-2">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-mist">{copy.meeting.recentTasks}</div>
            <Badge variant="outline">{completedTaskCount}</Badge>
          </div>
          <ScrollArea className="meeting-column-scroll max-h-[360px] pr-1">
            <div className="space-y-2">
              {taskHistory.length > 0 ? (
                taskHistory.map((task) => (
                  <button
                    key={task.taskId}
                    onClick={() => onSelectTask(task.taskId)}
                    className={cn(
                      "w-full rounded-[20px] border px-4 py-3 text-left transition",
                      selectedTaskId === task.taskId
                        ? "border-cobalt/30 bg-white shadow-[0_10px_24px_rgba(44,91,245,0.08)]"
                        : "border-ink/10 bg-white hover:bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{task.summary}</div>
                      <Badge variant="outline">{labelForBadge(task.status, locale)}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-mist">{formatTime(task.updatedAt, copy.app.dateLocale)}</div>
                  </button>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-ink/12 bg-white/55 px-4 py-6 text-center text-sm text-mist">
                  {copy.meeting.noResearchTask}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </Card>
  );
}

function MeetingComposerPanel({
  copy,
  input,
  isSending,
  sttMode,
  isListening,
  isRecording,
  browserSpeechSupported,
  openAiSttSupported,
  responseMode,
  responseModeOptions,
  composerRef,
  onInputChange,
  onComposerKeyDown,
  onMicAction,
  onRunOpenClaw,
  onSend,
  onReset
}: {
  copy: MeetingCopy;
  input: string;
  isSending: boolean;
  sttMode: SpeechMode;
  isListening: boolean;
  isRecording: boolean;
  browserSpeechSupported: boolean;
  openAiSttSupported: boolean;
  responseMode: MeetingResponseMode;
  responseModeOptions: ResponseModeOption[];
  composerRef: RefObject<HTMLTextAreaElement>;
  onInputChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onMicAction: () => void;
  onResponseModeChange: (mode: MeetingResponseMode) => void;
  onRunOpenClaw: () => void;
  onSend: () => void;
  onReset: () => void;
}) {
  return (
    <Card className="border border-cobalt/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(240,245,255,0.9))] p-4 shadow-[0_22px_56px_rgba(44,91,245,0.08)]">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSend();
        }}
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={onMicAction}
              disabled={(sttMode === "browser" && !browserSpeechSupported) || (sttMode === "whisper" && !openAiSttSupported) || isSending}
            >
              {sttMode === "browser"
                ? isListening
                  ? copy.meeting.stopMic
                  : copy.meeting.speakAndRun
                : isRecording
                  ? copy.meeting.stopWhisper
                  : copy.meeting.whisperAndRun}
            </Button>
                        <Button variant="outline" onClick={onRunOpenClaw} disabled={!input.trim() || isSending}>
              {copy.meeting.runOpenClaw}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-mist">
            <Badge variant="secondary">{sttMode === "browser" ? copy.meeting.browserStt : copy.meeting.whisper}</Badge>
          </div>
        </div>
        <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_160px_124px] 2xl:items-stretch">
          <div className="min-w-0 rounded-[30px] border border-cobalt/10 bg-white/82 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_42px_rgba(18,24,36,0.05)]">
            <Textarea
              ref={composerRef}
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={copy.meeting.placeholder}
              disabled={isSending}
              rows={4}
              autoFocus
              className="max-h-[240px] min-h-[132px] resize-none border-0 bg-transparent px-2 py-1 shadow-none focus:border-0 focus:ring-0"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-2 text-xs text-mist">
              <span>{copy.meeting.enterHint}</span>
              <span>{copy.meeting.voiceAutoRunOn}</span>
            </div>
          </div>
          <Button type="submit" disabled={isSending || !input.trim()} className="h-14 rounded-[24px] 2xl:h-auto 2xl:min-h-[120px] 2xl:rounded-[28px] 2xl:flex-col 2xl:px-6">
            <span className="text-base font-semibold">{isSending ? copy.meeting.runningMeeting : copy.meeting.runMeeting}</span>
          </Button>
          <Button variant="destructive" onClick={onReset} className="h-14 rounded-[24px] 2xl:h-auto 2xl:min-h-[120px] 2xl:rounded-[28px] 2xl:flex-col 2xl:px-5">
            <span className="text-base font-semibold">{copy.meeting.reset}</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}

function TimelineSidebar({
  copy,
  locale,
  timeline,
  minutes,
  minutesHistory,
  onDownloadMinutes,
  onSelectMinutes
}: {
  copy: MeetingCopy;
  locale: AppLocale;
  timeline: MeetingTimelineItem[];
  minutes: MeetingMinutes | null;
  minutesHistory: MeetingSessionRecord[];
  onDownloadMinutes: () => void;
  onSelectMinutes: (minutes: MeetingMinutes) => void;
}) {
  const timelineItems = timeline ?? [];

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3">
      <Card className="flex min-h-0 flex-col p-4 xl:max-h-[420px]">
        <SectionHeader
          eyebrow={copy.meeting.timelineEyebrow}
          title={copy.meeting.timelineTitle}
          badge={<Badge variant="secondary">{timelineItems.length}</Badge>}
        />
        <ScrollArea className="meeting-column-scroll min-h-0 flex-1 rounded-[24px] border border-ink/10 bg-white/70 p-3">
          <div className="space-y-3">
            {timelineItems.map((item) => (
              <TimelineEntry key={item.id} item={item} locale={locale} />
            ))}
          </div>
        </ScrollArea>
      </Card>
      <Card className="flex min-h-0 flex-col p-4 xl:max-h-[340px]">
        <SectionHeader
          eyebrow={copy.meeting.minutesEyebrow}
          title={copy.meeting.minutesTitle}
          actions={
            <Button size="sm" variant="outline" onClick={onDownloadMinutes} disabled={!minutes}>
              {copy.meeting.download}
            </Button>
          }
        />
        <div className="rounded-[24px] border border-ink/10 bg-white/75 p-4 text-sm text-ink/90">
          {minutes ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-mist">{copy.meeting.minutesSummary}</div>
                <div className="mt-1 leading-6">{minutes.summary}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-mist">{copy.meeting.marketSnapshot}</div>
                {minutes.marketSnapshot.map((line) => (
                  <div key={line} className="mt-1">
                    - {line}
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-mist">{copy.meeting.actionItems}</div>
                {minutes.actionItems.map((line) => (
                  <div key={line} className="mt-1">
                    - {line}
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-mist">{copy.meeting.tradeNotes}</div>
                {minutes.tradeNotes.map((line) => (
                  <div key={line} className="mt-1">
                    - {line}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-mist">{copy.meeting.timelineEmpty}</div>
          )}
        </div>
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-mist">{copy.meeting.savedLocally}</div>
          <ScrollArea className="meeting-column-scroll max-h-[180px] pr-1">
            <div className="space-y-2">
              {minutesHistory.map((record) => (
                <button
                  key={record.id}
                  onClick={() => onSelectMinutes(record.minutes)}
                  className="w-full rounded-[18px] border border-ink/10 bg-white/75 px-3 py-2 text-left text-sm hover:bg-white"
                >
                  <div className="font-medium">{record.minutes.title}</div>
                  <div className="text-xs text-mist">{new Date(record.minutes.updatedAt).toLocaleString(copy.app.dateLocale)}</div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </Card>
    </div>
  );
}

function PersonaEditorCard({
  agent,
  locale,
  value,
  onChange,
  onReset
}: {
  agent: ReturnType<typeof getAgents>[number];
  locale: AppLocale;
  value: AgentPersonaOverrides[AgentId];
  onChange: (patch: Partial<NonNullable<AgentPersonaOverrides[AgentId]>>) => void;
  onReset: () => void;
}) {
  const panelCopy = dockPanelCopy(locale);
  const theme = PERSONA_AVATAR_THEMES[agent.avatarVariant];

  return (
    <div className="rounded-[22px] border border-ink/10 bg-white/92 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AgentAvatarBadge name={agent.name} preset={agent.avatarPreset} themeClass={theme.avatarClass} />
          <div className="min-w-0">
            <div className="font-medium text-ink">{agent.name}</div>
            <div className="text-xs uppercase tracking-[0.2em] text-mist">{agent.title}</div>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onReset}>
          {panelCopy.resetPersona}
        </Button>
      </div>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-mist">
          <span>{panelCopy.displayNameLabel}</span>
          <Input
            value={value?.displayName ?? ""}
            onChange={(event) => onChange({ displayName: event.target.value })}
            className="border-ink/10 bg-white text-ink placeholder:text-mist"
          />
        </label>
        <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-mist">
          <span>{panelCopy.toneLabel}</span>
          <Textarea
            value={value?.toneStyle ?? ""}
            onChange={(event) => onChange({ toneStyle: event.target.value })}
            rows={3}
            className="min-h-[92px] resize-none border-ink/10 bg-white text-ink placeholder:text-mist"
          />
        </label>
        <div className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-mist">
          <span>{panelCopy.avatarLabel}</span>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(PERSONA_AVATAR_PRESETS).map(([preset, option]) => (
              <button
                key={preset}
                type="button"
                onClick={() => onChange({ avatarPreset: preset as AgentAvatarPreset })}
                className={cn(
                  "overflow-hidden rounded-[18px] border bg-white px-2 py-3 text-center transition",
                  agent.avatarPreset === preset ? "border-cobalt/28 shadow-[0_0_0_1px_rgba(44,91,245,0.18)]" : "border-ink/10 hover:border-ink/18"
                )}
              >
                <div className="mx-auto mb-2 flex justify-center">
                  <AgentAvatarBadge name={agent.name} preset={preset as AgentAvatarPreset} themeClass={theme.avatarClass} size="sm" />
                </div>
                <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/72">{option.label[locale]}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-mist">
          <div className="flex items-center justify-between gap-2">
            <span>{panelCopy.avatarToneLabel}</span>
            <span className="text-[10px] font-medium normal-case tracking-normal text-mist/80">
              {locale === "ko" ? "카드 색감" : "Card mood"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(PERSONA_AVATAR_THEMES).map(([variant, option]) => (
              <button
                key={variant}
                type="button"
                onClick={() => onChange({ avatarVariant: variant as AgentAvatarVariant })}
                className={cn(
                  "flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-left transition",
                  agent.avatarVariant === variant
                    ? "border-cobalt/28 shadow-[0_0_0_1px_rgba(44,91,245,0.18)]"
                    : "border-ink/10 hover:border-ink/18"
                )}
              >
                <span className={cn("h-4 w-4 shrink-0 rounded-full border", option.avatarClass)} />
                <span className="text-[11px] font-semibold tracking-[0.08em] text-ink/72">{option.label[locale]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionDockPanel({
  copy,
  locale,
  agents,
  timeline,
  activeTabLabel,
  latestSavedAt,
  capabilities,
  openClawProbe,
  isTestingOpenClaw,
  personas,
  onPersonaChange,
  onPersonaReset,
  settingsHref,
  onLocaleChange,
  onTestOpenClaw
}: {
  copy: MeetingCopy;
  locale: AppLocale;
  agents: ReturnType<typeof getAgents>;
  timeline: MeetingTimelineItem[];
  activeTabLabel: string;
  latestSavedAt: string;
  capabilities: Capabilities | null;
  openClawProbe: OpenClawConnectionProbe | null;
  isTestingOpenClaw: boolean;
  personas: AgentPersonaOverrides;
  onPersonaChange: (agentId: AgentId, patch: Partial<NonNullable<AgentPersonaOverrides[AgentId]>>) => void;
  onPersonaReset: (agentId: AgentId) => void;
  settingsHref?: string | null;
  onLocaleChange: (nextLocale: AppLocale) => void;
  onTestOpenClaw: () => void;
}) {
  const panelCopy = dockPanelCopy(locale);
  const [activePersonaId, setActivePersonaId] = useState<AgentId>(() => agents[0]?.id ?? "assistant");
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);

  useEffect(() => {
    if (!agents.some((agent) => agent.id === activePersonaId)) {
      setActivePersonaId(agents[0]?.id ?? "assistant");
    }
  }, [activePersonaId, agents]);

  const activePersonaAgent = agents.find((agent) => agent.id === activePersonaId) ?? agents[0];
  const activePersonaIndex = activePersonaAgent ? agents.findIndex((agent) => agent.id === activePersonaAgent.id) : 0;
  const openClawStatusLabel = !capabilities?.openclawRemote
    ? locale === "ko"
      ? "미설정"
      : "Not configured"
    : openClawProbe?.status === "reachable"
      ? locale === "ko"
        ? "연결 확인됨"
        : "Connected"
      : openClawProbe?.status === "unreachable"
        ? locale === "ko"
          ? "연결 실패"
          : "Connection failed"
        : locale === "ko"
          ? "설정됨"
          : "Configured";
  const openClawStatusToneClass = !capabilities?.openclawRemote
    ? "border-ink/10 bg-white text-mist"
    : openClawProbe?.status === "reachable"
      ? "border-emerald-200 bg-emerald-50 text-ink"
      : openClawProbe?.status === "unreachable"
        ? "border-rose-200 bg-rose-50 text-ink"
        : "border-cobalt/20 bg-cobalt/8 text-ink";
  const openClawDescription = !capabilities?.openclawRemote
    ? locale === "ko"
      ? ".env.local에 OPENCLAW_BASE_URL과 필요하면 OPENCLAW_API_KEY를 추가하세요."
      : "Add OPENCLAW_BASE_URL and, if needed, OPENCLAW_API_KEY to .env.local."
    : openClawProbe?.status === "reachable"
      ? locale === "ko"
        ? "OpenClaw chat 또는 health 응답을 확인했습니다."
        : "The OpenClaw chat or health endpoint responded successfully."
      : openClawProbe?.status === "unreachable"
        ? locale === "ko"
          ? "OpenClaw가 설정되어 있지만 응답을 받지 못했습니다. 주소, 토큰, /chat 또는 /health를 확인하세요."
          : "OpenClaw is configured, but the app could not get a response. Check the base URL, token, and /chat or /health endpoint."
        : locale === "ko"
          ? "OpenClaw가 설정되어 있지만 아직 연결 테스트를 하지 않았습니다."
          : "OpenClaw is configured, but the connection has not been tested yet.";
  const openClawProbeDetail = openClawProbe?.message;
  const openClawBaseUrl = openClawProbe?.baseUrl || (capabilities?.openclawRemote
    ? locale === "ko"
      ? "환경 변수에 설정됨"
      : "Configured in the environment"
    : locale === "ko"
      ? "OPENCLAW_BASE_URL 미설정"
      : "OPENCLAW_BASE_URL not set");
  const openClawPathSummary = openClawProbe
    ? `${openClawProbe.chatPath} / ${openClawProbe.tasksPath}`
    : locale === "ko"
      ? "/chat, /tasks 기본 경로"
      : "/chat, /tasks default paths";
  const openClawCheckedLabel = openClawProbe?.checkedAt
    ? new Date(openClawProbe.checkedAt).toLocaleString(copy.app.dateLocale)
    : locale === "ko"
      ? "아직 테스트 안 함"
      : "Not tested yet";
  const openClawMeetingLabel = capabilities?.openclawChat
    ? locale === "ko"
      ? "회의 사용 가능"
      : "Meeting ready"
    : locale === "ko"
      ? "회의 꺼짐"
      : "Meeting off";
  const openClawResearchLabel = capabilities?.openclawRemote
    ? locale === "ko"
      ? "조사 사용 가능"
      : "Research ready"
    : locale === "ko"
      ? "조사 꺼짐"
      : "Research off";

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="rounded-[24px] border border-ink/10 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="section-kicker">{panelCopy.personaEyebrow}</div>
            <div className="font-display text-[1.85rem] leading-none text-ink">{panelCopy.personaTitle}</div>
            <p className="text-sm leading-6 text-mist">{panelCopy.personaDescription}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={cn(SMALL_SELECT_CLASS_NAME, "w-auto")}
              value={locale}
              onChange={(event) => onLocaleChange(event.target.value as AppLocale)}
            >
              {SUPPORTED_LOCALES.map((entry) => (
                <option key={entry} value={entry}>
                  {copy.app.localeNames[entry]}
                </option>
              ))}
            </select>
            {settingsHref ? (
              <Button type="button" size="sm" variant="outline" onClick={() => (window.location.href = settingsHref)}>
                {panelCopy.openSettings}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 rounded-[20px] border border-ink/10 bg-white/92 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">
                {locale === "ko" ? "OpenClaw 연결" : "OpenClaw Connection"}
              </div>
              <div className="text-sm font-semibold text-ink">{openClawStatusLabel}</div>
              <p className="max-w-[30rem] text-sm leading-6 text-mist">
                {showConnectionDetails
                  ? openClawDescription
                  : locale === "ko"
                    ? "먼저 연결 상태를 확인하고 테스트해 보세요."
                    : "Start with the connection status and test it first."}
              </p>
            </div>
            <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", openClawStatusToneClass)}>
              {openClawStatusLabel}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{openClawMeetingLabel}</Badge>
              <Badge variant="outline">{openClawResearchLabel}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setShowConnectionDetails((previous) => !previous)}>
                {showConnectionDetails
                  ? locale === "ko"
                    ? "요약만 보기"
                    : "Show summary"
                  : locale === "ko"
                    ? "세부 정보"
                    : "Details"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onTestOpenClaw} disabled={isTestingOpenClaw}>
                {isTestingOpenClaw ? (locale === "ko" ? "테스트 중..." : "Testing...") : locale === "ko" ? "연결 테스트" : "Test connection"}
              </Button>
            </div>
          </div>
          {showConnectionDetails ? (
            <>
              {openClawProbeDetail ? <div className="mt-3 text-xs leading-5 text-mist">{openClawProbeDetail}</div> : null}
              <div className="mt-3 rounded-[16px] border border-ink/10 bg-white px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mist">Base URL</div>
                <div className="mt-1 break-all text-sm text-ink/78">{openClawBaseUrl}</div>
                <div className="mt-1 text-xs text-mist">{openClawPathSummary}</div>
              </div>
              <div className="mt-3 text-xs text-mist">
                {locale === "ko" ? `마지막 확인 ${openClawCheckedLabel}` : `Last checked ${openClawCheckedLabel}`}
              </div>
            </>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap gap-2 rounded-full border border-ink/10 bg-white/82 p-1">
            {agents.map((personaAgent, index) => (
              <button
                key={personaAgent.id}
                type="button"
                onClick={() => setActivePersonaId(personaAgent.id)}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-medium transition",
                  activePersonaId === personaAgent.id
                    ? "bg-ink text-white shadow-[0_10px_24px_rgba(18,24,36,0.16)]"
                    : "text-mist hover:bg-ink/5 hover:text-ink"
                )}
              >
                {index + 1}. {personaAgent.name}
              </button>
            ))}
          </div>
          <Badge variant="outline">{`${activePersonaIndex + 1} / ${agents.length}`}</Badge>
        </div>
        {activePersonaAgent ? (
          <div className="mt-4">
            <PersonaEditorCard
              agent={activePersonaAgent}
              locale={locale}
              value={personas[activePersonaAgent.id]}
              onChange={(patch) => onPersonaChange(activePersonaAgent.id, patch)}
              onReset={() => onPersonaReset(activePersonaAgent.id)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MinutesDockPanel({
  copy,
  locale,
  minutes,
  minutesHistory,
  onDownloadMinutes,
  onSelectMinutes
}: {
  copy: MeetingCopy;
  locale: AppLocale;
  minutes: MeetingMinutes | null;
  minutesHistory: MeetingSessionRecord[];
  onDownloadMinutes: () => void;
  onSelectMinutes: (minutes: MeetingMinutes) => void;
}) {
  const panelCopy = dockPanelCopy(locale);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-[24px] border border-ink/10 bg-white p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="section-kicker">{copy.meeting.minutesEyebrow}</div>
            <div className="font-display text-[1.85rem] leading-none text-ink">{copy.meeting.minutesTitle}</div>
          </div>
          <Button size="sm" variant="outline" onClick={onDownloadMinutes} disabled={!minutes}>
            {copy.meeting.download}
          </Button>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white/92 p-4 text-sm text-ink/82">
          {minutes ? (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{copy.meeting.minutesSummary}</div>
                <div className="mt-2 leading-6">{minutes.summary}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{copy.meeting.actionItems}</div>
                {minutes.actionItems.map((line) => (
                  <div key={line} className="mt-2 leading-6">
                    - {line}
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{copy.meeting.tradeNotes}</div>
                {minutes.tradeNotes.map((line) => (
                  <div key={line} className="mt-2 leading-6">
                    - {line}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-mist">{copy.meeting.timelineEmpty}</div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-ink/10 bg-white p-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-mist">{panelCopy.minutesHistory}</div>
        <ScrollArea className="meeting-column-scroll min-h-0 flex-1 pr-1">
          <div className="space-y-2">
            {minutesHistory.map((record) => (
              <button
                key={record.id}
                onClick={() => onSelectMinutes(record.minutes)}
                className="w-full rounded-[18px] border border-ink/10 bg-white px-3 py-3 text-left transition hover:bg-ink/5"
              >
                <div className="font-medium text-ink">{record.minutes.title}</div>
                <div className="mt-1 text-xs text-mist">{new Date(record.minutes.updatedAt).toLocaleString(copy.app.dateLocale)}</div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function ResearchDockPanel({
  copy,
  locale,
  selectedTask,
  selectedArtifacts,
  taskHistory,
  selectedTaskId,
  completedTaskCount,
  onSelectTask
}: {
  copy: MeetingCopy;
  locale: AppLocale;
  selectedTask: MeetingTask | null;
  selectedArtifacts?: MeetingTaskArtifacts;
  taskHistory: MeetingTask[];
  selectedTaskId: string | null;
  completedTaskCount: number;
  onSelectTask: (taskId: string) => void;
}) {
  const panelCopy = dockPanelCopy(locale);
  const screenshotUrl = selectedArtifacts?.screenshot || selectedTask?.screenshot;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-[24px] border border-ink/10 bg-white p-4 text-ink">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="section-kicker">{copy.meeting.openClawResearch}</div>
            <div className="font-display text-[1.85rem] leading-none text-ink">{panelCopy.dockTabs.research}</div>
          </div>
          <Badge variant="outline">
            {labelForBadge(selectedTask?.status || "standby", locale)}
          </Badge>
        </div>
        {screenshotUrl ? (
          <div className="aspect-[16/10] rounded-[20px] border border-ink/10 bg-cover bg-center" style={{ backgroundImage: `url(${screenshotUrl})` }} />
        ) : (
          <div className="grid aspect-[16/10] place-items-center rounded-[20px] border border-dashed border-ink/12 text-sm text-mist">
            {copy.meeting.noResearchTask}
          </div>
        )}
        <div className="mt-4 text-sm leading-6 text-ink/78">{selectedTask?.summary || copy.meeting.openClawIdle}</div>
        {selectedArtifacts?.notes?.length ? (
          <div className="mt-4 grid gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{panelCopy.researchNotes}</div>
            {selectedArtifacts.notes.slice(0, 4).map((note) => (
              <div key={note} className="rounded-[16px] border border-ink/10 bg-white/92 px-3 py-2 text-sm text-ink/72">
                {note}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-ink/10 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-mist">{panelCopy.researchHistory}</div>
          <Badge variant="outline">{completedTaskCount}</Badge>
        </div>
        <ScrollArea className="meeting-column-scroll min-h-0 flex-1 pr-1">
          <div className="space-y-2">
            {taskHistory.length > 0 ? (
              taskHistory.map((task) => (
                <button
                key={task.taskId}
                  onClick={() => onSelectTask(task.taskId)}
                  className={cn(
                    "w-full rounded-[18px] border px-3 py-3 text-left transition",
                    selectedTaskId === task.taskId ? "border-cobalt/28 bg-cobalt/6" : "border-ink/10 bg-white hover:bg-ink/5"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-ink">{task.summary}</div>
                    <Badge variant="outline">
                      {labelForBadge(task.status, locale)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-mist">{formatTime(task.updatedAt, copy.app.dateLocale)}</div>
                </button>
              ))
            ) : (
              <div className="rounded-[18px] border border-dashed border-ink/12 px-4 py-8 text-sm text-mist">
                {copy.meeting.noResearchTask}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function MeetingDebuggerDock({
  copy,
  locale,
  open,
  activeTab,
  onToggle,
  onTabChange,
  agents,
  timeline,
  activeTabLabel,
  latestSavedAt,
  capabilities,
  openClawProbe,
  isTestingOpenClaw,
  personas,
  selectedTask,
  selectedArtifacts,
  taskHistory,
  selectedTaskId,
  completedTaskCount,
  minutes,
  minutesHistory,
  settingsHref,
  onPersonaChange,
  onPersonaReset,
  onSelectTask,
  onDownloadMinutes,
  onSelectMinutes,
  onLocaleChange,
  onTestOpenClaw
}: {
  copy: MeetingCopy;
  locale: AppLocale;
  open: boolean;
  activeTab: DockTab;
  onToggle: () => void;
  onTabChange: (tab: DockTab) => void;
  agents: ReturnType<typeof getAgents>;
  timeline: MeetingTimelineItem[];
  activeTabLabel: string;
  latestSavedAt: string;
  capabilities: Capabilities | null;
  openClawProbe: OpenClawConnectionProbe | null;
  isTestingOpenClaw: boolean;
  personas: AgentPersonaOverrides;
  selectedTask: MeetingTask | null;
  selectedArtifacts?: MeetingTaskArtifacts;
  taskHistory: MeetingTask[];
  selectedTaskId: string | null;
  completedTaskCount: number;
  minutes: MeetingMinutes | null;
  minutesHistory: MeetingSessionRecord[];
  settingsHref?: string | null;
  onPersonaChange: (agentId: AgentId, patch: Partial<NonNullable<AgentPersonaOverrides[AgentId]>>) => void;
  onPersonaReset: (agentId: AgentId) => void;
  onSelectTask: (taskId: string) => void;
  onDownloadMinutes: () => void;
  onSelectMinutes: (minutes: MeetingMinutes) => void;
  onLocaleChange: (nextLocale: AppLocale) => void;
  onTestOpenClaw: () => void;
}) {
  const panelCopy = dockPanelCopy(locale);

  if (!open) {
    return (
      <Card className="flex min-h-0 flex-col self-stretch overflow-hidden border border-ink/12 bg-white p-2 text-ink shadow-[0_18px_42px_rgba(18,24,36,0.08)] xl:h-[calc(100dvh-14rem)]">
        <Button type="button" size="sm" variant="outline" onClick={onToggle} className="h-11 w-full rounded-[16px] border-ink/12 bg-white text-ink hover:bg-ink/5">
          {panelCopy.openDock}
        </Button>
        <div className="mt-2 grid gap-2">
          {(Object.keys(panelCopy.dockTabs) as DockTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                onTabChange(tab);
                onToggle();
              }}
              className={cn(
                "rounded-[16px] border px-2 py-3 text-center text-[11px] font-semibold transition",
                activeTab === tab
                  ? "border-cobalt/24 bg-white text-ink shadow-[0_10px_24px_rgba(44,91,245,0.08)]"
                  : "border-ink/10 bg-white text-mist hover:text-ink"
              )}
            >
              {panelCopy.dockTabs[tab]}
            </button>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex min-h-0 flex-col self-stretch overflow-hidden border border-ink/12 bg-white p-0 text-ink shadow-[0_18px_42px_rgba(18,24,36,0.08)] xl:h-[calc(100dvh-14rem)]">
      <div className="flex items-center justify-between border-b border-ink/8 px-3 py-3">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {(Object.keys(panelCopy.dockTabs) as DockTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition",
                activeTab === tab
                  ? "border border-ink/20 bg-white text-ink shadow-[0_10px_24px_rgba(18,24,36,0.08)]"
                  : "text-mist hover:bg-ink/5 hover:text-ink"
              )}
            >
              {panelCopy.dockTabs[tab]}
            </button>
          ))}
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onToggle} className="text-ink hover:bg-ink/5 hover:text-ink">
          {panelCopy.closeDock}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {activeTab === "session" ? (
          <SessionDockPanel
            copy={copy}
            locale={locale}
            agents={agents}
            timeline={timeline}
            activeTabLabel={activeTabLabel}
            latestSavedAt={latestSavedAt}
            capabilities={capabilities}
            openClawProbe={openClawProbe}
            isTestingOpenClaw={isTestingOpenClaw}
            personas={personas}
            onPersonaChange={onPersonaChange}
            onPersonaReset={onPersonaReset}
            settingsHref={settingsHref}
            onLocaleChange={onLocaleChange}
            onTestOpenClaw={onTestOpenClaw}
          />
        ) : null}
        {activeTab === "minutes" ? (
          <MinutesDockPanel
            copy={copy}
            locale={locale}
            minutes={minutes}
            minutesHistory={minutesHistory}
            onDownloadMinutes={onDownloadMinutes}
            onSelectMinutes={onSelectMinutes}
          />
        ) : null}
        {activeTab === "research" ? (
          <ResearchDockPanel
            copy={copy}
            locale={locale}
            selectedTask={selectedTask}
            selectedArtifacts={selectedArtifacts}
            taskHistory={taskHistory}
            selectedTaskId={selectedTaskId}
            completedTaskCount={completedTaskCount}
            onSelectTask={onSelectTask}
          />
        ) : null}
      </div>
    </Card>
  );
}

export function MeetingRoom({
  settingsHref = null,
  locale = DEFAULT_LOCALE
}: {
  settingsHref?: string | null;
  locale?: AppLocale;
}) {
  const copy = getDictionary(locale);
  const experienceCopy = dockPanelCopy(locale);
  const tabLabels = copy.tabs;

  const [timeline, setTimeline] = useState<MeetingTimelineItem[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [personaOverrides, setPersonaOverrides] = useState<AgentPersonaOverrides>(() => buildPersonaState(locale));
  const [dockOpen, setDockOpen] = useState(false);
  const [notice, setNotice] = useState<string>(copy.meeting.initialNotice);
  const [activeDockTab, setActiveDockTab] = useState<DockTab>("session");
  const [focusMode, setFocusMode] = useState(false);
  const [showAdvancedComposerControls, setShowAdvancedComposerControls] = useState(false);
  const [sttMode, setSttMode] = useState<SpeechMode>("browser");
  const [ttsMode, setTtsMode] = useState<TtsMode>("browser");
  const [autoSpeakMode, setAutoSpeakMode] = useState<AutoSpeakMode>("off");
  const [responseMode, setResponseMode] = useState<MeetingResponseMode>("auto");
  const [speedMode, setSpeedMode] = useState<MeetingSpeedMode>("fast");
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [browserSpeechSupported, setBrowserSpeechSupported] = useState(false);
  const [browserTtsSupported, setBrowserTtsSupported] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [openClawProbe, setOpenClawProbe] = useState<OpenClawConnectionProbe | null>(null);
  const [isTestingOpenClaw, setIsTestingOpenClaw] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("btc");
  const [btcSnapshot, setBtcSnapshot] = useState<MarketSnapshot | null>(null);
  const [krSnapshot, setKrSnapshot] = useState<MarketSnapshot | null>(null);
  const [usSnapshot, setUsSnapshot] = useState<MarketSnapshot | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [orders, setOrders] = useState<TradeOrder[]>([]);
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(null);
  const [minutesHistory, setMinutesHistory] = useState<MeetingSessionRecord[]>([]);
  const [sessionId, setSessionId] = useState(() => uid("session"));
  const [agentStatus, setAgentStatus] = useState<Record<AgentId, AgentStatus>>({
    assistant: "idle",
    analyst: "idle"
  });
  const [taskHistory, setTaskHistory] = useState<MeetingTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskArtifacts, setTaskArtifacts] = useState<Record<string, MeetingTaskArtifacts>>({});
  const [tradeForm, setTradeForm] = useState<TradeFormState>({
    symbol: KR_DEFAULT_SYMBOLS[0],
    side: "buy",
    orderType: "market",
    quantity: "10",
    limitPrice: ""
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordStopTimerRef = useRef<number | null>(null);
  const speechRunRef = useRef(0);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const personaHydratedRef = useRef(false);

  function stopCameraPreview() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }

  const agents = useMemo(() => getAgents(locale, personaOverrides), [locale, personaOverrides]);
  const agentsById = useMemo(() => getAgentsById(locale, personaOverrides), [locale, personaOverrides]);
  const responseModeOptions = useMemo(
    () => getResponseModeOptions(locale, agentsById.assistant.name, agentsById.analyst.name),
    [agentsById.assistant.name, agentsById.analyst.name, locale]
  );
  const speedModeOptions = useMemo(() => getSpeedModeOptions(locale), [locale]);

  const selectedSnapshot = useMemo(() => {
    if (activeTab === "btc") return btcSnapshot;
    if (activeTab === "us") return usSnapshot;
    return krSnapshot;
  }, [activeTab, btcSnapshot, krSnapshot, usSnapshot]);

  const selectedTask = useMemo(
    () => taskHistory.find((task) => task.taskId === selectedTaskId) ?? taskHistory[0] ?? null,
    [taskHistory, selectedTaskId]
  );
  const selectedArtifacts = selectedTask ? taskArtifacts[selectedTask.taskId] : undefined;
  const latestMessages = useMemo(
    () => ({
      assistant: findLatestAgentMessage(timeline, "assistant") ?? agentsById.assistant.role,
      analyst: findLatestAgentMessage(timeline, "analyst") ?? agentsById.analyst.role
    }),
    [agentsById.assistant.role, agentsById.analyst.role, timeline]
  );
  const tradeSymbols = useMemo(
    () => krSnapshot?.watchlist.map((quote) => ({ value: quote.symbol, label: `${quote.symbol} ${quote.name}` })) ?? KR_DEFAULT_SYMBOLS.map((symbol) => ({ value: symbol, label: symbol })),
    [krSnapshot]
  );
  const completedTaskCount = taskHistory.filter((task) => task.status === "succeeded").length;
  const latestSavedAt = minutes?.updatedAt ? formatTime(minutes.updatedAt, copy.app.dateLocale) : "--:--";
  const snapshotUpdatedAt = selectedSnapshot?.updatedAt ? formatTime(selectedSnapshot.updatedAt, copy.app.dateLocale) : "--:--";
  const activeTabLabel = tabLabels[activeTab];
  const selectedSnapshotSummary = getSnapshotSummary(selectedSnapshot, copy, locale);
  const selectedSnapshotStatusLabel = labelForBadge(selectedSnapshot?.status || "loading", locale);
  const marketStatusDotClass =
    selectedSnapshot?.status === "live"
      ? "bg-mint"
      : selectedSnapshot?.status === "delayed"
        ? "bg-amber-400"
        : selectedSnapshot?.status === "demo"
          ? "bg-cobalt"
          : "bg-ink/28";
  const meetingShellTitle = experienceCopy.meetingOverviewTitle;
  const selectedSnapshotDetail =
    [activeTabLabel, describeMarketSession(selectedSnapshot?.session, locale)].filter(Boolean).join(" · ") ||
    selectedSnapshotSummary;

  const availableFeatureLabels = [
    browserSpeechSupported ? copy.meeting.browserStt : null,
    capabilities?.openaiStt ? copy.meeting.whisper : null,
    browserTtsSupported ? copy.meeting.browserTts : null,
    capabilities?.elevenLabsTts ? copy.meeting.elevenLabs : null,
    copy.meeting.openClawResearch,
    capabilities?.openclawChat ? (locale === "ko" ? "OpenClaw 회의" : "OpenClaw Meeting") : null
  ].filter(Boolean) as string[];
  useEffect(() => {
    const recognitionSource = (window as Window & {
      SpeechRecognition?: new () => BrowserSpeechRecognition;
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    }).SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: new () => BrowserSpeechRecognition }).webkitSpeechRecognition;

    setBrowserSpeechSupported(Boolean(recognitionSource));
    setBrowserTtsSupported("speechSynthesis" in window);

    try {
      const stored = window.localStorage.getItem(MINUTES_STORAGE_KEY);
      if (stored) {
        setMinutesHistory(JSON.parse(stored) as MeetingSessionRecord[]);
      } else {
        setMinutesHistory([]);
      }
    } catch {
      window.localStorage.removeItem(MINUTES_STORAGE_KEY);
      setMinutesHistory([]);
    }

    setPersonaOverrides(readStoredPersonas(locale));
    personaHydratedRef.current = true;
  }, [locale]);

  useEffect(() => {
    if (!personaHydratedRef.current) {
      return;
    }

    persistPersonas(personaOverrides);
  }, [personaOverrides]);

  useEffect(() => {
    const element = composerRef.current;
    if (!element) {
      return;
    }

    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [input]);

  useEffect(() => {
    let mounted = true;

    async function syncCamera() {
      if (!cameraEnabled) {
        stopCameraPreview();
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        stopCameraPreview();
        cameraStreamRef.current = stream;
        setCameraReady(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch {
        setCameraReady(false);
      }
    }

    void syncCamera();
    return () => {
      mounted = false;
      stopCameraPreview();
    };
  }, [cameraEnabled]);

  useEffect(() => {
    return () => {
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      recognitionRef.current?.stop?.();
      mediaRecorderRef.current?.stop?.();
      cancelSpeech();
      if (recordStopTimerRef.current) {
        window.clearTimeout(recordStopTimerRef.current);
      }
    };
  }, []);

  async function fetchJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      cache: "no-store"
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `${response.status}`);
    }
    return (await response.json()) as T;
  }

  async function refreshCapabilities() {
    const data = await fetchJson<Capabilities>("/api/system/capabilities");
    startTransition(() => {
      setCapabilities(data);
      if (!data.openclawRemote) {
        setOpenClawProbe(null);
      }
    });
  }

  async function testOpenClawConnection() {
    if (isTestingOpenClaw) {
      return;
    }

    setIsTestingOpenClaw(true);
    try {
      const data = await fetchJson<OpenClawConnectionProbe>("/api/system/openclaw/test", { method: "POST" });
      startTransition(() => setOpenClawProbe(data));
      setNotice(
        data.status === "reachable"
          ? locale === "ko"
            ? "OpenClaw 연결을 확인했습니다."
            : "OpenClaw connection verified."
          : data.status === "unconfigured"
            ? locale === "ko"
              ? "OpenClaw가 아직 설정되지 않았습니다. .env.local에 연결 정보를 먼저 입력하세요."
              : "OpenClaw is not configured yet. Add it to .env.local."
            : locale === "ko"
              ? "OpenClaw 연결 테스트가 실패했습니다. base URL, 토큰, /chat 또는 /health 응답을 확인하세요."
              : "OpenClaw connection test failed. Check the base URL, token, and /chat or /health response."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "OpenClaw connection test failed.";
      startTransition(() =>
        setOpenClawProbe({
          configured: Boolean(capabilities?.openclawRemote),
          reachable: false,
          status: capabilities?.openclawRemote ? "unreachable" : "unconfigured",
          checkedAt: new Date().toISOString(),
          baseUrl: "",
          chatPath: "/chat",
          tasksPath: "/tasks",
          message
        })
      );
      setNotice(locale === "ko" ? "OpenClaw 연결 테스트를 호출하지 못했습니다." : "Failed to call the OpenClaw connection test.");
    } finally {
      setIsTestingOpenClaw(false);
    }
  }

async function refreshBtc() {
    const data = await fetchJson<MarketSnapshot>("/api/markets/btc");
    startTransition(() => setBtcSnapshot(data));
  }

  async function refreshKr() {
    const data = await fetchJson<MarketSnapshot>(`/api/markets/kr?symbols=${KR_DEFAULT_SYMBOLS.join(",")}`);
    startTransition(() => setKrSnapshot(data));
  }

  async function refreshUs() {
    const data = await fetchJson<MarketSnapshot>(`/api/markets/us?symbols=${US_DEFAULT_SYMBOLS.join(",")}`);
    startTransition(() => setUsSnapshot(data));
  }

  async function refreshTrading() {
    const [account, orderHistory] = await Promise.all([
      fetchJson<PortfolioSnapshot>("/api/trading/account"),
      fetchJson<TradeOrder[]>("/api/trading/orders")
    ]);
    startTransition(() => {
      setPortfolio(account);
      setOrders(orderHistory);
    });
  }

  useEffect(() => {
    void refreshCapabilities();
    void refreshBtc();
    void refreshKr();
    void refreshUs();
    void refreshTrading();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (activeTab === "btc") {
        void refreshBtc();
      } else if (activeTab === "us") {
        void refreshUs();
      } else {
        void refreshKr();
      }
      if (activeTab === "trading") {
        void refreshTrading();
      }
    }, activeTab === "btc" ? 30_000 : 15_000);

    return () => window.clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshTrading();
    }, 20_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!btcSnapshot) {
      return;
    }

    try {
      const socket = new WebSocket("wss://api.upbit.com/websocket/v1");
      socket.binaryType = "arraybuffer";
      socket.onopen = () => {
        socket.send(
          JSON.stringify([
            { ticket: `openclawweb-${Date.now()}` },
            { type: "ticker", codes: ["KRW-BTC"] },
            { format: "DEFAULT" }
          ])
        );
      };
      socket.onmessage = (event) => {
        const raw = typeof event.data === "string" ? event.data : new TextDecoder().decode(new Uint8Array(event.data));
        const payload = JSON.parse(raw) as {
          code?: string;
          trade_price?: number;
          signed_change_price?: number;
          signed_change_rate?: number;
          acc_trade_price_24h?: number;
        };
        if (payload.code !== "KRW-BTC") {
          return;
        }

        startTransition(() => {
          setBtcSnapshot((previous) => {
            if (!previous || previous.watchlist.length === 0) {
              return previous;
            }
            const current = previous.watchlist[0];
            return {
              ...previous,
              updatedAt: new Date().toISOString(),
              watchlist: [
                {
                  ...current,
                  price: payload.trade_price ?? current.price,
                  change: payload.signed_change_price ?? current.change,
                  changePercent: (payload.signed_change_rate ?? current.changePercent / 100) * 100,
                  volume: payload.acc_trade_price_24h ?? current.volume
                }
              ]
            };
          });
        });
      };

      return () => socket.close();
    } catch {
      return undefined;
    }
  }, [btcSnapshot?.watchlist.length]);

  function cancelSpeech() {
    speechRunRef.current += 1;
    audioElementRef.current?.pause();
    audioElementRef.current = null;
    window.speechSynthesis?.cancel();
  }

  function persistSessions(next: MeetingSessionRecord[]) {
    setMinutesHistory(next);
    window.localStorage.setItem(MINUTES_STORAGE_KEY, JSON.stringify(next));
  }

  function updatePersona(agentId: AgentId, patch: Partial<NonNullable<AgentPersonaOverrides[AgentId]>>) {
    setPersonaOverrides((previous) =>
      buildPersonaState(locale, {
        ...previous,
        [agentId]: {
          ...previous[agentId],
          ...patch
        }
      })
    );
  }

  function resetPersona(agentId: AgentId) {
    const defaults = getDefaultAgentPersonas(locale);
    setPersonaOverrides((previous) => ({
      ...previous,
      [agentId]: defaults[agentId]
    }));
  }

  function setOnlyStatus(agentId: AgentId, status: AgentStatus) {
    setAgentStatus({
      assistant: agentId === "assistant" ? status : "idle",
      analyst: agentId === "analyst" ? status : "idle"
    });
  }

  function pushTimeline(item: Omit<MeetingTimelineItem, "id">) {
    setTimeline((previous) => [...previous, createTimelineItem(item)]);
  }

  function upsertTask(task: MeetingTask) {
    setTaskHistory((previous) => [task, ...previous.filter((entry) => entry.taskId !== task.taskId)].slice(0, 10));
    setSelectedTaskId(task.taskId);
  }

  function speakBrowser(text: string, agentId: AgentId, runId: number) {
    return new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = copy.app.speechLocale;
      utterance.rate = 1.02;
      utterance.onstart = () => setOnlyStatus(agentId, "speaking");
      utterance.onend = () => {
        if (runId === speechRunRef.current) {
          setAgentStatus({ assistant: "idle", analyst: "idle" });
        }
        resolve();
      };
      utterance.onerror = () => {
        if (runId === speechRunRef.current) {
          setAgentStatus({ assistant: "idle", analyst: "idle" });
        }
        resolve();
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  async function speakElevenLabs(text: string, agentId: AgentId, runId: number) {
    if (!capabilities?.elevenLabsTts) {
      return speakBrowser(text, agentId, runId);
    }

    try {
      const response = await fetch("/api/meeting/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId: process.env.NEXT_PUBLIC_ELEVENLABS_DEFAULT_VOICE_ID || "" })
      });
      if (!response.ok) {
        return speakBrowser(text, agentId, runId);
      }

      const buffer = await response.arrayBuffer();
      const blob = new Blob([buffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioElementRef.current = audio;
      setOnlyStatus(agentId, "speaking");
      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (runId === speechRunRef.current) {
            setAgentStatus({ assistant: "idle", analyst: "idle" });
          }
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        void audio.play().catch(() => resolve());
      });
    } catch {
      return speakBrowser(text, agentId, runId);
    }
  }

  async function autoplayTurns(turns: MeetingRoundResponse["turns"]) {
    if (autoSpeakMode === "off") {
      return;
    }

    const runId = ++speechRunRef.current;
    const queue = autoSpeakMode === "all" ? turns : turns.filter((turn) => turn.phase === "summary");
    for (const turn of queue) {
      if (runId !== speechRunRef.current) {
        return;
      }
      if (ttsMode === "elevenlabs") {
        await speakElevenLabs(turn.text, turn.agentId, runId);
      } else {
        await speakBrowser(turn.text, turn.agentId, runId);
      }
    }
  }

  async function handleTranscriptReady(transcript: string, source: "browser" | "whisper") {
    const normalized = transcript.trim();
    if (!normalized) {
      return;
    }

    if (isSending) {
      setInput(normalized);
      setNotice(source === "browser" ? copy.meeting.notices.transcriptInserted : copy.meeting.notices.whisperInserted);
      return;
    }

    setInput(normalized);
    setNotice(
      source === "browser" ? copy.meeting.voiceSubmittingBrowser : copy.meeting.voiceSubmittingWhisper
    );
    await handleSend(normalized);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function startBrowserSTT() {
    const Recognition =
      (window as Window & { SpeechRecognition?: new () => BrowserSpeechRecognition; webkitSpeechRecognition?: new () => BrowserSpeechRecognition }).SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: new () => BrowserSpeechRecognition }).webkitSpeechRecognition;

    if (!Recognition) {
      setNotice(copy.meeting.notices.browserSttUnsupported);
      return;
    }

    const recognition = new Recognition();
    recognition.lang = copy.app.speechLocale;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: unknown) => {
      const result = event as { results?: ArrayLike<ArrayLike<{ transcript?: string }>> };
      const transcript = result.results?.[0]?.[0]?.transcript || "";
      if (transcript) {
        void handleTranscriptReady(transcript, "browser");
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function handleMicAction() {
    if (sttMode === "browser") {
      if (isListening) {
        recognitionRef.current?.stop?.();
        setIsListening(false);
        return;
      }
      startBrowserSTT();
      return;
    }

    void toggleWhisperRecording();
  }

  async function toggleWhisperRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const mimeType = pickSpeechMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        setIsRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" });
        const formData = new FormData();
        formData.append("file", blob, "speech.webm");
        formData.append("model", "gpt-4o-mini-transcribe");
        try {
          const response = await fetch("/api/meeting/stt", { method: "POST", body: formData });
          if (!response.ok) {
            setNotice(copy.meeting.notices.whisperFailed);
            return;
          }
          const data = (await response.json()) as { text: string };
          await handleTranscriptReady(data.text || "", "whisper");
        } catch {
          setNotice(copy.meeting.notices.whisperFailed);
        }
      };
      recorder.start();
      setIsRecording(true);
      setNotice(copy.meeting.notices.whisperRecording);
      if (recordStopTimerRef.current) {
        window.clearTimeout(recordStopTimerRef.current);
      }
      recordStopTimerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, 15_000);
    } catch {
      setNotice(copy.meeting.notices.audioPermissionUnavailable);
    }
  }

  function persistMeeting(nextMinutes: MeetingMinutes, nextTimeline: MeetingTimelineItem[], userMessage: string) {
    setMinutes(nextMinutes);
    setSessionId(nextMinutes.sessionId);
    const record: MeetingSessionRecord = {
      id: nextMinutes.sessionId,
      createdAt: nextMinutes.updatedAt,
      minutes: nextMinutes,
      turns: extractTurns(nextTimeline),
      userMessage
    };
    startTransition(() => {
      const next = [record, ...minutesHistory.filter((entry) => entry.id !== record.id)].slice(0, 20);
      persistSessions(next);
    });
  }

  async function handleSend(messageOverride?: string) {
    const message = (messageOverride ?? input).trim();
    if (!message || isSending) {
      return;
    }

    cancelSpeech();
    setIsSending(true);
    setInput("");
    setAgentStatus(getPendingAgentStatus(responseMode));
    const baseTimeline = [...timeline];
    const userItem = createTimelineItem({
      ts: new Date().toISOString(),
      kind: "message",
      speakerType: "user",
      speakerLabel: copy.meeting.userLabel,
      badge: activeTab,
      text: message
    });
    let nextTimeline = [...baseTimeline, userItem];
    setTimeline(nextTimeline);

    const requestPayload: MeetingRoundRequest = {
      message,
      history: extractHistory(nextTimeline),
      activeTab,
      marketSnapshot: activeTab === "btc" ? btcSnapshot : activeTab === "us" ? usSnapshot : krSnapshot,
      portfolioSnapshot: portfolio,
      minutes: minutes ? { ...minutes, sessionId } : null,
      locale,
      personaOverrides,
      responseMode,
      speedMode
    };

    const commitTimeline = () => {
      const snapshot = [...nextTimeline];
      setTimeline(snapshot);
      return snapshot;
    };

    const upsertAgentItem = (args: {
      id: string;
      ts: string;
      agentId: AgentId;
      speakerLabel: string;
      badge: string;
      text: string;
      provider?: Provider;
    }) => {
      const nextItem = createTimelineItem({
        id: args.id,
        ts: args.ts,
        kind: "message",
        speakerType: "agent",
        agentId: args.agentId,
        speakerLabel: args.speakerLabel,
        badge: args.badge,
        text: args.text,
        provider: args.provider
      });
      const index = nextTimeline.findIndex((entry) => entry.id === args.id);
      if (index === -1) {
        nextTimeline = [...nextTimeline, nextItem];
      } else {
        nextTimeline = [
          ...nextTimeline.slice(0, index),
          {
            ...nextTimeline[index],
            ...nextItem
          },
          ...nextTimeline.slice(index + 1)
        ];
      }
      commitTimeline();
    };

    try {
      const data = await fetchMeetingRoundStream(requestPayload, async (event) => {
        switch (event.type) {
          case "start": {
            const speakerName = agentsById[event.firstSpeakerId].name;
            setNotice(
              locale === "ko"
                ? `${speakerName}이 답변을 준비 중입니다.`
                : `${speakerName} is preparing a reply.`
            );
            break;
          }
          case "turn_start": {
            setOnlyStatus(event.agentId, "thinking");
            upsertAgentItem({
              id: event.turnId,
              ts: event.ts,
              agentId: event.agentId,
              speakerLabel: event.speakerLabel,
              badge: event.phase,
              text: "...",
              provider: event.provider
            });
            break;
          }
          case "turn_partial": {
            setOnlyStatus(event.agentId, "thinking");
            upsertAgentItem({
              id: event.turnId,
              ts: event.ts,
              agentId: event.agentId,
              speakerLabel: agentsById[event.agentId].name,
              badge: event.phase,
              text: event.text || "...",
              provider: event.provider
            });
            break;
          }
          case "turn_complete": {
            upsertAgentItem({
              id: event.turn.id,
              ts: event.turn.timestamp,
              agentId: event.turn.agentId,
              speakerLabel: event.turn.speakerLabel,
              badge: event.turn.phase,
              text: event.turn.text,
              provider: event.turn.provider
            });
            break;
          }
          case "research_start": {
            setNotice(
              locale === "ko"
                ? "OpenClaw가 추가 조사를 시작했습니다."
                : "OpenClaw started a follow-up research task."
            );
            break;
          }
          case "research_complete": {
            upsertTask(event.research.task);
            setTaskArtifacts((previous) => ({ ...previous, [event.research.task.taskId]: event.research.artifacts }));
            setActiveDockTab("research");
            setDockOpen(true);
            break;
          }
          default:
            break;
        }
      });

      if (data.research) {
        const research = data.research;
        upsertTask(research.task);
        setTaskArtifacts((previous) => ({ ...previous, [research.task.taskId]: research.artifacts }));
        setActiveDockTab("research");
        setDockOpen(true);
      }

      for (const turn of data.turns) {
        upsertAgentItem({
          id: turn.id,
          ts: turn.timestamp,
          agentId: turn.agentId,
          speakerLabel: turn.speakerLabel,
          badge: turn.phase,
          text: turn.text,
          provider: turn.provider
        });
      }

      setAgentStatus({ assistant: "idle", analyst: "idle" });
      const finalizedTimeline = commitTimeline();
      persistMeeting(data.minutes, finalizedTimeline, message);
      const usedFallbackMeetingProvider = capabilities?.openclawChat && data.provider !== "openclaw";
      setNotice(
        usedFallbackMeetingProvider
          ? locale === "ko"
            ? `${agentsById[data.meta.finalSpeakerId].name}이 답변했습니다. OpenClaw 회의가 불가해 ${data.provider}로 대신 응답했습니다.`
            : `${agentsById[data.meta.finalSpeakerId].name} replied. OpenClaw meeting was unavailable, so ${data.provider} was used instead.`
          : data.meta.usedResearch
            ? locale === "ko"
              ? `${agentsById[data.meta.finalSpeakerId].name}이 조사 결과를 반영해 답변했습니다.`
              : `${agentsById[data.meta.finalSpeakerId].name} answered with research applied.`
            : locale === "ko"
              ? `${agentsById[data.meta.finalSpeakerId].name}이 답변했습니다.`
              : `${agentsById[data.meta.finalSpeakerId].name} replied.`
      );
      void autoplayTurns(data.turns);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : copy.meeting.notices.meetingFailed;
      const likelyOpenClawError =
        Boolean(capabilities?.openclawRemote) &&
        /(openclaw|\/chat|\/tasks|health|connection|fetch failed|econnrefused|401|403|404|token)/i.test(errorText);

      pushTimeline({
        ts: new Date().toISOString(),
        kind: "message",
        speakerType: "system",
        speakerLabel: copy.meeting.systemLabel,
        badge: "error",
        text: errorText
      });
      setAgentStatus({ assistant: "idle", analyst: "idle" });
      setNotice(
        likelyOpenClawError
          ? locale === "ko"
            ? "회의 응답 생성에 실패했습니다. OpenClaw base URL, 토큰, /chat 연결 상태를 확인해 주세요."
            : "Failed to generate the meeting reply. Check the OpenClaw base URL, token, and /chat connectivity."
          : copy.meeting.notices.meetingFailed
      );
    } finally {
      setIsSending(false);
      window.setTimeout(() => composerRef.current?.focus(), 0);
    }
  }
  async function handleTradeSubmit() {
    if (isPlacingOrder) {
      return;
    }
    setIsPlacingOrder(true);
    try {
      const payload: TradeOrderRequest = {
        symbol: tradeForm.symbol,
        side: tradeForm.side,
        orderType: tradeForm.orderType,
        quantity: Number(tradeForm.quantity),
        limitPrice: tradeForm.orderType === "limit" ? Number(tradeForm.limitPrice) : undefined
      };
      const result = await fetchJson<{ account: PortfolioSnapshot; order: TradeOrder }>("/api/trading/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setPortfolio(result.account);
      setOrders((previous) => [result.order, ...previous.filter((entry) => entry.id !== result.order.id)]);
      pushTimeline({
        ts: result.order.updatedAt,
        kind: "task",
        speakerType: "system",
        speakerLabel: copy.tabs.trading,
        badge: result.order.status,
        text: `${labelForOrderSide(result.order.side, locale)} ${result.order.symbol} x${formatNumber(result.order.quantity, 0, copy.app.dateLocale)} ${labelForBadge(result.order.status, locale)}`
      });
      setNotice(copy.meeting.notices.paperOrder(labelForBadge(result.order.status, locale)));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : copy.meeting.notices.paperOrderFailed);
    } finally {
      setIsPlacingOrder(false);
    }
  }

  function handleDownloadMinutes() {
    if (!minutes) return;
    downloadText(
      copy.meeting.downloadFilename(minutes.updatedAt.slice(0, 10)),
      buildMinutesMarkdown(minutes, timeline, copy, tabLabels)
    );
  }

  function handleLocaleChange(nextLocale: AppLocale) {
    if (nextLocale === locale) {
      return;
    }

    document.cookie = `${APP_LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.location.reload();
  }

  function resetMeeting() {
    cancelSpeech();
    setTimeline([]);
    setMinutes(null);
    setSessionId(uid("session"));
    setTaskHistory([]);
    setSelectedTaskId(null);
    setTaskArtifacts({});
    setAgentStatus({ assistant: "idle", analyst: "idle" });
    setActiveDockTab("session");
    setNotice(copy.meeting.notices.reset);
  }

  return (
    <div className="min-h-dvh bg-paper px-3 py-3 text-ink md:px-5">
      <div className="dashboard-shell mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-[1860px] flex-col gap-3 rounded-[34px] border border-white/50 bg-white/35 p-3 shadow-glow backdrop-blur-xl">
        <header className="panel-surface rounded-[30px] px-5 py-5">
          <div className="space-y-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge>{copy.meeting.headerBadge}</Badge>
              <Badge variant="signal">{experienceCopy.marketHubEyebrow}</Badge>
              <Badge variant="outline">{copy.meeting.tabBadge(activeTabLabel)}</Badge>
              {focusMode ? <Badge variant="outline">{locale === "ko" ? "집중 모드" : "Focus mode"}</Badge> : null}
            </div>
            <div className="space-y-3">
              <h1 className="max-w-4xl font-display text-3xl font-semibold md:text-[2.8rem]">{meetingShellTitle}</h1>
              <div className="inline-flex max-w-4xl items-start gap-2 rounded-full border border-ink/10 bg-white px-3 py-2 text-xs text-mist shadow-[0_10px_24px_rgba(18,24,36,0.04)]">
                <span className={cn("mt-1 h-2 w-2 rounded-full", isSending ? "bg-amber-400 animate-pulse" : "bg-mint")} />
                <span className="leading-5">{notice}</span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <OverviewMetric
                label={experienceCopy.sessionWorkspace}
                value={activeTabLabel}
                detail={selectedSnapshot?.headline || experienceCopy.marketHubDescription}
                tone="cobalt"
              />
              <OverviewMetric
                label={copy.meeting.marketPulse}
                value={selectedSnapshotStatusLabel}
                detail={[describeMarketSession(selectedSnapshot?.session, locale), snapshotUpdatedAt].filter(Boolean).join(" · ")}
                tone={selectedSnapshot?.status === "live" ? "mint" : selectedSnapshot?.status === "delayed" ? "ember" : "default"}
              />
              <OverviewMetric
                label={copy.meeting.minutesTitle}
                value={latestSavedAt}
                detail={minutes?.title || copy.meeting.timelineEmpty}
                tone="mint"
              />
            </div>
          </div>
        </header>

        <div
          className={cn(
            "grid min-h-0 flex-1 gap-3 xl:items-stretch",
            focusMode
              ? "xl:grid-cols-1"
              : dockOpen
                ? "xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)_minmax(320px,360px)]"
                : "xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)_112px]"
          )}
        >
          <Card className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden p-4 lg:p-5 xl:h-[calc(100dvh-14rem)]", focusMode && "hidden")}>
            <SectionHeader
              eyebrow={copy.meeting.workspaceEyebrow}
              title={copy.meeting.workspaceTitle}
              description={selectedSnapshot?.headline || experienceCopy.marketHubDescription}
            />
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-3">
                {Object.entries(tabLabels).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as WorkspaceTab)}
                    className="group flex min-w-[68px] flex-col items-center gap-2 text-center"
                  >
                    <span
                      className={cn(
                        "grid h-14 w-14 place-items-center rounded-full border text-xs font-semibold uppercase tracking-[0.16em] transition",
                        activeTab === tab
                          ? "border-ink/80 bg-white text-ink shadow-[0_16px_36px_rgba(18,24,36,0.12)]"
                          : "border-ink/10 bg-white text-ink shadow-[0_10px_24px_rgba(18,24,36,0.05)] group-hover:-translate-y-0.5"
                      )}
                    >
                      {WORKSPACE_TAB_MONOGRAMS[tab as WorkspaceTab]}
                    </span>
                    <span className={cn("text-[11px] font-medium leading-4 text-mist", activeTab === tab && "text-ink")}>{label}</span>
                  </button>
                ))}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-2 text-xs text-ink shadow-[0_10px_24px_rgba(18,24,36,0.05)]">
                <span className={cn("h-2.5 w-2.5 rounded-full", marketStatusDotClass)} />
                <span className="font-semibold">{selectedSnapshotStatusLabel}</span>
                <span className="text-mist">{snapshotUpdatedAt}</span>
              </div>
            </div>
            <ScrollArea className="meeting-column-scroll min-h-0 flex-1 pr-1">
              <div className="space-y-4">
                {activeTab === "btc" ? (
                  <div className="space-y-4">
                    <Sparkline snapshot={btcSnapshot} copy={copy} />
                    <MarketQuoteSection
                      title={copy.meeting.btckrw}
                      quotes={btcSnapshot?.watchlist ?? []}
                      copy={copy}
                      locale={copy.app.dateLocale}
                    />
                  </div>
                ) : null}
                {activeTab === "kr" ? (
                  <div className="space-y-4">
                    <MarketQuoteSection
                      title={copy.meeting.kospiKosdaq}
                      quotes={krSnapshot?.indices ?? []}
                      copy={copy}
                      locale={copy.app.dateLocale}
                    />
                    <MarketQuoteSection
                      title={copy.meeting.krWatchlist}
                      quotes={krSnapshot?.watchlist ?? []}
                      copy={copy}
                      locale={copy.app.dateLocale}
                    />
                  </div>
                ) : null}
                {activeTab === "us" ? (
                  <div className="space-y-4">
                    <MarketQuoteSection
                      title={copy.meeting.usProxies}
                      quotes={usSnapshot?.indices ?? []}
                      copy={copy}
                      locale={copy.app.dateLocale}
                    />
                    <MarketQuoteSection
                      title={copy.meeting.usWatchlist}
                      quotes={usSnapshot?.watchlist ?? []}
                      copy={copy}
                      locale={copy.app.dateLocale}
                    />
                  </div>
                ) : null}
                {activeTab === "trading" ? (
                  <div className="space-y-4">
                    <div className="grid gap-3">
                      <OverviewMetric
                        label={copy.meeting.tradingCash}
                        value={formatCurrency(portfolio?.cash ?? 0, portfolio?.currency || "KRW", copy.app.dateLocale)}
                        detail={snapshotUpdatedAt}
                      />
                      <OverviewMetric
                        label={copy.meeting.tradingEquity}
                        value={formatCurrency(portfolio?.equity ?? 0, portfolio?.currency || "KRW", copy.app.dateLocale)}
                        detail={portfolio?.broker || "demo"}
                        tone="mint"
                      />
                    </div>
                    <div className="rounded-[24px] border border-ink/10 bg-white/76 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
                      <div className="mb-3 section-kicker">{copy.meeting.paperTrade}</div>
                      <div className="space-y-3">
                        <select
                          className={cn(LARGE_SELECT_CLASS_NAME, "w-full")}
                          value={tradeForm.symbol}
                          onChange={(event) => setTradeForm((previous) => ({ ...previous, symbol: event.target.value }))}
                        >
                          {tradeSymbols.map((symbol) => (
                            <option key={symbol.value} value={symbol.value}>
                              {symbol.label}
                            </option>
                          ))}
                        </select>
                        <div className="grid gap-2">
                          <select
                            className={LARGE_SELECT_CLASS_NAME}
                            value={tradeForm.side}
                            onChange={(event) =>
                              setTradeForm((previous) => ({ ...previous, side: event.target.value as TradeFormState["side"] }))
                            }
                          >
                            <option value="buy">{copy.trading.side.buy}</option>
                            <option value="sell">{copy.trading.side.sell}</option>
                          </select>
                          <select
                            className={LARGE_SELECT_CLASS_NAME}
                            value={tradeForm.orderType}
                            onChange={(event) =>
                              setTradeForm((previous) => ({
                                ...previous,
                                orderType: event.target.value as TradeFormState["orderType"]
                              }))
                            }
                          >
                            <option value="market">{copy.trading.orderType.market}</option>
                            <option value="limit">{copy.trading.orderType.limit}</option>
                          </select>
                        </div>
                        <div className="grid gap-2">
                          <Input
                            value={tradeForm.quantity}
                            onChange={(event) => setTradeForm((previous) => ({ ...previous, quantity: event.target.value }))}
                            placeholder={copy.meeting.quantityPlaceholder}
                            inputMode="numeric"
                          />
                          <Input
                            value={tradeForm.limitPrice}
                            onChange={(event) =>
                              setTradeForm((previous) => ({ ...previous, limitPrice: event.target.value }))
                            }
                            placeholder={copy.meeting.limitPlaceholder}
                            inputMode="numeric"
                            disabled={tradeForm.orderType === "market"}
                          />
                        </div>
                        <Button onClick={() => void handleTradeSubmit()} disabled={isPlacingOrder}>
                          {isPlacingOrder ? copy.meeting.submittingOrder : copy.meeting.submitOrder}
                        </Button>
                      </div>
                    </div>
                    <MarketQuoteSection
                      title={copy.meeting.positions}
                      quotes={(portfolio?.positions ?? []).map((position) => ({
                        symbol: position.symbol,
                        name: position.name,
                        market: "KRX",
                        price: position.lastPrice,
                        change: position.unrealizedPnl,
                        changePercent: position.unrealizedPnlPercent,
                        currency: portfolio?.currency || "KRW",
                        updatedAt: portfolio?.updatedAt || new Date().toISOString()
                      }))}
                      copy={copy}
                      locale={copy.app.dateLocale}
                    />
                    <div className="space-y-2">
                      <div className="section-kicker">{copy.meeting.recentOrders}</div>
                      {orders.slice(0, 5).map((order) => (
                        <div
                          key={order.id}
                          className="rounded-[20px] border border-ink/10 bg-white/78 p-3 text-sm shadow-[0_12px_28px_rgba(18,24,36,0.04)]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {order.symbol} x{formatNumber(order.quantity, 0, copy.app.dateLocale)}
                            </span>
                            <Badge variant="outline">{labelForBadge(order.status, locale)}</Badge>
                          </div>
                          <div className="mt-1 text-xs text-mist">
                            {labelForOrderSide(order.side, locale)} {labelForOrderType(order.orderType, locale)}{" "}
                            {order.fillPrice
                              ? formatCurrency(order.fillPrice, "KRW", copy.app.dateLocale)
                              : order.limitPrice
                                ? formatCurrency(order.limitPrice, "KRW", copy.app.dateLocale)
                                : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </ScrollArea>
            <div className="mt-4 rounded-[22px] border border-ink/10 bg-white/60 p-4 text-sm text-mist">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-mist">{locale === "ko" ? "기능" : "Capabilities"}</div>
              <div className="flex flex-wrap gap-2">
                {availableFeatureLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium text-ink/80"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden xl:h-[calc(100dvh-14rem)]">
            <ParticipantStagePanel
              copy={copy}
              locale={locale}
              agents={agents}
              agentStatus={agentStatus}
              latestMessages={latestMessages}
              cameraEnabled={cameraEnabled}
              cameraReady={cameraReady}
              videoRef={videoRef}
              focusMode={focusMode}
              activeTabLabel={activeTabLabel}
              snapshotStatusLabel={selectedSnapshotStatusLabel}
              snapshotDetail={selectedSnapshotDetail}
              snapshotUpdatedAt={snapshotUpdatedAt}
              timeline={timeline}
              input={input}
              isSending={isSending}
              sttMode={sttMode}
              responseMode={responseMode}
              speedMode={speedMode}
              speedModeOptions={speedModeOptions}
              showAdvancedControls={showAdvancedComposerControls}
              responseModeOptions={responseModeOptions}
              isListening={isListening}
              isRecording={isRecording}
              browserSpeechSupported={browserSpeechSupported}
              openAiSttSupported={Boolean(capabilities?.openaiStt)}
              composerRef={composerRef}
              onInputChange={setInput}
              onComposerKeyDown={handleComposerKeyDown}
              onMicAction={handleMicAction}
              onSpeedModeChange={setSpeedMode}
              onToggleAdvancedControls={() => setShowAdvancedComposerControls((previous) => !previous)}
              onToggleFocusMode={() => setFocusMode((previous) => !previous)}
              onToggleCamera={() => setCameraEnabled((previous) => !previous)}
              onResponseModeChange={setResponseMode}
              onSend={() => void handleSend()}
              onReset={resetMeeting}
            />
          </div>

          <div className={cn(focusMode && "hidden")}>
            <MeetingDebuggerDock
            copy={copy}
            locale={locale}
            open={dockOpen}
            activeTab={activeDockTab}
            onToggle={() => setDockOpen((previous) => !previous)}
            onTabChange={setActiveDockTab}
            agents={agents}
            timeline={timeline}
            activeTabLabel={activeTabLabel}
            latestSavedAt={latestSavedAt}
            capabilities={capabilities}
            openClawProbe={openClawProbe}
            isTestingOpenClaw={isTestingOpenClaw}
            personas={personaOverrides}
            selectedTask={selectedTask}
            selectedArtifacts={selectedArtifacts}
            taskHistory={taskHistory}
            selectedTaskId={selectedTaskId}
            completedTaskCount={completedTaskCount}
            minutes={minutes}
            minutesHistory={minutesHistory}
            settingsHref={settingsHref}
            onPersonaChange={updatePersona}
            onPersonaReset={resetPersona}
            onSelectTask={setSelectedTaskId}
            onDownloadMinutes={handleDownloadMinutes}
            onSelectMinutes={setMinutes}
            onLocaleChange={handleLocaleChange}
            onTestOpenClaw={() => void testOpenClawConnection()}
          />
          </div>
        </div>
      </div>
    </div>
  );
}



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
  MeetingRoundResponse,
  MeetingResponseMode,
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
    label: { ko: "\uC624\uB85C\uB77C", en: "Aurora" },
    shellClass: "bg-white",
    haloClass: "hidden",
    badgeClass: "border-emerald-200/70 bg-emerald-50 text-ink",
    avatarClass: "border-emerald-200 bg-emerald-50 text-ink",
    previewClass: "border-t-4 border-emerald-300 bg-white"
  },
  graphite: {
    label: { ko: "\uADF8\uB798\uD30C\uC774\uD2B8", en: "Graphite" },
    shellClass: "bg-white",
    haloClass: "hidden",
    badgeClass: "border-slate-200 bg-slate-50 text-ink",
    avatarClass: "border-slate-200 bg-slate-50 text-ink",
    previewClass: "border-t-4 border-slate-300 bg-white"
  },
  sunset: {
    label: { ko: "\uC120\uC14B", en: "Sunset" },
    shellClass: "bg-white",
    haloClass: "hidden",
    badgeClass: "border-amber-200 bg-amber-50 text-ink",
    avatarClass: "border-amber-200 bg-amber-50 text-ink",
    previewClass: "border-t-4 border-amber-300 bg-white"
  },
  lagoon: {
    label: { ko: "\uB77C\uAD70", en: "Lagoon" },
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
    label: { ko: "\uCF54\uC5B4", en: "Core" }
  },
  orbit: {
    label: { ko: "\uC624\uBE57", en: "Orbit" }
  },
  signal: {
    label: { ko: "\uC2DC\uADF8\uB110", en: "Signal" }
  },
  grid: {
    label: { ko: "\uADF8\uB9AC\uB4DC", en: "Grid" }
  }
};
function getResponseModeOptions(locale: AppLocale, assistantLabel: string, analystLabel: string): ResponseModeOption[] {
  return [
    { value: "auto", label: locale === "ko" ? "자동" : "Auto" },
    { value: "analyst", label: locale === "ko" ? `${analystLabel}만` : `${analystLabel} only` },
    { value: "assistant", label: locale === "ko" ? `${assistantLabel}만` : `${assistantLabel} only` },
    { value: "both", label: locale === "ko" ? "둘 다" : "Both" }
  ];
}

function getResponseModeCaption(mode: MeetingResponseMode, options: ResponseModeOption[], locale: AppLocale) {
  const label = options.find((option) => option.value === mode)?.label ?? options[0]?.label ?? "";
  return locale === "ko" ? `답변 대상: ${label}` : `Reply target: ${label}`;
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
    open: "\uac1c\uc7a5",
    pre: "\uc7a5\uc804",
    post: "\uc2dc\uac04\uc678",
    closed: "\ud734\uc7a5"
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
      return locale === "ko" ? "\uc7a5\uc804 \uc2dc\uc138 \uad6c\uac04" : "Pre-market session";
    case "post":
      return locale === "ko" ? "\uc2dc\uac04\uc678 \uc2dc\uc138 \uad6c\uac04" : "After-hours session";
    case "open":
      return locale === "ko" ? "\uc815\uaddc\uc7a5 \uc9c4\ud589 \uc911" : "Regular session";
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
    return locale === "ko" ? "\ub9c8\uc9c0\ub9c9 \uc885\uac00" : "Last close";
  }

  if (snapshot?.session === "post") {
    return locale === "ko" ? "\ucd5c\uc2e0 \uccb4\uacb0" : "Latest trade";
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

function createTimelineItem(item: Omit<MeetingTimelineItem, "id">): MeetingTimelineItem {
  return { id: uid("timeline"), ...item };
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
        stageNotice: "\uBA54\uC2DC\uC9C0\uB97C \uBCF4\uB0B4\uBA74 \uC801\uD569\uD55C AI\uAC00 \uBA3C\uC800 \uB2F5\uD558\uACE0, \uD544\uC694\uD558\uBA74 \uC870\uC0AC\uAE4C\uC9C0 \uC774\uC5B4\uC9D1\uB2C8\uB2E4.",
        liveScriptEyebrow: "\uB77C\uC774\uBE0C \uC2A4\uD06C\uB9BD\uD2B8",
        liveScriptTitle: "\uD68C\uC758 \uB300\uD654",
        liveScriptDescription: "\uBA54\uC778 \uBC1C\uD45C \uD750\uB984\uACFC \uC2E4\uC81C \uCC44\uD305\uC744 \uD55C \uC2A4\uD2B8\uB9BC\uC73C\uB85C \uC815\uB9AC\uD569\uB2C8\uB2E4.",
        autoRouting: "AI \uC790\uB3D9 \uB77C\uC6B0\uD305",
        userCameraEyebrow: "\uB0B4 \uCE74\uBA54\uB77C",
        userCameraTitle: "\uB85C\uCEEC \uD654\uBA74",
        userCameraDescription: "\uB0B4 \uCE74\uBA54\uB77C \uBBF8\uB9AC\uBCF4\uAE30\uB294 \uC624\uB978\uCABD \uC544\uB798\uC5D0 \uACE0\uC815\uB429\uB2C8\uB2E4.",
        dockEyebrow: "\uB3C4\uD0B9 \uD328\uB110",
        dockTitle: "\uD3B8\uC9D1 / \uD68C\uC758\uB85D / \uC870\uC0AC",
        dockDescription: "\uC624\uB978\uCABD \uD328\uB110\uC5D0\uC11C AI \uD398\uB974\uC18C\uB098, \uD68C\uC758\uB85D, \uC870\uC0AC \uACB0\uACFC\uB97C \uBE60\uB974\uAC8C \uD655\uC778\uD569\uB2C8\uB2E4.",
        dockTabs: {
          session: "\uD3B8\uC9D1",
          minutes: "\uD68C\uC758\uB85D",
          research: "\uC870\uC0AC\uAE30\uB85D"
        } satisfies Record<DockTab, string>,
        dockOpen: "\uD328\uB110 \uC5F4\uB9BC",
        dockClosed: "\uD328\uB110 \uB2EB\uD798",
        openDock: "\uC5F4\uAE30",
        closeDock: "\uC811\uAE30",
        personaEyebrow: "AI \uD398\uB974\uC18C\uB098 \uD3B8\uC9D1",
        personaTitle: "\uC774\uB984 / \uB9D0\uD22C / \uCE74\uB4DC",
        personaDescription: "\uC11C\uC724\uACFC \uC774\uC548\uC758 \uD45C\uC2DC \uC774\uB984, \uB9D0\uD22C, \uC544\uBC14\uD0C0 \uD504\uB9AC\uC14B, \uCE74\uB4DC \uD14C\uB9C8\uB97C \uC870\uC815\uD569\uB2C8\uB2E4.",
        displayNameLabel: "\uC774\uB984",
        toneLabel: "\uB9D0\uD22C",
        avatarLabel: "\uC544\uBC14\uD0C0",
        avatarToneLabel: "\uCE74\uB4DC \uD14C\uB9C8",
        resetPersona: "\uCD08\uAE30\uD654",
        sessionActivity: "\uD3B8\uC9D1 \uB85C\uADF8",
        sessionEmpty: "\uC544\uC9C1 \uD3B8\uC9D1 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
        sessionWorkspace: "\uD65C\uC131 \uC2DC\uC7A5",
        sessionParticipants: "\uD45C\uC2DC \uC778\uC6D0",
        sessionSavedAt: "\uCD5C\uADFC \uD68C\uC758\uB85D",
        localeLabel: "\uC5B8\uC5B4",
        openSettings: "\uC124\uC815",
        minutesHistory: "\uC800\uC7A5\uB41C \uD68C\uC758\uB85D",
        researchNotes: "\uC870\uC0AC \uBA54\uBAA8",
        researchHistory: "\uC870\uC0AC \uAE30\uB85D",
        researchStatus: "\uC870\uC0AC \uC0C1\uD0DC",
        marketHubEyebrow: "\uC2DC\uC7A5 \uD5C8\uBE0C",
        marketHubDescription: "\uC67C\uCABD\uC5D0\uC11C \uC2DC\uC7A5\uC744 \uBCF4\uACE0, \uC624\uB978\uCABD\uC5D0\uC11C \uACB0\uC815\uACFC \uAE30\uB85D\uC744 \uC774\uC5B4\uAC11\uB2C8\uB2E4.",
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
    .slice(-10)
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
            <div className="flex flex-wrap items-center gap-2">
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
      <div className="grid gap-4">
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
        "relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-[30px] border border-ink/10 p-5 text-ink shadow-[0_22px_48px_rgba(18,24,36,0.08)]",
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
        <div className="relative mt-8 flex flex-1 flex-col justify-between gap-6">
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
        <div className="rounded-[26px] border border-ink/10 bg-white/90 p-5">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-mist">{agent.emoji}</div>
          <p className="line-clamp-5 text-sm leading-6 text-ink/84">{latestMessage}</p>
        </div>
      </div>
    </div>
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
  composerRef,
  onInputChange,
  onComposerKeyDown,
  onMicAction,
  onResponseModeChange,
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
  composerRef: RefObject<HTMLTextAreaElement>;
  onInputChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onMicAction: () => void;
  onResponseModeChange: (mode: MeetingResponseMode) => void;
  onSend: () => void;
  onReset: () => void;
}) {  const panelCopy = dockPanelCopy(locale);
  const timelineItems = timeline ?? [];
  const scriptEntries = timelineItems.filter((item) => item.kind === "message").slice(-10);
  const activeResponseModeLabel = getResponseModeCaption(responseMode, responseModeOptions, locale);

  return (
    <div className="flex min-h-0 flex-col rounded-[30px] border border-ink/10 bg-white p-4 shadow-[0_24px_56px_rgba(18,24,36,0.08)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="section-kicker">{panelCopy.liveScriptEyebrow}</div>
          <div className="font-display text-2xl leading-none text-ink">{panelCopy.liveScriptTitle}</div>
          <p className="max-w-3xl text-sm text-mist">{panelCopy.liveScriptDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{panelCopy.autoRouting}</Badge>
          <Badge variant="outline">{copy.meeting.participants(3)}</Badge>
        </div>
      </div>

      <ScrollArea className="meeting-column-scroll min-h-0 flex-1 rounded-[26px] border border-ink/10 bg-white p-3">
        <div className="space-y-3">
          {scriptEntries.length > 0 ? (
            scriptEntries.map((item) => {
              const isUser = item.speakerType === "user";
              const isAgent = item.speakerType === "agent";
              return (
                <div
                  key={item.id}
                  className={cn(
                    "max-w-[92%] rounded-[24px] border px-4 py-3 shadow-[0_14px_34px_rgba(18,24,36,0.04)]",
                    isUser && "ml-auto border-ink/28 bg-white text-ink",
                    isAgent && "mr-auto border-cobalt/12 bg-white text-ink",
                    !isUser && !isAgent && "mr-auto border-ink/10 bg-white text-ink"
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em]">
                    <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </ScrollArea>

      <form
        className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_136px]"
        onSubmit={(event) => {
          event.preventDefault();
          void onSend();
        }}
      >
        <div className="min-w-0 rounded-[28px] border border-cobalt/10 bg-white p-3 shadow-[0_18px_42px_rgba(18,24,36,0.05)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2">
            <div className="flex flex-wrap items-center gap-2">
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
            </div>
            <div className="text-right text-xs text-mist">
              <div>{activeResponseModeLabel}</div>
              <div className="mt-1">{copy.meeting.browserMicHint}</div>

            </div>
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
    <div className="rounded-[30px] border border-ink/10 bg-white p-4 shadow-[0_22px_52px_rgba(18,24,36,0.08)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="section-kicker">{panelCopy.userCameraEyebrow}</div>
          <div className="font-display text-[1.8rem] leading-none text-ink">{panelCopy.userCameraTitle}</div>
          <p className="text-sm leading-6 text-mist">{panelCopy.userCameraDescription}</p>
        </div>
        <Badge variant="outline">{snapshotUpdatedAt}</Badge>
      </div>
      <div className="relative overflow-hidden rounded-[26px] border border-ink/10 bg-white">
        <div className="relative aspect-[16/10]">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
          {!cameraReady ? (
            <div className="absolute inset-0 grid place-items-center bg-white px-5 text-center text-sm text-ink/72">
              {copy.meeting.cameraFallback}
            </div>
          ) : null}
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            <Badge>{copy.meeting.userLabel}</Badge>
            <Badge variant="secondary">{copy.meeting.localCam}</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function ParticipantStagePanel({
  copy,
  locale,
  agents,
  agentStatus,
  latestMessages,
  cameraReady,
  videoRef,
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
  composerRef,
  onInputChange,
  onComposerKeyDown,
  onMicAction,
  onResponseModeChange,
  onSend,
  onReset
}: {
  copy: MeetingCopy;
  locale: AppLocale;
  agents: ReturnType<typeof getAgents>;
  agentStatus: Record<AgentId, AgentStatus>;
  latestMessages: Record<AgentId, string>;
  cameraReady: boolean;
  videoRef: RefObject<HTMLVideoElement>;
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
  composerRef: RefObject<HTMLTextAreaElement>;
  onInputChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onMicAction: () => void;
  onResponseModeChange: (mode: MeetingResponseMode) => void;
  onSend: () => void;
  onReset: () => void;
}) {  return (
    <Card className="p-4 lg:p-5">
      <SectionHeader
        eyebrow={copy.meeting.stageEyebrow}
        title={copy.meeting.stageTitle}
        badge={
          <>
            <Badge variant="secondary">{copy.meeting.participants(agents.length + 1)}</Badge>
            <Badge variant="outline">{activeTabLabel}</Badge>
            <Badge variant="outline">{snapshotStatusLabel}</Badge>
          </>
        }
        description={snapshotDetail}
      />
      <div className="grid gap-4">
        <div className="grid gap-4 xl:grid-cols-2">
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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.28fr)_minmax(280px,0.72fr)]">
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
            composerRef={composerRef}
            onInputChange={onInputChange}
            onComposerKeyDown={onComposerKeyDown}
            onMicAction={onMicAction}
            onResponseModeChange={onResponseModeChange}
            onSend={onSend}
            onReset={onReset}
          />
          <UserCameraDockCard
            locale={locale}
            copy={copy}
            cameraReady={cameraReady}
            videoRef={videoRef}
            snapshotUpdatedAt={snapshotUpdatedAt}
          />
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
              {locale === "ko" ? "\uCE74\uB4DC \uC0C9\uAC10" : "Card mood"}
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

  useEffect(() => {
    if (!agents.some((agent) => agent.id === activePersonaId)) {
      setActivePersonaId(agents[0]?.id ?? "assistant");
    }
  }, [activePersonaId, agents]);

  const activePersonaAgent = agents.find((agent) => agent.id === activePersonaId) ?? agents[0];
  const activePersonaIndex = activePersonaAgent ? agents.findIndex((agent) => agent.id === activePersonaAgent.id) : 0;
  const openClawStatusLabel = !capabilities?.openclawRemote
    ? locale === "ko"
      ? "\uBBF8\uC124\uC815"
      : "Not configured"
    : openClawProbe?.status === "reachable"
      ? locale === "ko"
        ? "\uC5F0\uACB0 \uD655\uC778\uB428"
        : "Connected"
      : openClawProbe?.status === "unreachable"
        ? locale === "ko"
          ? "\uC5F0\uACB0 \uC2E4\uD328"
          : "Connection failed"
        : locale === "ko"
          ? "\uC124\uC815\uB428"
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
      ? ".env.local\uC5D0 OPENCLAW_BASE_URL\uACFC \uD544\uC694\uD558\uBA74 OPENCLAW_API_KEY\uB97C \uB123\uC73C\uBA74 \uB429\uB2C8\uB2E4."
      : "Add OPENCLAW_BASE_URL and, if needed, OPENCLAW_API_KEY to .env.local."
    : openClawProbe?.status === "reachable"
      ? locale === "ko"
        ? "OpenClaw chat \uB610\uB294 health \uC751\uB2F5\uC774 \uD655\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
        : "The OpenClaw chat or health endpoint responded successfully."
      : openClawProbe?.status === "unreachable"
        ? locale === "ko"
          ? "OpenClaw\uAC00 \uC124\uC815\uB418\uC5B4 \uC788\uC9C0\uB9CC \uC751\uB2F5\uC744 \uBC1B\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC8FC\uC18C, \uD1A0\uD070, /chat \uB610\uB294 /health\uB97C \uD655\uC778\uD558\uC138\uC694."
          : "OpenClaw is configured, but the app could not get a response. Check the base URL, token, and /chat or /health endpoint."
        : locale === "ko"
          ? "OpenClaw\uB294 \uC124\uC815\uB418\uC5B4 \uC788\uC9C0\uB9CC \uC544\uC9C1 \uC5F0\uACB0 \uD14C\uC2A4\uD2B8\uB97C \uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."
          : "OpenClaw is configured, but the connection has not been tested yet.";
  const openClawProbeDetail = openClawProbe?.message;
  const openClawBaseUrl = openClawProbe?.baseUrl || (capabilities?.openclawRemote
    ? locale === "ko"
      ? "\uD658\uACBD \uBCC0\uC218\uC5D0 \uC124\uC815\uB428"
      : "Configured in the environment"
    : locale === "ko"
      ? "OPENCLAW_BASE_URL \uC5C6\uC74C"
      : "OPENCLAW_BASE_URL not set");
  const openClawPathSummary = openClawProbe
    ? `${openClawProbe.chatPath} / ${openClawProbe.tasksPath}`
    : locale === "ko"
      ? "/chat, /tasks \uAE30\uBCF8 \uACBD\uB85C"
      : "/chat, /tasks default paths";
  const openClawCheckedLabel = openClawProbe?.checkedAt
    ? new Date(openClawProbe.checkedAt).toLocaleString(copy.app.dateLocale)
    : locale === "ko"
      ? "\uC544\uC9C1 \uD655\uC778 \uC804"
      : "Not tested yet";
  const openClawMeetingLabel = capabilities?.openclawChat
    ? locale === "ko"
      ? "\uD68C\uC758 \uAC00\uB2A5"
      : "Meeting ready"
    : locale === "ko"
      ? "\uD68C\uC758 \uAEBC\uC9D0"
      : "Meeting off";
  const openClawResearchLabel = capabilities?.openclawRemote
    ? locale === "ko"
      ? "\uC870\uC0AC \uAC00\uB2A5"
      : "Research ready"
    : locale === "ko"
      ? "\uC870\uC0AC \uAEBC\uC9D0"
      : "Research off";

  return (
    <div className="flex flex-col gap-4">
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
                {locale === "ko" ? "OpenClaw \uC5F0\uACB0" : "OpenClaw Connection"}
              </div>
              <div className="text-sm font-semibold text-ink">{openClawStatusLabel}</div>
              <p className="max-w-[30rem] text-sm leading-6 text-mist">{openClawDescription}</p>
            </div>
            <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", openClawStatusToneClass)}>
              {openClawStatusLabel}
            </span>
          </div>
          {openClawProbeDetail ? <div className="mt-3 text-xs leading-5 text-mist">{openClawProbeDetail}</div> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">{openClawMeetingLabel}</Badge>
            <Badge variant="outline">{openClawResearchLabel}</Badge>
          </div>
          <div className="mt-3 rounded-[16px] border border-ink/10 bg-white px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mist">Base URL</div>
            <div className="mt-1 break-all text-sm text-ink/78">{openClawBaseUrl}</div>
            <div className="mt-1 text-xs text-mist">{openClawPathSummary}</div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-mist">
              {locale === "ko" ? `\uB9C8\uC9C0\uB9C9 \uD655\uC778 ${openClawCheckedLabel}` : `Last checked ${openClawCheckedLabel}`}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={onTestOpenClaw} disabled={isTestingOpenClaw}>
              {isTestingOpenClaw ? (locale === "ko" ? "\uD14C\uC2A4\uD2B8 \uC911..." : "Testing...") : locale === "ko" ? "\uC5F0\uACB0 \uD14C\uC2A4\uD2B8" : "Test connection"}
            </Button>
          </div>
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
    <div className="flex h-full flex-col gap-4">
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

      <div className="min-h-0 rounded-[24px] border border-ink/10 bg-white p-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-mist">{panelCopy.minutesHistory}</div>
        <ScrollArea className="meeting-column-scroll h-[300px] pr-1">
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
    <div className="flex h-full flex-col gap-4">
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

      <div className="min-h-0 rounded-[24px] border border-ink/10 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-mist">{panelCopy.researchHistory}</div>
          <Badge variant="outline">{completedTaskCount}</Badge>
        </div>
        <ScrollArea className="meeting-column-scroll h-[300px] pr-1">
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
      <Card className="flex min-h-0 flex-col overflow-hidden border border-ink/12 bg-white p-2 text-ink shadow-[0_18px_42px_rgba(18,24,36,0.08)]">
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
    <Card className="flex min-h-0 flex-col self-start overflow-hidden border border-ink/12 bg-white p-0 text-ink shadow-[0_18px_42px_rgba(18,24,36,0.08)] xl:max-h-[calc(100dvh-14rem)]">
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

      <div className="min-h-0 flex-1 overflow-hidden p-3">
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
  const [activeDockTab, setActiveDockTab] = useState<DockTab>("session");
  const [sttMode, setSttMode] = useState<SpeechMode>("browser");
  const [ttsMode, setTtsMode] = useState<TtsMode>("browser");
  const [autoSpeakMode, setAutoSpeakMode] = useState<AutoSpeakMode>("off");
  const [responseMode, setResponseMode] = useState<MeetingResponseMode>("auto");
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [browserSpeechSupported, setBrowserSpeechSupported] = useState(false);
  const [browserTtsSupported, setBrowserTtsSupported] = useState(false);
  const [notice, setNotice] = useState<string>(copy.meeting.initialNotice);
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

  const agents = useMemo(() => getAgents(locale, personaOverrides), [locale, personaOverrides]);
  const agentsById = useMemo(() => getAgentsById(locale, personaOverrides), [locale, personaOverrides]);
  const responseModeOptions = useMemo(
    () => getResponseModeOptions(locale, agentsById.assistant.name, agentsById.analyst.name),
    [agentsById.assistant.name, agentsById.analyst.name, locale]
  );

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
    capabilities?.openclawChat ? (locale === "ko" ? "OpenClaw \uD68C\uC758" : "OpenClaw Meeting") : null
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
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
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

    startCamera();
    return () => {
      mounted = false;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
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
              ? "OpenClaw가 아직 설정되지 않았습니다. .env.local에 주소와 토큰을 추가해 주세요."
              : "OpenClaw is not configured yet. Add it to .env.local."
            : locale === "ko"
              ? "OpenClaw 연결 테스트에 실패했습니다. base URL, 토큰, /chat 또는 /health 응답을 확인해 주세요."
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
      setNotice(
        locale === "ko"
          ? "OpenClaw 연결 테스트 호출에 실패했습니다."
          : "Failed to call the OpenClaw connection test."
      );
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
    const userItem = createTimelineItem({ ts: new Date().toISOString(), kind: "message", speakerType: "user", speakerLabel: copy.meeting.userLabel, badge: activeTab, text: message });
    setTimeline((previous) => [...previous, userItem]);

    try {
      const data = await fetchJson<MeetingRoundResponse>("/api/meeting/round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: extractHistory([...baseTimeline, userItem]),
          activeTab,
          marketSnapshot: activeTab === "btc" ? btcSnapshot : activeTab === "us" ? usSnapshot : krSnapshot,
          portfolioSnapshot: portfolio,
          minutes: minutes ? { ...minutes, sessionId } : null,
          locale,
          personaOverrides,
          responseMode
        })
      });
      if (data.research) {
        upsertTask(data.research.task);
        setTaskArtifacts((previous) => ({ ...previous, [data.research!.task.taskId]: data.research!.artifacts }));
        setActiveDockTab("research");
        setDockOpen(true);
      }
      const turnItems = data.turns.map((turn) => createTimelineItem({ ts: turn.timestamp, kind: "message", speakerType: "agent", agentId: turn.agentId, speakerLabel: turn.speakerLabel, badge: turn.phase, text: turn.text, provider: turn.provider }));
      for (const item of turnItems) {
        setTimeline((previous) => [...previous, item]);
        setOnlyStatus(item.agentId as AgentId, "thinking");
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
      setAgentStatus({ assistant: "idle", analyst: "idle" });
      const nextTimeline = [...baseTimeline, userItem, ...turnItems];
      persistMeeting(data.minutes, nextTimeline, message);
      const usedFallbackMeetingProvider = capabilities?.openclawChat && data.provider !== "openclaw";
      setNotice(
        usedFallbackMeetingProvider
          ? locale === "ko"
            ? `${agentsById[data.meta.finalSpeakerId].name}이 답변했습니다. OpenClaw 회의를 사용할 수 없어 ${data.provider}로 대신 응답했습니다.`
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

      pushTimeline({ ts: new Date().toISOString(), kind: "message", speakerType: "system", speakerLabel: copy.meeting.systemLabel, badge: "error", text: errorText });
      setAgentStatus({ assistant: "idle", analyst: "idle" });
      setNotice(
        likelyOpenClawError
          ? locale === "ko"
            ? "회의 답변 생성에 실패했습니다. OpenClaw base URL, 토큰, /chat 연결 상태를 확인해 주세요."
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
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{copy.meeting.headerBadge}</Badge>
              <Badge variant="signal">{experienceCopy.marketHubEyebrow}</Badge>
              <Badge variant="outline">{copy.meeting.tabBadge(activeTabLabel)}</Badge>
            </div>
            <div className="space-y-3">
              <h1 className="max-w-4xl font-display text-3xl font-semibold md:text-[2.8rem]">{meetingShellTitle}</h1>
              <p className="max-w-4xl text-sm leading-6 text-mist">{notice}</p>
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
            "grid flex-1 gap-3 xl:items-start",
            dockOpen
              ? "xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)_minmax(320px,360px)]"
              : "xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)_112px]"
          )}
        >
          <Card className="flex min-h-0 min-w-0 flex-col self-start p-4 lg:p-5 xl:max-h-[calc(100dvh-14rem)]">
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
                            <div className="rounded-[22px] border border-ink/10 bg-white/60 p-4 text-sm text-mist">
                <div className="mb-3 space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-mist">{locale === "ko" ? "기능" : "Capabilities"}</div>

                </div>
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
              </div>              </div>
            </ScrollArea>
          </Card>

          <div className="flex min-h-0 min-w-0 flex-col gap-3 self-start">
            <ParticipantStagePanel
              copy={copy}
              locale={locale}
              agents={agents}
              agentStatus={agentStatus}
              latestMessages={latestMessages}
              cameraReady={cameraReady}
              videoRef={videoRef}
              activeTabLabel={activeTabLabel}
              snapshotStatusLabel={selectedSnapshotStatusLabel}
              snapshotDetail={selectedSnapshotDetail}
              snapshotUpdatedAt={snapshotUpdatedAt}
              timeline={timeline}
              input={input}
              isSending={isSending}
              sttMode={sttMode}
              responseMode={responseMode}
              responseModeOptions={responseModeOptions}
              isListening={isListening}
              isRecording={isRecording}
              browserSpeechSupported={browserSpeechSupported}
              openAiSttSupported={Boolean(capabilities?.openaiStt)}
              composerRef={composerRef}
              onInputChange={setInput}
              onComposerKeyDown={handleComposerKeyDown}
              onMicAction={handleMicAction}
              onResponseModeChange={setResponseMode}
              onSend={() => void handleSend()}
              onReset={resetMeeting}
            />
          </div>

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
  );
}



"use client";

import { startTransition, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  APP_LOCALE_COOKIE,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type AppLocale
} from "@/lib/i18n/config";
import { getAgents, getAgentsById } from "@/lib/meeting/agents";
import type {
  AgentId,
  AgentStatus,
  AutoSpeakMode,
  Capabilities,
  ChatHistoryItem,
  MeetingAction,
  MeetingMinutes,
  MeetingRoundResponse,
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
import { AgentStageCard } from "@/components/agent-stage-card";
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

const MINUTES_STORAGE_KEY = "openclawweb.minutes.v1";
const KR_DEFAULT_SYMBOLS = ["005930", "000660", "035420"];
const US_DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA"];
const LARGE_SELECT_CLASS_NAME =
  "h-11 rounded-full border border-ink/10 bg-white/82 px-4 text-sm text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_12px_28px_rgba(18,24,36,0.05)] outline-none transition focus:border-cobalt/35 focus:ring-4 focus:ring-cobalt/10";
const SMALL_SELECT_CLASS_NAME =
  "h-9 rounded-full border border-ink/10 bg-white/80 px-3 text-xs text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_20px_rgba(18,24,36,0.05)] outline-none transition focus:border-cobalt/35 focus:ring-4 focus:ring-cobalt/10";
type MetricTone = "default" | "cobalt" | "mint" | "ember";

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
      return locale === "ko" ? "\uc2dc\uc7a5 \ud734\uc7a5 \u00b7 \ub9c8\uc9c0\ub9c9 \uc885\uac00 \uae30\uc900" : "Market closed · last close";
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
  const accentClass = isPositive ? "bg-mint/20" : "bg-rose/18";
  const borderClass = isPositive ? "border-mint/18" : "border-rose/16";
  const signalClass = isPositive ? "bg-mint" : "bg-rose";
  const progressWidth = `${clamp(Math.abs(quote.changePercent) * 8, 12, 100)}%`;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,252,0.98))] p-5 shadow-[0_20px_40px_rgba(18,24,36,0.08)]",
        borderClass
      )}
    >
      <div className={cn("absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl", accentClass)} />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                {quote.symbol}
              </span>
              <span className="rounded-full border border-ink/10 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-mist">
                {quote.market}
              </span>
              {quote.session && quote.session !== "always" ? (
                <Badge variant="outline">{labelForMarketSession(quote.session, copy.app.lang)}</Badge>
              ) : null}
            </div>
            <div className="mt-3 truncate text-lg font-semibold text-ink">{quote.name}</div>
          </div>
          <div className="rounded-[22px] border border-white/80 bg-white/82 px-4 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{copy.meeting.marketChange}</div>
            <div className={cn("mt-2 text-2xl font-semibold leading-none", isPositive ? "text-mint" : "text-rose")}>
              {formatSignedPercent(quote.changePercent)}
            </div>
            <div className={cn("mt-1 text-xs font-medium", isPositive ? "text-mint" : "text-rose")}>
              {formatSignedNumber(quote.change, quote.currency === "KRW" ? 0 : 2, locale)}
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <div className="text-3xl font-semibold leading-none text-ink">
              {formatCurrency(quote.price, quote.currency, locale)}
            </div>
            <div className="mt-2 text-sm text-mist">
              {[quote.market, labelForMarketSession(quote.session, copy.app.lang)].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="min-w-[96px] rounded-[18px] border border-ink/8 bg-white/72 px-3 py-2 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{copy.meeting.marketReferenceTime}</div>
            <div className="mt-1 text-sm font-medium text-ink">{formatTime(quote.updatedAt, locale)}</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-2 rounded-full bg-ink/6">
            <div className={cn("h-2 rounded-full", signalClass)} style={{ width: progressWidth }} />
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-[18px] border border-ink/8 bg-white/72 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{copy.meeting.marketPreviousClose}</div>
            <div className="mt-1 text-sm font-medium text-ink">
              {quote.previousClose ? formatCurrency(quote.previousClose, quote.currency, locale) : "--"}
            </div>
          </div>
          <div className="rounded-[18px] border border-ink/8 bg-white/72 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{copy.meeting.marketVolume}</div>
            <div className="mt-1 text-sm font-medium text-ink">{formatMarketVolume(quote.volume, locale)}</div>
          </div>
          <div className="rounded-[18px] border border-ink/8 bg-white/72 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{copy.meeting.marketPulse}</div>
            <div className="mt-1 truncate text-sm font-medium text-ink">
              {labelForMarketSession(quote.session, copy.app.lang) || labelForBadge("ready", copy.app.lang)}
            </div>
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
      <div className="grid gap-3 xl:grid-cols-2">
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
        tone === "default" && "border-ink/10 bg-white/82",
        tone === "cobalt" && "border-cobalt/12 bg-cobalt/5",
        tone === "mint" && "border-mint/12 bg-mint/5",
        tone === "ember" && "border-ember/14 bg-ember/5"
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
        "rounded-[22px] border px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
        accent === "default" && "border-white/10 bg-white/8",
        accent === "positive" && "border-mint/18 bg-mint/10",
        accent === "negative" && "border-rose/18 bg-rose/10"
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/56">{label}</div>
      <div className="mt-3 text-lg font-semibold leading-none text-white">{value}</div>
      {detail ? <div className="mt-2 text-xs text-white/62">{detail}</div> : null}
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
  const summary = getSnapshotSummary(snapshot, copy, locale);
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
  const normalizedPriceChangeDetail = priceChangeDetail.replace("쨌", "·");

  return (
    <div className={cn("mb-4 overflow-hidden rounded-[30px] border border-ink/10 p-6 text-white shadow-panel", heroAccent)}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.95fr)]">
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
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
            {summary}
          </p>
          <div className="mt-6 flex flex-wrap items-end gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/52">
                {heroQuote?.name || copy.meeting.marketOverview}
              </div>
              <div className="mt-3 text-[2.8rem] font-semibold leading-none tracking-[-0.04em] md:text-[4rem]">
                {heroQuote
                  ? formatCurrency(heroQuote.price, heroQuote.currency, intlLocale)
                  : labelForBadge(snapshot?.status || "loading", locale)}
              </div>
            </div>
            <div
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
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
        isUser && "border-ink/80 bg-ink text-white",
        isAgent && "border-cobalt/12 bg-cobalt/5",
        isTask && "border-ember/14 bg-ember/5",
        !isUser && !isAgent && !isTask && "border-ink/10 bg-white/82"
      )}
    >
      <span
        className={cn(
          "absolute inset-y-4 left-3 w-1 rounded-full",
          isUser && "bg-white/32",
          isAgent && "bg-cobalt/55",
          isTask && "bg-ember/55",
          !isUser && !isAgent && !isTask && "bg-ink/12"
        )}
      />
      <div className="pl-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
          <span className={cn(isUser ? "text-white/72" : "text-mist")}>{formatTime(item.ts, getDictionary(locale).app.dateLocale)}</span>
          <span className={cn(isUser ? "text-white/86" : "text-ink/72")}>{item.speakerLabel}</span>
          {item.badge ? (
            <Badge
              variant="outline"
              className={cn(
                isUser && "border-white/15 bg-white/10 text-white",
                isAgent && "border-cobalt/14 bg-cobalt/10 text-cobalt",
                isTask && "border-ember/14 bg-ember/12 text-ember"
              )}
            >
              {labelForBadge(item.badge, locale)}
            </Badge>
          ) : null}
          {isAgent && item.provider ? <Badge variant="secondary">{item.provider}</Badge> : null}
        </div>
        <div className={cn("whitespace-pre-wrap text-sm leading-6", isUser ? "text-white" : "text-ink/90")}>
          {item.text}
        </div>
      </div>
    </div>
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
  const agents = getAgents(locale);
  const agentsById = getAgentsById(locale);
  const tabLabels = copy.tabs;
  const capabilityStates = copy.meeting.capabilityStates;

  const [timeline, setTimeline] = useState<MeetingTimelineItem[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [sttMode, setSttMode] = useState<SpeechMode>("browser");
  const [ttsMode, setTtsMode] = useState<TtsMode>("browser");
  const [autoSpeakMode, setAutoSpeakMode] = useState<AutoSpeakMode>("summary");
  const [voiceAutoRun, setVoiceAutoRun] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [browserSpeechSupported, setBrowserSpeechSupported] = useState(false);
  const [browserTtsSupported, setBrowserTtsSupported] = useState(false);
  const [notice, setNotice] = useState<string>(copy.meeting.initialNotice);
  const [chatProvider, setChatProvider] = useState<Provider>("mock");
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
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
  const [openClawSessionId, setOpenClawSessionId] = useState<string | undefined>();
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
  const taskPollRef = useRef<number | null>(null);
  const seenTaskLogsRef = useRef<Set<string>>(new Set());
  const speechRunRef = useRef(0);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

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

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MINUTES_STORAGE_KEY);
      if (stored) {
        setMinutesHistory(JSON.parse(stored) as MeetingSessionRecord[]);
      }
      const recognitionSource = (window as Window & {
        SpeechRecognition?: new () => BrowserSpeechRecognition;
        webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
      }).SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: new () => BrowserSpeechRecognition }).webkitSpeechRecognition;
      setBrowserSpeechSupported(Boolean(recognitionSource));
      setBrowserTtsSupported("speechSynthesis" in window);
    } catch {
      setMinutesHistory([]);
    }
  }, []);

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
      if (taskPollRef.current) {
        window.clearInterval(taskPollRef.current);
      }
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
    startTransition(() => setCapabilities(data));
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

  async function fetchTaskArtifacts(taskId: string) {
    try {
      const artifacts = await fetchJson<MeetingTaskArtifacts>(`/api/meeting/tasks/${taskId}/artifacts`);
      setTaskArtifacts((previous) => ({ ...previous, [taskId]: artifacts }));
    } catch {
      setTaskArtifacts((previous) => previous);
    }
  }

  async function startOpenClawTask(action: MeetingAction, agentId: AgentId) {
    setOnlyStatus(agentId, "browsing");
    setNotice(copy.meeting.notices.openClawStarting);

    try {
      const task = await fetchJson<MeetingTask>("/api/meeting/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          instruction: action.instruction,
          url: action.url,
          sessionId: openClawSessionId,
          locale
        })
      });

      setOpenClawSessionId(task.sessionId);
      seenTaskLogsRef.current = new Set(task.logs.map((log) => `${task.taskId}:${log.id}`));
      upsertTask(task);
      pushTimeline({ ts: task.updatedAt, kind: "task", speakerType: "system", speakerLabel: "OpenClaw", badge: task.status, text: task.summary });

      if (taskPollRef.current) {
        window.clearInterval(taskPollRef.current);
      }
      taskPollRef.current = window.setInterval(async () => {
        try {
          const nextTask = await fetchJson<MeetingTask>(`/api/meeting/tasks/${task.taskId}`);
          upsertTask(nextTask);
          setOpenClawSessionId(nextTask.sessionId);
          nextTask.logs.forEach((log) => {
            const key = `${nextTask.taskId}:${log.id}`;
            if (seenTaskLogsRef.current.has(key)) return;
            seenTaskLogsRef.current.add(key);
            pushTimeline({ ts: log.ts, kind: "task", speakerType: "system", speakerLabel: "OpenClaw", badge: log.level, text: log.message });
          });
          if (nextTask.status === "succeeded" || nextTask.status === "failed") {
            if (taskPollRef.current) {
              window.clearInterval(taskPollRef.current);
              taskPollRef.current = null;
            }
            await fetchTaskArtifacts(nextTask.taskId);
            setNotice(nextTask.status === "succeeded" ? copy.meeting.notices.openClawCompleted : copy.meeting.notices.openClawFailed);
            setAgentStatus({ assistant: "idle", analyst: "idle" });
          }
        } catch {
          if (taskPollRef.current) {
            window.clearInterval(taskPollRef.current);
            taskPollRef.current = null;
          }
          setAgentStatus({ assistant: "idle", analyst: "idle" });
        }
      }, 2200);
    } catch {
      pushTimeline({ ts: new Date().toISOString(), kind: "task", speakerType: "system", speakerLabel: "OpenClaw", badge: "error", text: copy.meeting.notices.openClawStartFailed });
      setAgentStatus({ assistant: "idle", analyst: "idle" });
    }
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

    if (!voiceAutoRun || isSending) {
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
    setOnlyStatus("analyst", "thinking");
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
          locale
        })
      });
      setChatProvider(data.provider);
      const turnItems = data.turns.map((turn) => createTimelineItem({ ts: turn.timestamp, kind: "message", speakerType: "agent", agentId: turn.agentId, speakerLabel: turn.speakerLabel, badge: turn.phase, text: turn.text, provider: turn.provider }));
      for (const item of turnItems) {
        setTimeline((previous) => [...previous, item]);
        setOnlyStatus(item.agentId as AgentId, "thinking");
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
      setAgentStatus({ assistant: "idle", analyst: "idle" });
      const nextTimeline = [...baseTimeline, userItem, ...turnItems];
      persistMeeting(data.minutes, nextTimeline, message);
      setNotice(copy.meeting.notices.meetingCompleted(data.provider));
      void autoplayTurns(data.turns);
      if (data.actions?.[0]) {
        await startOpenClawTask(data.actions[0], "analyst");
      }
    } catch (error) {
      pushTimeline({ ts: new Date().toISOString(), kind: "message", speakerType: "system", speakerLabel: copy.meeting.systemLabel, badge: "error", text: error instanceof Error ? error.message : copy.meeting.notices.meetingFailed });
      setAgentStatus({ assistant: "idle", analyst: "idle" });
      setNotice(copy.meeting.notices.meetingFailed);
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
    setOpenClawSessionId(undefined);
    setAgentStatus({ assistant: "idle", analyst: "idle" });
    setNotice(copy.meeting.notices.reset);
  }

  return (
    <div className="min-h-dvh bg-paper px-3 py-3 text-ink md:px-5">
      <div className="dashboard-shell mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-[1860px] flex-col gap-3 rounded-[34px] border border-white/50 bg-white/35 p-3 shadow-glow backdrop-blur-xl">
        <header className="panel-surface grid gap-4 rounded-[30px] px-5 py-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] xl:items-start">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{copy.meeting.headerBadge}</Badge>
              <Badge variant="signal">{copy.meeting.fixedAgents}</Badge>
              <Badge variant="outline">{copy.meeting.providerBadge(chatProvider)}</Badge>
              <Badge variant="outline">{copy.meeting.tabBadge(tabLabels[activeTab])}</Badge>
              {openClawSessionId ? (
                <Badge variant="outline">{copy.meeting.openClawBadge(openClawSessionId.slice(0, 8))}</Badge>
              ) : null}
            </div>
            <div className="space-y-3">
              <h1 className="max-w-4xl font-display text-3xl font-semibold md:text-[2.8rem]">
                {copy.meeting.title}
              </h1>
              <p className="max-w-4xl text-sm leading-6 text-mist">{notice}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <OverviewMetric
                label={copy.meeting.providerBadge(chatProvider)}
                value={labelForBadge(selectedSnapshot?.status || "loading", locale)}
                detail={[tabLabels[activeTab], describeMarketSession(selectedSnapshot?.session, locale)].filter(Boolean).join(" · ")}
                tone="cobalt"
              />
              <OverviewMetric
                label={copy.meeting.timelineTitle}
                value={String(timeline.length).padStart(2, "0")}
                detail={copy.meeting.participants(agents.length + 1)}
              />
              <OverviewMetric
                label={copy.meeting.minutesTitle}
                value={latestSavedAt}
                detail={minutes?.title || copy.meeting.timelineEmpty}
                tone="mint"
              />
            </div>
          </div>
          <div className="rounded-[28px] border border-ink/10 bg-white/58 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant={sttMode === "browser" ? "default" : "outline"} onClick={() => setSttMode("browser")}>
                {copy.meeting.browserStt}
              </Button>
              <Button
                size="sm"
                variant={sttMode === "whisper" ? "default" : "outline"}
                onClick={() => setSttMode("whisper")}
                disabled={!capabilities?.openaiStt}
              >
                {copy.meeting.whisper}
              </Button>
              <Button size="sm" variant={ttsMode === "browser" ? "default" : "outline"} onClick={() => setTtsMode("browser")}>
                {copy.meeting.browserTts}
              </Button>
              <Button
                size="sm"
                variant={ttsMode === "elevenlabs" ? "default" : "outline"}
                onClick={() => setTtsMode("elevenlabs")}
                disabled={!capabilities?.elevenLabsTts}
              >
                {copy.meeting.elevenLabs}
              </Button>
            </div>
            <div className="soft-divider mb-3" />
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{sttMode === "browser" ? copy.meeting.browserStt : copy.meeting.whisper}</Badge>
                <Badge variant="secondary">{ttsMode === "browser" ? copy.meeting.browserTts : copy.meeting.elevenLabs}</Badge>
                <Badge variant="outline">
                  {voiceAutoRun ? copy.meeting.voiceAutoRunLabelOn : copy.meeting.voiceAutoRunLabelOff}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={cn(SMALL_SELECT_CLASS_NAME, "w-full sm:w-auto")}
                  value={autoSpeakMode}
                  onChange={(event) => setAutoSpeakMode(event.target.value as AutoSpeakMode)}
                >
                  <option value="summary">{copy.autoSpeak.summary}</option>
                  <option value="all">{copy.autoSpeak.all}</option>
                  <option value="off">{copy.autoSpeak.off}</option>
                </select>
                <select
                  className={cn(SMALL_SELECT_CLASS_NAME, "w-full sm:w-auto")}
                  value={locale}
                  onChange={(event) => handleLocaleChange(event.target.value as AppLocale)}
                >
                  {SUPPORTED_LOCALES.map((entry) => (
                    <option key={entry} value={entry}>
                      {copy.app.localeNames[entry]}
                    </option>
                  ))}
                </select>
                {settingsHref ? (
                  <Button size="sm" variant="outline" onClick={() => (window.location.href = settingsHref)}>
                    {copy.meeting.settings}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-3 xl:grid-cols-[360px_minmax(0,1fr)_430px]">
          <Card className="flex min-h-0 flex-col p-4 lg:p-5">
            <SectionHeader
              eyebrow={copy.meeting.workspaceEyebrow}
              title={copy.meeting.workspaceTitle}
              badge={
                <>
                  <Badge variant="secondary">{labelForBadge(selectedSnapshot?.status || "loading", locale)}</Badge>
                  {selectedSnapshot?.session && selectedSnapshot.session !== "always" ? (
                    <Badge variant="outline">{labelForMarketSession(selectedSnapshot.session, locale)}</Badge>
                  ) : null}
                </>
              }
              description={getSnapshotSummary(selectedSnapshot, copy, locale)}
            />
            <SnapshotOverview
              snapshot={selectedSnapshot}
              activeTab={activeTab}
              copy={copy}
              locale={locale}
              tabLabels={tabLabels}
            />
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(tabLabels).map(([tab, label]) => (
                <Button
                  key={tab}
                  size="sm"
                  variant={activeTab === tab ? "default" : "outline"}
                  onClick={() => setActiveTab(tab as WorkspaceTab)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <ScrollArea className="min-h-0 flex-1 pr-1">
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
                    <div className="grid grid-cols-2 gap-3">
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
                        <div className="grid grid-cols-2 gap-2">
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
                        <div className="grid grid-cols-2 gap-2">
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
              <div className="rounded-[22px] border border-ink/10 bg-white/60 p-4 text-sm text-mist"><div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-mist">{copy.meeting.feedNotes}</div>{(selectedSnapshot?.notes ?? [copy.meeting.noFeedNotes]).map((note) => <p key={note} className="mb-2">{note}</p>)}<p>{copy.meeting.capabilitiesLine({ browserStt: browserSpeechSupported ? capabilityStates.browser : capabilityStates.unavailable, whisper: capabilities?.openaiStt ? capabilityStates.ready : capabilityStates.off, browserTts: browserTtsSupported ? capabilityStates.browser : capabilityStates.unavailable, elevenLabs: capabilities?.elevenLabsTts ? capabilityStates.ready : capabilityStates.off })}</p></div>
              </div>
            </ScrollArea>
          </Card>

          <div className="flex min-h-0 flex-col gap-3">
            <Card className="flex min-h-0 flex-1 flex-col p-4"><div className="mb-3 flex items-center justify-between gap-2"><div><div className="text-xs font-semibold uppercase tracking-[0.2em] text-mist">{copy.meeting.stageEyebrow}</div><div className="font-display text-2xl">{copy.meeting.stageTitle}</div></div><Badge variant="secondary">{copy.meeting.participants(agents.length + 1)}</Badge></div><div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-3"><div className="noise-dots relative overflow-hidden rounded-[28px] border border-ink/10 bg-[#101927] text-white shadow-panel md:col-span-2 xl:col-span-1"><div className="absolute left-4 top-4 z-10 flex gap-2"><Badge>{copy.meeting.userLabel}</Badge><Badge variant="secondary">{copy.meeting.localCam}</Badge></div><video ref={videoRef} className="h-full w-full object-cover" playsInline muted />{!cameraReady ? <div className="absolute inset-0 grid place-items-center px-5 text-center text-sm text-white/70">{copy.meeting.cameraFallback}</div> : null}</div>{agents.map((agent) => <AgentStageCard key={agent.id} agent={agent} status={agentStatus[agent.id]} latestMessage={latestMessages[agent.id]} locale={locale} />)}</div></Card>
            <Card className="grid gap-3 p-4 lg:grid-cols-[1.1fr_0.9fr]"><div className="rounded-[24px] border border-ink/10 bg-[#101927] p-4 text-white shadow-panel"><div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/55">{copy.meeting.openClawResearch}</div>{selectedTask?.screenshot || selectedArtifacts?.screenshot ? <div className="min-h-[220px] rounded-[20px] border border-white/10 bg-cover bg-center" style={{ backgroundImage: `url(${selectedArtifacts?.screenshot || selectedTask?.screenshot})` }} /> : <div className="grid min-h-[220px] place-items-center rounded-[20px] border border-dashed border-white/15 text-sm text-white/60">{copy.meeting.noResearchTask}</div>}<div className="mt-3 flex items-center justify-between gap-3"><div><div className="text-xs uppercase tracking-[0.2em] text-white/55">{copy.meeting.openClawSummary}</div><div className="mt-1 text-sm text-white/80">{selectedTask?.summary || copy.meeting.openClawIdle}</div></div><Badge variant="secondary">{labelForBadge(selectedTask?.status || "standby", locale)}</Badge></div>{selectedArtifacts?.notes?.length ? <div className="mt-3 space-y-2 text-sm text-white/70">{selectedArtifacts.notes.slice(0, 4).map((note) => <div key={note} className="rounded-[16px] border border-white/10 px-3 py-2">{note}</div>)}</div> : null}</div><div className="space-y-2"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-mist">{copy.meeting.recentTasks}</div><ScrollArea className="max-h-[320px] space-y-2 pr-1">{taskHistory.map((task) => <button key={task.taskId} onClick={() => setSelectedTaskId(task.taskId)} className={cn("w-full rounded-[20px] border px-4 py-3 text-left transition", selectedTaskId === task.taskId ? "border-cobalt/30 bg-cobalt/5" : "border-ink/10 bg-white/75 hover:bg-white")}><div className="flex items-center justify-between gap-2"><div className="font-medium">{task.summary}</div><Badge variant="outline">{labelForBadge(task.status, locale)}</Badge></div><div className="mt-1 text-xs text-mist">{formatTime(task.updatedAt, copy.app.dateLocale)}</div></button>)}</ScrollArea></div></Card>
            <Card className="p-4">
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSend();
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => { if (sttMode === "browser") { isListening ? recognitionRef.current?.stop() : startBrowserSTT(); } else { void toggleWhisperRecording(); } }} disabled={sttMode === "browser" && !browserSpeechSupported || sttMode === "whisper" && !capabilities?.openaiStt || isSending}>{sttMode === "browser" ? isListening ? copy.meeting.stopMic : voiceAutoRun ? copy.meeting.speakAndRun : copy.meeting.browserMic : isRecording ? copy.meeting.stopWhisper : voiceAutoRun ? copy.meeting.whisperAndRun : copy.meeting.whisperRecord}</Button>
                  <Button variant={voiceAutoRun ? "secondary" : "outline"} onClick={() => setVoiceAutoRun((previous) => !previous)}>{voiceAutoRun ? copy.meeting.voiceAutoRunLabelOn : copy.meeting.voiceAutoRunLabelOff}</Button>
                  <Button variant="outline" onClick={() => { if (input.trim()) { void startOpenClawTask({ type: "openclaw_task", instruction: input.trim() }, "assistant"); } }} disabled={!input.trim() || isSending}>{copy.meeting.runOpenClaw}</Button>
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
                  <div className="min-w-0">
                    <Textarea
                      ref={composerRef}
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder={copy.meeting.placeholder}
                      disabled={isSending}
                      rows={3}
                      autoFocus
                      className="max-h-[220px] min-h-[120px] resize-none"
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-mist">
                      <span>{copy.meeting.enterHint}</span>
                      <span>{voiceAutoRun ? copy.meeting.voiceAutoRunOn : copy.meeting.voiceAutoRunOff}</span>
                    </div>
                  </div>
                  <Button type="submit" disabled={isSending || !input.trim()} className="h-12 lg:min-w-[160px]">{isSending ? copy.meeting.runningMeeting : copy.meeting.runMeeting}</Button>
                  <Button variant="destructive" onClick={resetMeeting} className="h-12 lg:min-w-[120px]">{copy.meeting.reset}</Button>
                </div>
              </form>
            </Card>
          </div>

          <div className="flex min-h-0 flex-col gap-3"><Card className="flex min-h-0 flex-1 flex-col p-4"><div className="mb-3 flex items-center justify-between"><div><div className="text-xs font-semibold uppercase tracking-[0.2em] text-mist">{copy.meeting.timelineEyebrow}</div><div className="font-display text-2xl">{copy.meeting.timelineTitle}</div></div><Badge variant="secondary">{timeline.length}</Badge></div><ScrollArea className="min-h-0 flex-1 rounded-[24px] border border-ink/10 bg-white/70 p-3"><div className="space-y-3">{timeline.map((item) => <div key={item.id} className={cn("rounded-[22px] border p-3", item.speakerType === "user" && "border-ink/10 bg-ink text-white", item.speakerType === "agent" && "border-cobalt/10 bg-cobalt/5", item.speakerType === "system" && "border-ink/10 bg-white")}><div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em]"><span>{formatTime(item.ts, copy.app.dateLocale)}</span><span>{item.speakerLabel}</span>{item.badge ? <Badge variant="outline">{labelForBadge(item.badge, locale)}</Badge> : null}</div><div className="whitespace-pre-wrap text-sm leading-6">{item.text}</div></div>)}</div></ScrollArea></Card><Card className="flex min-h-0 flex-col p-4"><div className="mb-3 flex items-center justify-between gap-2"><div><div className="text-xs font-semibold uppercase tracking-[0.2em] text-mist">{copy.meeting.minutesEyebrow}</div><div className="font-display text-2xl">{copy.meeting.minutesTitle}</div></div><Button size="sm" variant="outline" onClick={handleDownloadMinutes} disabled={!minutes}>{copy.meeting.download}</Button></div><div className="rounded-[24px] border border-ink/10 bg-white/75 p-4 text-sm text-ink/90">{minutes ? <div className="space-y-3"><div><div className="text-xs uppercase tracking-[0.2em] text-mist">{copy.meeting.minutesSummary}</div><div className="mt-1 leading-6">{minutes.summary}</div></div><div><div className="text-xs uppercase tracking-[0.2em] text-mist">{copy.meeting.marketSnapshot}</div>{minutes.marketSnapshot.map((line) => <div key={line} className="mt-1">- {line}</div>)}</div><div><div className="text-xs uppercase tracking-[0.2em] text-mist">{copy.meeting.actionItems}</div>{minutes.actionItems.map((line) => <div key={line} className="mt-1">- {line}</div>)}</div><div><div className="text-xs uppercase tracking-[0.2em] text-mist">{copy.meeting.tradeNotes}</div>{minutes.tradeNotes.map((line) => <div key={line} className="mt-1">- {line}</div>)}</div></div> : <div className="text-mist">{copy.meeting.timelineEmpty}</div>}</div><div className="mt-4"><div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-mist">{copy.meeting.savedLocally}</div><ScrollArea className="max-h-[180px] space-y-2 pr-1">{minutesHistory.map((record) => <button key={record.id} onClick={() => setMinutes(record.minutes)} className="w-full rounded-[18px] border border-ink/10 bg-white/75 px-3 py-2 text-left text-sm hover:bg-white"><div className="font-medium">{record.minutes.title}</div><div className="text-xs text-mist">{new Date(record.minutes.updatedAt).toLocaleString(copy.app.dateLocale)}</div></button>)}</ScrollArea></div></Card></div>
        </div>
      </div>
    </div>
  );
}




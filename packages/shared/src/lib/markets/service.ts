import type {
  MarketQuote,
  MarketSessionState,
  MarketSnapshot,
  MarketSparkPoint
} from "@/lib/meeting/types";
import { getKiwoomProxyConfig } from "@/lib/system/capabilities";

const KR_DEFAULT_SYMBOLS = ["005930", "000660", "035420"];
const US_DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA"];
const KR_INDEX_SYMBOLS = ["KOSPI", "KOSDAQ"];
const US_INDEX_SYMBOLS = ["SPY", "QQQ", "DIA"];
const KR_NAMES: Record<string, string> = {
  "005930": "Samsung Electronics",
  "000660": "SK hynix",
  "035420": "NAVER",
  KOSPI: "KOSPI",
  KOSDAQ: "KOSDAQ"
};
const US_NAMES: Record<string, string> = {
  SPY: "SPDR S&P 500 ETF",
  QQQ: "Invesco QQQ",
  DIA: "SPDR Dow Jones ETF",
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  TSLA: "Tesla"
};
const KR_INDEX_YAHOO_SYMBOLS: Record<string, string> = {
  KOSPI: "^KS11",
  KOSDAQ: "^KQ11"
};
const YAHOO_HEADERS: HeadersInit = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
};

type MarketRegion = "kr" | "us";

type UpbitTicker = {
  trade_price?: number;
  signed_change_price?: number;
  signed_change_rate?: number;
  acc_trade_price_24h?: number;
  prev_closing_price?: number;
  timestamp?: number;
};

type UpbitCandle = {
  candle_date_time_utc?: string;
  trade_price?: number;
};

type TwelveDataQuote = {
  symbol?: string;
  name?: string;
  close?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  volume?: string;
  datetime?: string;
};

type YahooFinanceQuoteResponse = {
  quoteResponse?: {
    result?: YahooFinanceQuote[];
  };
};

type YahooFinanceQuote = {
  symbol?: string;
  shortName?: string;
  longName?: string;
  displayName?: string;
  fullExchangeName?: string;
  marketState?: string;
  currency?: string;
  exchangeDataDelayedBy?: number;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketPreviousClose?: number;
  regularMarketTime?: number;
  regularMarketVolume?: number;
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePercent?: number;
  preMarketTime?: number;
  postMarketPrice?: number;
  postMarketChange?: number;
  postMarketChangePercent?: number;
  postMarketTime?: number;
};

type YahooChartResponse = {
  chart?: {
    result?: YahooChartResult[];
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
};

type YahooChartResult = {
  meta?: {
    currency?: string;
    symbol?: string;
    shortName?: string;
    longName?: string;
    fullExchangeName?: string;
    regularMarketPrice?: number;
    regularMarketTime?: number;
    previousClose?: number;
    chartPreviousClose?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
};

type NaverRealtimeResponse = {
  resultCode?: string;
  result?: {
    time?: number;
    areas?: Array<{
      name?: string;
      datas?: NaverRealtimeEntry[];
    }>;
  };
};

type NaverOverMarketInfo = {
  overPrice?: string;
  compareToPreviousClosePrice?: string;
  fluctuationsRatio?: string;
  localTradedAt?: string;
  overMarketStatus?: string;
  tradingSessionType?: string;
  compareToPreviousPrice?: {
    code?: string;
  };
  accumulatedTradingVolume?: string;
};

type NaverRealtimeEntry = {
  cd?: string;
  nm?: string;
  nv?: number;
  cv?: number;
  cr?: number;
  rf?: string;
  ms?: string;
  pcv?: number;
  aq?: number;
  nxtOverMarketPriceInfo?: NaverOverMarketInfo;
};

type ZonedDateParts = {
  weekday: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type RegionSnapshotOptions = {
  tab: "kr" | "us";
  region: MarketRegion;
  provider: string;
  headline: string;
  currency: string;
  indices: MarketQuote[];
  watchlist: MarketQuote[];
  sparkline?: MarketSparkPoint[];
  notes?: string[];
  delayed?: boolean;
  status?: string;
  updatedAt?: string;
  session?: MarketSessionState;
};

function hashSymbol(symbol: string) {
  return symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function wave(seed: number, scale: number) {
  const now = Date.now() / 60_000;
  return Math.sin(now / 5 + seed) * scale + Math.cos(now / 7 + seed / 2) * (scale / 2);
}

function normalizeSymbols(rawSymbols: string[] | undefined, fallback: string[]) {
  const values = (rawSymbols ?? fallback).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
  return values.length > 0 ? Array.from(new Set(values)) : fallback;
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

async function fetchNaverJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status}: ${text}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const encodings = ["euc-kr", "utf-8"] as const;

  for (const encoding of encodings) {
    try {
      return JSON.parse(new TextDecoder(encoding).decode(bytes)) as T;
    } catch {
      // Try the next decoder.
    }
  }

  throw new Error("Could not parse the Naver Finance response.");
}

function toNumeric(value: number | string | undefined | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function uniqueNotes(...lists: Array<string[] | undefined>) {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const list of lists) {
    for (const item of list ?? []) {
      const normalized = item.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      values.push(normalized);
    }
  }

  return values;
}

function getRegionTimeZone(region: MarketRegion) {
  return region === "kr" ? "Asia/Seoul" : "America/New_York";
}

function getSessionWindow(region: MarketRegion) {
  if (region === "kr") {
    return {
      preOpenMinute: 9 * 60,
      regularCloseMinute: 15 * 60 + 30,
      extendedCloseMinute: 20 * 60
    };
  }

  return {
    preOpenMinute: 4 * 60,
    regularOpenMinute: 9 * 60 + 30,
    regularCloseMinute: 16 * 60,
    extendedCloseMinute: 20 * 60
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 1);
  const day = Number(parts.find((part) => part.type === "day")?.value || 1);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  const second = Number(parts.find((part) => part.type === "second")?.value || 0);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);

  return asUtc - date.getTime();
}

function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = formatter.formatToParts(date);

  return {
    weekday: parts.find((part) => part.type === "weekday")?.value || "Mon",
    year: Number(parts.find((part) => part.type === "year")?.value || 0),
    month: Number(parts.find((part) => part.type === "month")?.value || 1),
    day: Number(parts.find((part) => part.type === "day")?.value || 1),
    hour: Number(parts.find((part) => part.type === "hour")?.value || 0),
    minute: Number(parts.find((part) => part.type === "minute")?.value || 0),
    second: Number(parts.find((part) => part.type === "second")?.value || 0)
  };
}

function zonedDateTimeToUtc(parts: Omit<ZonedDateParts, "weekday">, timeZone: string) {
  const utcGuess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);

  return new Date(utcGuess.getTime() - offsetMs);
}

function parseNaiveDateTimeInZone(value: string, timeZone: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) {
    return null;
  }

  return zonedDateTimeToUtc(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4] || 0),
      minute: Number(match[5] || 0),
      second: Number(match[6] || 0)
    },
    timeZone
  );
}

function parseTimestamp(value: string | undefined, timeZone?: string) {
  if (!value) {
    return null;
  }

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (timeZone) {
    const zoned = parseNaiveDateTimeInZone(value, timeZone);
    if (zoned) {
      return zoned;
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseLooseNumber(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-" || normalized === ".") {
    return null;
  }

  return toNumeric(normalized);
}

function getSignedNaverValue(value: number | string | undefined | null, code?: string) {
  const numeric =
    typeof value === "string" ? parseLooseNumber(value) : toNumeric(value);
  if (numeric === null) {
    return null;
  }

  if (numeric < 0) {
    return numeric;
  }

  if (code === "1" || code === "2") {
    return numeric;
  }

  if (code === "4" || code === "5") {
    return -numeric;
  }

  return numeric;
}

function scaleNaverIndexValue(value: number | undefined | null) {
  const numeric = toNumeric(value);
  return numeric === null ? null : numeric / 100;
}

function getLastRegularCloseTimestamp(region: MarketRegion, now = new Date()) {
  const timeZone = getRegionTimeZone(region);
  const currentParts = getZonedDateParts(now, timeZone);
  const weekdayName = currentParts.weekday.toLowerCase();
  const minuteOfDay = currentParts.hour * 60 + currentParts.minute;
  const sessionWindow = getSessionWindow(region);
  let offsetDays = 0;

  if (weekdayName === "sat") {
    offsetDays = 1;
  } else if (weekdayName === "sun") {
    offsetDays = 2;
  } else if (minuteOfDay < sessionWindow.preOpenMinute) {
    offsetDays = weekdayName === "mon" ? 3 : 1;
  }

  const baseDate = new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1_000);
  const baseParts = getZonedDateParts(baseDate, timeZone);
  const closeHour = region === "kr" ? 15 : 16;
  const closeMinute = region === "kr" ? 30 : 0;

  return zonedDateTimeToUtc(
    {
      year: baseParts.year,
      month: baseParts.month,
      day: baseParts.day,
      hour: closeHour,
      minute: closeMinute,
      second: 0
    },
    timeZone
  ).toISOString();
}

function getClockSession(region: MarketRegion, now = new Date()): MarketSessionState {
  const timeZone = getRegionTimeZone(region);
  const { weekday, hour, minute } = getZonedDateParts(now, timeZone);
  const weekdayName = weekday.toLowerCase();

  if (weekdayName === "sat" || weekdayName === "sun") {
    return "closed";
  }

  const minuteOfDay = hour * 60 + minute;
  const window = getSessionWindow(region);

  if (region === "kr") {
    if (minuteOfDay < window.preOpenMinute) {
      return "pre";
    }
    if (minuteOfDay <= window.regularCloseMinute) {
      return "open";
    }
    if (minuteOfDay <= window.extendedCloseMinute) {
      return "post";
    }
    return "closed";
  }

  if (minuteOfDay < window.preOpenMinute) {
    return "closed";
  }
  const regularOpenMinute =
    "regularOpenMinute" in window && typeof window.regularOpenMinute === "number"
      ? window.regularOpenMinute
      : window.preOpenMinute;
  if (minuteOfDay < regularOpenMinute) {
    return "pre";
  }
  if (minuteOfDay < window.regularCloseMinute) {
    return "open";
  }
  if (minuteOfDay < window.extendedCloseMinute) {
    return "post";
  }
  return "closed";
}

function normalizeSession(region: MarketRegion, marketState?: string): MarketSessionState {
  switch ((marketState || "").toUpperCase()) {
    case "REGULAR":
      return "open";
    case "PRE":
    case "PREPRE":
      return "pre";
    case "POST":
    case "POSTPOST":
      return "post";
    case "CLOSED":
      return "closed";
    default:
      return getClockSession(region);
  }
}

function getSnapshotStatus(delayed: boolean, mode: "live" | "demo" = "live") {
  if (mode === "demo") {
    return "demo";
  }

  return delayed ? "delayed" : "live";
}

function getSnapshotUpdatedAt(quotes: MarketQuote[]) {
  const timestamps = quotes
    .map((quote) => new Date(quote.updatedAt).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return new Date().toISOString();
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function pickSnapshotSession(region: MarketRegion, quotes: MarketQuote[], fallback?: MarketSessionState) {
  const sessions = quotes.map((quote) => quote.session).filter(Boolean) as MarketSessionState[];
  if (sessions.includes("open")) return "open";
  if (sessions.includes("pre")) return "pre";
  if (sessions.includes("post")) return "post";
  if (sessions.includes("closed")) return "closed";
  if (fallback) return fallback;
  return getClockSession(region);
}

function formatProviderName(provider: string) {
  if (provider === "kiwoom-proxy") return "Kiwoom proxy";
  if (provider === "twelve-data") return "Twelve Data";
  if (provider === "yahoo-finance") return "Yahoo Finance";
  if (provider === "naver-finance") return "Naver Finance";
  if (provider === "upbit") return "Upbit";
  return provider;
}

function buildLiveNotes(
  region: MarketRegion,
  provider: string,
  session: MarketSessionState,
  delayed: boolean,
  extraNotes: string[] = []
) {
  const regionName = region === "kr" ? "KR" : "US";
  const notes: string[] = [];

  if (session === "closed") {
    notes.push("Market closed. Showing the latest available close from the feed.");
  } else if (session === "pre") {
    notes.push("Pre-market session is active before the regular session.");
  } else if (session === "post") {
    notes.push("After-hours quotes are active outside the regular session.");
  }

  notes.push(`${regionName} board served through ${formatProviderName(provider)}.`);

  if (delayed) {
    notes.push("The provider marks this feed as delayed.");
  }

  return uniqueNotes(notes, extraNotes);
}

function buildDemoNotes(region: MarketRegion, session: MarketSessionState) {
  const regionName = region === "kr" ? "KR" : "US";
  const notes: string[] = [];

  if (session === "closed") {
    notes.push("Market closed. Demo prices are anchored to the last scheduled close.");
  } else if (session === "pre") {
    notes.push("Regular trading has not opened yet.");
  } else if (session === "post") {
    notes.push("Regular trading is over. Extended-hours prices are being simulated.");
  }

  notes.push(`Demo ${regionName} market feed active because a live source could not be reached.`);

  return notes;
}

function getPreferredYahooTime(quote: YahooFinanceQuote, session: MarketSessionState) {
  if (session === "pre") {
    return toNumeric(quote.preMarketTime) ?? toNumeric(quote.regularMarketTime);
  }
  if (session === "post") {
    return toNumeric(quote.postMarketTime) ?? toNumeric(quote.regularMarketTime);
  }
  return toNumeric(quote.regularMarketTime);
}

function getPreferredYahooPrice(quote: YahooFinanceQuote, session: MarketSessionState) {
  if (session === "pre") {
    return toNumeric(quote.preMarketPrice) ?? toNumeric(quote.regularMarketPrice);
  }
  if (session === "post") {
    return toNumeric(quote.postMarketPrice) ?? toNumeric(quote.regularMarketPrice);
  }
  return toNumeric(quote.regularMarketPrice);
}

function getPreferredYahooChange(quote: YahooFinanceQuote, session: MarketSessionState) {
  if (session === "pre") {
    return toNumeric(quote.preMarketChange) ?? toNumeric(quote.regularMarketChange);
  }
  if (session === "post") {
    return toNumeric(quote.postMarketChange) ?? toNumeric(quote.regularMarketChange);
  }
  return toNumeric(quote.regularMarketChange);
}

function getPreferredYahooChangePercent(quote: YahooFinanceQuote, session: MarketSessionState) {
  if (session === "pre") {
    return toNumeric(quote.preMarketChangePercent) ?? toNumeric(quote.regularMarketChangePercent);
  }
  if (session === "post") {
    return toNumeric(quote.postMarketChangePercent) ?? toNumeric(quote.regularMarketChangePercent);
  }
  return toNumeric(quote.regularMarketChangePercent);
}

function buildDemoQuote(args: {
  symbol: string;
  name: string;
  market: string;
  currency: string;
  basePrice: number;
  delayed?: boolean;
  session?: MarketSessionState;
  updatedAt?: string;
}): MarketQuote {
  const seed = hashSymbol(args.symbol);
  const session = args.session ?? "always";
  const activeSession = session === "always" || session === "open" || session === "pre" || session === "post";
  const closedShift = Math.sin(seed / 3) * args.basePrice * 0.003;
  const liveShift = activeSession ? wave(seed, args.basePrice * 0.008) : closedShift;
  const price = Math.max(args.basePrice + liveShift, 1);
  const previousClose = Math.max(args.basePrice - closedShift / 2, 1);

  return {
    symbol: args.symbol,
    name: args.name,
    market: args.market,
    price,
    change: price - previousClose,
    changePercent: ((price - previousClose) / previousClose) * 100,
    currency: args.currency,
    updatedAt: args.updatedAt || new Date().toISOString(),
    previousClose,
    volume: Math.abs(liveShift) * 1_000,
    delayed: args.delayed,
    session
  };
}

function buildDemoSparkline(basePrice: number): MarketSparkPoint[] {
  return Array.from({ length: 20 }, (_, index) => {
    const seed = index / 3;
    const price = basePrice + Math.sin(seed) * basePrice * 0.005 + Math.cos(seed / 2) * basePrice * 0.003;
    return {
      ts: new Date(Date.now() - (20 - index) * 60_000).toISOString(),
      price
    };
  });
}

function sortSparklineAsc(points: MarketSparkPoint[]) {
  return [...points].sort((left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime());
}

function toSnapshot(input: Partial<MarketSnapshot> & Pick<MarketSnapshot, "tab">): MarketSnapshot {
  return {
    provider: input.provider || "demo",
    updatedAt: input.updatedAt || new Date().toISOString(),
    headline: input.headline || "Market snapshot",
    status: input.status || "ready",
    currency: input.currency || "KRW",
    indices: input.indices ?? [],
    watchlist: input.watchlist ?? [],
    sparkline: input.sparkline,
    notes: input.notes ?? [],
    delayed: input.delayed ?? false,
    session: input.session ?? "always",
    tab: input.tab
  };
}

function buildRegionSnapshot(options: RegionSnapshotOptions) {
  const quotes = [...options.indices, ...options.watchlist];
  const delayed = options.delayed ?? quotes.some((quote) => Boolean(quote.delayed));
  const session = options.session ?? pickSnapshotSession(options.region, quotes);

  return toSnapshot({
    tab: options.tab,
    provider: options.provider,
    headline: options.headline,
    status: options.status || getSnapshotStatus(delayed),
    currency: options.currency,
    indices: options.indices,
    watchlist: options.watchlist,
    sparkline: options.sparkline,
    notes: options.notes ?? buildLiveNotes(options.region, options.provider, session, delayed),
    delayed,
    updatedAt: options.updatedAt || getSnapshotUpdatedAt(quotes),
    session
  });
}

function getLatestYahooChartPoint(result: YahooChartResult) {
  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const volumes = result.indicators?.quote?.[0]?.volume ?? [];

  for (let index = Math.min(timestamps.length, closes.length) - 1; index >= 0; index -= 1) {
    const price = toNumeric(closes[index]);
    const timestamp = toNumeric(timestamps[index]);
    if (price === null || timestamp === null) {
      continue;
    }

    return {
      price,
      timestamp,
      volume: toNumeric(volumes[index]) ?? undefined
    };
  }

  return null;
}

async function fetchYahooChart(symbol: string) {
  const response = await fetchJson<YahooChartResponse>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d&includePrePost=true`,
    { headers: YAHOO_HEADERS }
  );
  const result = response.chart?.result?.[0];

  if (!result) {
    const message = response.chart?.error?.description || "Yahoo Finance returned no chart data";
    throw new Error(message);
  }

  return result;
}

function toYahooChartMarketQuote(symbol: string, fallbackName: string, result: YahooChartResult): MarketQuote | null {
  const session = getClockSession("us");
  const latestPoint = getLatestYahooChartPoint(result);
  const regularPrice = toNumeric(result.meta?.regularMarketPrice);
  const previousClose = toNumeric(result.meta?.previousClose) ?? toNumeric(result.meta?.chartPreviousClose);

  if (previousClose === null && regularPrice === null && !latestPoint) {
    return null;
  }

  const price =
    session === "closed"
      ? regularPrice ?? latestPoint?.price ?? previousClose ?? 0
      : latestPoint?.price ?? regularPrice ?? previousClose ?? 0;
  const updatedAtSeconds =
    session === "closed"
      ? toNumeric(result.meta?.regularMarketTime)
      : latestPoint?.timestamp ?? toNumeric(result.meta?.regularMarketTime);
  const updatedAt =
    updatedAtSeconds !== null && updatedAtSeconds !== undefined
      ? new Date(updatedAtSeconds * 1_000).toISOString()
      : getLastRegularCloseTimestamp("us");
  const referenceClose = previousClose ?? price;

  return {
    symbol,
    name: result.meta?.longName || result.meta?.shortName || fallbackName,
    market: result.meta?.fullExchangeName || "US",
    price,
    change: price - referenceClose,
    changePercent: referenceClose ? ((price - referenceClose) / referenceClose) * 100 : 0,
    currency: result.meta?.currency || "USD",
    updatedAt,
    previousClose: referenceClose,
    volume: latestPoint?.volume,
    delayed: false,
    session
  };
}

async function fetchNaverRealtime(query: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("query", query);

  const response = await fetchNaverJson<NaverRealtimeResponse>(
    `https://polling.finance.naver.com/api/realtime?${searchParams.toString()}`
  );

  if (response.resultCode !== "success") {
    throw new Error("Naver Finance returned an unsuccessful response");
  }

  return response;
}

function getNaverEntries(response: NaverRealtimeResponse) {
  const entries = new Map<string, NaverRealtimeEntry>();

  for (const area of response.result?.areas ?? []) {
    for (const entry of area.datas ?? []) {
      if (!entry.cd) {
        continue;
      }

      entries.set(entry.cd.toUpperCase(), entry);
    }
  }

  return entries;
}

function toNaverMarketQuote(args: {
  entry: NaverRealtimeEntry;
  symbol: string;
  fallbackName: string;
  session: MarketSessionState;
  fetchedAtIso: string;
  isIndex?: boolean;
}): MarketQuote | null {
  const price =
    args.isIndex
      ? scaleNaverIndexValue(args.entry.nv)
      : toNumeric(args.entry.nv);
  if (price === null) {
    return null;
  }

  const mainChange = args.isIndex
    ? scaleNaverIndexValue(args.entry.cv)
    : getSignedNaverValue(args.entry.cv, args.entry.rf);
  const mainChangePercent = getSignedNaverValue(args.entry.cr, args.entry.rf) ?? 0;
  const afterHours = args.entry.nxtOverMarketPriceInfo;
  const afterHoursOpen = args.session === "post" && afterHours?.overMarketStatus === "OPEN";
  const afterHoursPrice = parseLooseNumber(afterHours?.overPrice);
  const afterHoursChange = getSignedNaverValue(
    afterHours?.compareToPreviousClosePrice,
    afterHours?.compareToPreviousPrice?.code
  );
  const afterHoursChangePercent = parseLooseNumber(afterHours?.fluctuationsRatio);
  const updatedAt =
    afterHoursOpen && afterHours?.localTradedAt
      ? parseTimestamp(afterHours.localTradedAt)?.toISOString() || args.fetchedAtIso
      : args.session === "closed" || args.session === "pre"
        ? getLastRegularCloseTimestamp("kr")
        : args.fetchedAtIso;
  const previousClose =
    args.isIndex
      ? scaleNaverIndexValue(args.entry.pcv)
      : toNumeric(args.entry.pcv);
  const referenceClose = previousClose ?? price - (mainChange ?? 0);
  const priceValue = afterHoursOpen && afterHoursPrice !== null ? afterHoursPrice : price;
  const changeValue = afterHoursOpen && afterHoursChange !== null ? afterHoursChange : mainChange ?? 0;
  const changePercentValue =
    afterHoursOpen && afterHoursChangePercent !== null ? afterHoursChangePercent : mainChangePercent;

  return {
    symbol: args.symbol,
    name: args.entry.nm || args.fallbackName,
    market: "KRX",
    price: priceValue,
    change: changeValue,
    changePercent: changePercentValue,
    currency: "KRW",
    updatedAt,
    previousClose: referenceClose,
    volume: afterHoursOpen ? parseLooseNumber(afterHours?.accumulatedTradingVolume) ?? undefined : toNumeric(args.entry.aq) ?? undefined,
    delayed: false,
    session: args.session
  };
}

async function getKrPublicSnapshot(symbols: string[]) {
  const [watchResponse, indexResponse] = await Promise.all([
    fetchNaverRealtime(`SERVICE_ITEM:${symbols.join(",")}`),
    fetchNaverRealtime(`SERVICE_INDEX:${KR_INDEX_SYMBOLS.join(",")}`)
  ]);
  const session = getClockSession("kr");
  const fetchedAtIso = new Date(watchResponse.result?.time ?? Date.now()).toISOString();
  const watchEntries = getNaverEntries(watchResponse);
  const indexEntries = getNaverEntries(indexResponse);
  const indices = KR_INDEX_SYMBOLS.map((symbol) => {
    const entry = indexEntries.get(symbol);
    if (!entry) {
      return null;
    }

    return toNaverMarketQuote({
      entry,
      symbol,
      fallbackName: KR_NAMES[symbol],
      session,
      fetchedAtIso,
      isIndex: true
    });
  }).filter((quote): quote is MarketQuote => Boolean(quote));
  const watchlist = symbols
    .map((symbol) => {
      const entry = watchEntries.get(symbol);
      if (!entry) {
        return null;
      }

      return toNaverMarketQuote({
        entry,
        symbol,
        fallbackName: KR_NAMES[symbol] || `KR ${symbol}`,
        session,
        fetchedAtIso
      });
    })
    .filter((quote): quote is MarketQuote => Boolean(quote));

  if (indices.length === 0 && watchlist.length === 0) {
    throw new Error("Naver Finance returned no KR quotes");
  }

  return buildRegionSnapshot({
    tab: "kr",
    region: "kr",
    provider: "naver-finance",
    headline: "KR market board",
    currency: "KRW",
    indices,
    watchlist,
    delayed: false,
    notes: buildLiveNotes("kr", "naver-finance", session, false, [
      "Public realtime fallback is active because no Kiwoom proxy is configured."
    ]),
    session
  });
}

async function getUsYahooSnapshot(symbols: string[]) {
  const allSymbols = [...US_INDEX_SYMBOLS, ...symbols];
  const results = await Promise.all(
    allSymbols.map(async (symbol) => [symbol, await fetchYahooChart(symbol)] as const)
  );
  const bySymbol = new Map(results);
  const indices = US_INDEX_SYMBOLS.map((symbol) => {
    const result = bySymbol.get(symbol);
    return result ? toYahooChartMarketQuote(symbol, US_NAMES[symbol], result) : null;
  }).filter((quote): quote is MarketQuote => Boolean(quote));
  const watchlist = symbols
    .map((symbol) => {
      const result = bySymbol.get(symbol);
      return result ? toYahooChartMarketQuote(symbol, US_NAMES[symbol] || symbol, result) : null;
    })
    .filter((quote): quote is MarketQuote => Boolean(quote));

  if (indices.length === 0 && watchlist.length === 0) {
    throw new Error("Yahoo Finance returned no US charts");
  }

  const session = pickSnapshotSession("us", [...indices, ...watchlist], getClockSession("us"));

  return buildRegionSnapshot({
    tab: "us",
    region: "us",
    provider: "yahoo-finance",
    headline: "US market board",
    currency: "USD",
    indices,
    watchlist,
    delayed: false,
    notes: buildLiveNotes("us", "yahoo-finance", session, false, [
      "Public chart fallback is active because no Twelve Data key is configured."
    ]),
    session
  });
}

async function getBtcLiveSnapshot(): Promise<MarketSnapshot> {
  const [ticker] = await fetchJson<UpbitTicker[]>("https://api.upbit.com/v1/ticker?markets=KRW-BTC");
  const candles = await fetchJson<UpbitCandle[]>(
    "https://api.upbit.com/v1/candles/minutes/1?market=KRW-BTC&count=20"
  );
  const price = ticker.trade_price ?? 0;
  const previousClose = ticker.prev_closing_price ?? price;

  return toSnapshot({
    tab: "btc",
    provider: "upbit",
    headline: "Bitcoin monitor",
    status: "live",
    currency: "KRW",
    watchlist: [
      {
        symbol: "KRW-BTC",
        name: "Bitcoin",
        market: "UPBIT",
        price,
        change: ticker.signed_change_price ?? 0,
        changePercent: (ticker.signed_change_rate ?? 0) * 100,
        currency: "KRW",
        updatedAt: new Date(ticker.timestamp ?? Date.now()).toISOString(),
        previousClose,
        volume: ticker.acc_trade_price_24h,
        delayed: false,
        session: "always"
      }
    ],
    sparkline: sortSparklineAsc(
      candles
        .filter((entry): entry is Required<Pick<UpbitCandle, "candle_date_time_utc" | "trade_price">> =>
          Boolean(entry.candle_date_time_utc && typeof entry.trade_price === "number")
        )
        .map((entry) => ({
          ts: `${entry.candle_date_time_utc}Z`,
          price: entry.trade_price
        }))
    ),
    notes: ["REST snapshot from Upbit. The client attempts a direct WebSocket subscription for live ticks."],
    delayed: false,
    session: "always"
  });
}

function getBtcDemoSnapshot() {
  const quote = buildDemoQuote({
    symbol: "KRW-BTC",
    name: "Bitcoin",
    market: "DEMO",
    currency: "KRW",
    basePrice: 132_000_000,
    session: "always"
  });

  return toSnapshot({
    tab: "btc",
    provider: "demo",
    headline: "Bitcoin monitor",
    status: "demo",
    currency: "KRW",
    watchlist: [quote],
    sparkline: buildDemoSparkline(quote.price),
    notes: ["Demo feed active because the live Upbit snapshot could not be reached."],
    delayed: false,
    session: "always"
  });
}

export async function getBtcSnapshot() {
  try {
    return await getBtcLiveSnapshot();
  } catch {
    return getBtcDemoSnapshot();
  }
}

async function getKiwoomSnapshot(symbols: string[]): Promise<MarketSnapshot> {
  const config = getKiwoomProxyConfig();
  if (!config) {
    throw new Error("Kiwoom proxy not configured");
  }

  const searchParams = new URLSearchParams();
  searchParams.set("symbols", symbols.join(","));

  const headers: HeadersInit = config.token ? { Authorization: `Bearer ${config.token}` } : {};
  const response = await fetchJson<MarketSnapshot>(`${config.baseUrl}/markets/kr?${searchParams.toString()}`, {
    headers
  });
  const session = response.session ?? getClockSession("kr");
  const delayed = response.delayed ?? false;
  const provider = response.provider || "kiwoom-proxy";

  return toSnapshot({
    ...response,
    tab: "kr",
    provider,
    status: response.status || getSnapshotStatus(delayed),
    updatedAt: response.updatedAt || getSnapshotUpdatedAt([...(response.indices ?? []), ...(response.watchlist ?? [])]),
    notes: uniqueNotes(response.notes, buildLiveNotes("kr", provider, session, delayed)),
    delayed,
    session
  });
}

function getKrDemoSnapshot(symbols: string[]) {
  const session = getClockSession("kr");
  const updatedAt = session === "closed" || session === "pre" ? getLastRegularCloseTimestamp("kr") : new Date().toISOString();
  const watchlist = symbols.map((symbol, index) =>
    buildDemoQuote({
      symbol,
      name: KR_NAMES[symbol] || `KR ${symbol}`,
      market: "KRX",
      currency: "KRW",
      basePrice: [55_000, 180_000, 215_000][index] || 70_000 + index * 18_000,
      delayed: true,
      session,
      updatedAt
    })
  );
  const indices = [
    buildDemoQuote({
      symbol: "KOSPI",
      name: KR_NAMES.KOSPI,
      market: "KRX",
      currency: "KRW",
      basePrice: 2_640,
      delayed: true,
      session,
      updatedAt
    }),
    buildDemoQuote({
      symbol: "KOSDAQ",
      name: KR_NAMES.KOSDAQ,
      market: "KRX",
      currency: "KRW",
      basePrice: 860,
      delayed: true,
      session,
      updatedAt
    })
  ];

  return toSnapshot({
    tab: "kr",
    provider: "demo",
    headline: "KR market board",
    status: "demo",
    currency: "KRW",
    indices,
    watchlist,
    notes: uniqueNotes(
      ["Demo KR market feed. Attach a Kiwoom-compatible proxy to replace this board with live KRX data."],
      buildDemoNotes("kr", session)
    ),
    delayed: true,
    updatedAt,
    session
  });
}

export async function getKrMarketSnapshot(symbols?: string[]) {
  const normalizedSymbols = normalizeSymbols(symbols, KR_DEFAULT_SYMBOLS);

  try {
    return await getKiwoomSnapshot(normalizedSymbols);
  } catch {
    try {
      return await getKrPublicSnapshot(normalizedSymbols);
    } catch {
      return getKrDemoSnapshot(normalizedSymbols);
    }
  }
}

async function fetchTwelveDataQuote(symbol: string, apiKey: string): Promise<MarketQuote> {
  const response = await fetchJson<TwelveDataQuote>(
    `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`
  );
  const price = toNumeric(response.close) ?? 0;
  const previousClose = toNumeric(response.previous_close) ?? price;
  const change = toNumeric(response.change) ?? price - previousClose;
  const changePercent =
    toNumeric(response.percent_change) ??
    (previousClose ? Number((((price - previousClose) / previousClose) * 100).toFixed(2)) : 0);
  const updatedAt =
    parseTimestamp(response.datetime, getRegionTimeZone("us"))?.toISOString() || new Date().toISOString();

  return {
    symbol,
    name: response.name || US_NAMES[symbol] || symbol,
    market: "US",
    price,
    change,
    changePercent,
    currency: "USD",
    updatedAt,
    previousClose,
    volume: toNumeric(response.volume) ?? undefined,
    delayed: true,
    session: getClockSession("us")
  };
}

async function getUsLiveSnapshot(symbols: string[]) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    throw new Error("TWELVE_DATA_API_KEY is not set");
  }

  const [indices, watchlist] = await Promise.all([
    Promise.all(US_INDEX_SYMBOLS.map((symbol) => fetchTwelveDataQuote(symbol, apiKey))),
    Promise.all(symbols.map((symbol) => fetchTwelveDataQuote(symbol, apiKey)))
  ]);
  const session = pickSnapshotSession("us", [...indices, ...watchlist], getClockSession("us"));

  return buildRegionSnapshot({
    tab: "us",
    region: "us",
    provider: "twelve-data",
    headline: "US market board",
    status: "delayed",
    currency: "USD",
    indices,
    watchlist,
    delayed: true,
    notes: buildLiveNotes("us", "twelve-data", session, true, [
      "Treat this as a server-fetched monitoring feed rather than a low-latency trading feed."
    ]),
    session
  });
}

function getUsDemoSnapshot(symbols: string[]) {
  const basePrices: Record<string, number> = {
    SPY: 560,
    QQQ: 485,
    DIA: 405,
    AAPL: 212,
    MSFT: 418,
    NVDA: 910,
    TSLA: 192
  };
  const session = getClockSession("us");
  const updatedAt = session === "closed" || session === "pre" ? getLastRegularCloseTimestamp("us") : new Date().toISOString();

  const indices = US_INDEX_SYMBOLS.map((symbol) =>
    buildDemoQuote({
      symbol,
      name: US_NAMES[symbol],
      market: "US",
      currency: "USD",
      basePrice: basePrices[symbol],
      delayed: true,
      session,
      updatedAt
    })
  );
  const watchlist = symbols.map((symbol) =>
    buildDemoQuote({
      symbol,
      name: US_NAMES[symbol] || symbol,
      market: "US",
      currency: "USD",
      basePrice: basePrices[symbol] || 100 + hashSymbol(symbol) / 10,
      delayed: true,
      session,
      updatedAt
    })
  );

  return toSnapshot({
    tab: "us",
    provider: "demo",
    headline: "US market board",
    status: "demo",
    currency: "USD",
    indices,
    watchlist,
    notes: uniqueNotes(
      ["Demo US market feed. Add TWELVE_DATA_API_KEY to replace it with a server-fetched board."],
      buildDemoNotes("us", session)
    ),
    delayed: true,
    updatedAt,
    session
  });
}

export async function getUsMarketSnapshot(symbols?: string[]) {
  const normalizedSymbols = normalizeSymbols(symbols, US_DEFAULT_SYMBOLS);

  try {
    return await getUsLiveSnapshot(normalizedSymbols);
  } catch {
    try {
      return await getUsYahooSnapshot(normalizedSymbols);
    } catch {
      return getUsDemoSnapshot(normalizedSymbols);
    }
  }
}

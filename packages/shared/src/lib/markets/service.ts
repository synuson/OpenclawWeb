import type { MarketQuote, MarketSnapshot, MarketSparkPoint } from "@/lib/meeting/types";
import { getKiwoomProxyConfig } from "@/lib/system/capabilities";

const KR_DEFAULT_SYMBOLS = ["005930", "000660", "035420"];
const US_DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA"];
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

function buildDemoQuote(args: {
  symbol: string;
  name: string;
  market: string;
  currency: string;
  basePrice: number;
  delayed?: boolean;
}): MarketQuote {
  const seed = hashSymbol(args.symbol);
  const change = wave(seed, args.basePrice * 0.008);
  const price = Math.max(args.basePrice + change, 1);
  const previousClose = args.basePrice - change / 2;

  return {
    symbol: args.symbol,
    name: args.name,
    market: args.market,
    price,
    change: price - previousClose,
    changePercent: ((price - previousClose) / previousClose) * 100,
    currency: args.currency,
    updatedAt: new Date().toISOString(),
    previousClose,
    volume: Math.abs(change) * 1_000,
    delayed: args.delayed
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
    tab: input.tab
  };
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
        delayed: false
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
    delayed: false
  });
}

function getBtcDemoSnapshot() {
  const quote = buildDemoQuote({
    symbol: "KRW-BTC",
    name: "Bitcoin",
    market: "DEMO",
    currency: "KRW",
    basePrice: 132_000_000
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
    delayed: false
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

  return toSnapshot({
    ...response,
    tab: "kr",
    provider: response.provider || "kiwoom-proxy",
    status: response.status || "live"
  });
}

function getKrDemoSnapshot(symbols: string[]) {
  const watchlist = symbols.map((symbol, index) =>
    buildDemoQuote({
      symbol,
      name: KR_NAMES[symbol] || `KR ${symbol}`,
      market: "KRX",
      currency: "KRW",
      basePrice: [55_000, 180_000, 215_000][index] || 70_000 + index * 18_000,
      delayed: true
    })
  );
  const indices = [
    buildDemoQuote({
      symbol: "KOSPI",
      name: KR_NAMES.KOSPI,
      market: "KRX",
      currency: "KRW",
      basePrice: 2_640,
      delayed: true
    }),
    buildDemoQuote({
      symbol: "KOSDAQ",
      name: KR_NAMES.KOSDAQ,
      market: "KRX",
      currency: "KRW",
      basePrice: 860,
      delayed: true
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
    notes: ["Demo KR market feed. Attach a Kiwoom-compatible proxy to replace this board with live KRX data."],
    delayed: true
  });
}

export async function getKrMarketSnapshot(symbols?: string[]) {
  const normalizedSymbols = normalizeSymbols(symbols, KR_DEFAULT_SYMBOLS);

  try {
    return await getKiwoomSnapshot(normalizedSymbols);
  } catch {
    return getKrDemoSnapshot(normalizedSymbols);
  }
}

async function fetchTwelveDataQuote(symbol: string, apiKey: string): Promise<MarketQuote> {
  const response = await fetchJson<TwelveDataQuote>(
    `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`
  );
  const price = Number(response.close ?? 0);
  const previousClose = Number(response.previous_close ?? price);
  const change = Number(response.change ?? price - previousClose);
  const changePercent = Number(response.percent_change ?? ((change / previousClose) * 100).toFixed(2));

  return {
    symbol,
    name: response.name || US_NAMES[symbol] || symbol,
    market: "US",
    price,
    change,
    changePercent,
    currency: "USD",
    updatedAt: response.datetime ? new Date(response.datetime).toISOString() : new Date().toISOString(),
    previousClose,
    volume: Number(response.volume ?? 0),
    delayed: true
  };
}

async function getUsLiveSnapshot(symbols: string[]) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    throw new Error("TWELVE_DATA_API_KEY is not set");
  }

  const indexSymbols = ["SPY", "QQQ", "DIA"];
  const [indices, watchlist] = await Promise.all([
    Promise.all(indexSymbols.map((symbol) => fetchTwelveDataQuote(symbol, apiKey))),
    Promise.all(symbols.map((symbol) => fetchTwelveDataQuote(symbol, apiKey)))
  ]);

  return toSnapshot({
    tab: "us",
    provider: "twelve-data",
    headline: "US market board",
    status: "live",
    currency: "USD",
    indices,
    watchlist,
    notes: ["US board served through Twelve Data. Treat it as a budget-friendly monitoring feed."],
    delayed: true
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

  const indices = ["SPY", "QQQ", "DIA"].map((symbol) =>
    buildDemoQuote({
      symbol,
      name: US_NAMES[symbol],
      market: "US",
      currency: "USD",
      basePrice: basePrices[symbol],
      delayed: true
    })
  );
  const watchlist = symbols.map((symbol) =>
    buildDemoQuote({
      symbol,
      name: US_NAMES[symbol] || symbol,
      market: "US",
      currency: "USD",
      basePrice: basePrices[symbol] || 100 + hashSymbol(symbol) / 10,
      delayed: true
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
    notes: ["Demo US market feed. Add TWELVE_DATA_API_KEY to replace it with a server-fetched board."],
    delayed: true
  });
}

export async function getUsMarketSnapshot(symbols?: string[]) {
  const normalizedSymbols = normalizeSymbols(symbols, US_DEFAULT_SYMBOLS);

  try {
    return await getUsLiveSnapshot(normalizedSymbols);
  } catch {
    return getUsDemoSnapshot(normalizedSymbols);
  }
}

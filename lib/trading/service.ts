import { getKrMarketSnapshot } from "@/lib/markets/service";
import type {
  PortfolioPosition,
  PortfolioSnapshot,
  TradeOrder,
  TradeOrderRequest,
  TradeOrderResult
} from "@/lib/meeting/types";
import { getKiwoomProxyConfig } from "@/lib/system/capabilities";
import { uid } from "@/lib/utils";

type DemoPositionState = {
  symbol: string;
  name: string;
  quantity: number;
  averagePrice: number;
};

type TradingStore = {
  cash: number;
  positions: Record<string, DemoPositionState>;
  orders: TradeOrder[];
};

declare global {
  var __openclawTradingStore__: TradingStore | undefined;
}

const DEFAULT_CASH = 50_000_000;

function getStore() {
  if (!global.__openclawTradingStore__) {
    global.__openclawTradingStore__ = {
      cash: DEFAULT_CASH,
      positions: {},
      orders: []
    };
  }

  return global.__openclawTradingStore__;
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

function normalizeAccount(account: Partial<PortfolioSnapshot>): PortfolioSnapshot {
  return {
    broker: account.broker || "OpenClaw Demo Trading",
    mode: account.mode || "demo",
    currency: account.currency || "KRW",
    cash: account.cash ?? 0,
    buyingPower: account.buyingPower ?? account.cash ?? 0,
    investedAmount: account.investedAmount ?? 0,
    marketValue: account.marketValue ?? 0,
    equity: account.equity ?? 0,
    dayPnl: account.dayPnl ?? 0,
    dayPnlPercent: account.dayPnlPercent ?? 0,
    positions: account.positions ?? [],
    updatedAt: account.updatedAt || new Date().toISOString()
  };
}

async function getProxyAccount(): Promise<PortfolioSnapshot> {
  const config = getKiwoomProxyConfig();
  if (!config) {
    throw new Error("Kiwoom proxy not configured");
  }

  const headers: HeadersInit = config.token ? { Authorization: `Bearer ${config.token}` } : {};
  const account = await fetchJson<PortfolioSnapshot>(`${config.baseUrl}/trading/account`, {
    headers
  });

  return normalizeAccount({
    ...account,
    mode: "kiwoom",
    broker: account.broker || "Kiwoom REST"
  });
}

async function getProxyOrders(): Promise<TradeOrder[]> {
  const config = getKiwoomProxyConfig();
  if (!config) {
    throw new Error("Kiwoom proxy not configured");
  }

  const headers: HeadersInit = config.token ? { Authorization: `Bearer ${config.token}` } : {};
  return fetchJson<TradeOrder[]>(`${config.baseUrl}/trading/orders`, {
    headers
  });
}

async function submitProxyOrder(request: TradeOrderRequest): Promise<TradeOrderResult> {
  const config = getKiwoomProxyConfig();
  if (!config) {
    throw new Error("Kiwoom proxy not configured");
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json"
  };
  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }

  return fetchJson<TradeOrderResult>(`${config.baseUrl}/trading/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify(request)
  });
}

async function getDemoPriceMap(symbols: string[]) {
  const snapshot = await getKrMarketSnapshot(symbols);
  return new Map(snapshot.watchlist.map((item) => [item.symbol, item]));
}

async function settleOpenOrders() {
  const store = getStore();
  const openOrders = store.orders.filter((order) => order.status === "open");
  if (openOrders.length === 0) {
    return;
  }

  const priceMap = await getDemoPriceMap(openOrders.map((order) => order.symbol));

  for (const order of openOrders) {
    const quote = priceMap.get(order.symbol);
    if (!quote) {
      continue;
    }

    const limitPrice = order.limitPrice ?? quote.price;
    const shouldFill =
      order.orderType === "market" ||
      (order.side === "buy" && quote.price <= limitPrice) ||
      (order.side === "sell" && quote.price >= limitPrice);

    if (!shouldFill) {
      continue;
    }

    applyFilledOrder(order, order.orderType === "limit" ? limitPrice : quote.price, quote.name);
  }
}

function applyFilledOrder(order: TradeOrder, fillPrice: number, fallbackName: string) {
  const store = getStore();
  const totalCost = fillPrice * order.quantity;
  const now = new Date().toISOString();
  const existing = store.positions[order.symbol];

  if (order.side === "buy") {
    if (store.cash < totalCost) {
      order.status = "rejected";
      order.reason = "Not enough buying power";
      order.updatedAt = now;
      return;
    }

    const nextQuantity = (existing?.quantity ?? 0) + order.quantity;
    const nextAverage =
      ((existing?.averagePrice ?? 0) * (existing?.quantity ?? 0) + totalCost) / Math.max(nextQuantity, 1);

    store.positions[order.symbol] = {
      symbol: order.symbol,
      name: order.name || existing?.name || fallbackName,
      quantity: nextQuantity,
      averagePrice: nextAverage
    };
    store.cash -= totalCost;
  } else {
    if (!existing || existing.quantity < order.quantity) {
      order.status = "rejected";
      order.reason = "Not enough shares to sell";
      order.updatedAt = now;
      return;
    }

    const nextQuantity = existing.quantity - order.quantity;
    store.cash += totalCost;

    if (nextQuantity === 0) {
      delete store.positions[order.symbol];
    } else {
      store.positions[order.symbol] = {
        ...existing,
        quantity: nextQuantity
      };
    }
  }

  order.status = "filled";
  order.fillPrice = fillPrice;
  order.updatedAt = now;
}

function buildAccount(positions: PortfolioPosition[]): PortfolioSnapshot {
  const store = getStore();
  const investedAmount = positions.reduce((sum, position) => sum + position.averagePrice * position.quantity, 0);
  const marketValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
  const equity = store.cash + marketValue;
  const dayPnl = positions.reduce((sum, position) => sum + position.unrealizedPnl, 0);

  return normalizeAccount({
    broker: "OpenClaw Demo Trading",
    mode: "demo",
    currency: "KRW",
    cash: store.cash,
    buyingPower: store.cash,
    investedAmount,
    marketValue,
    equity,
    dayPnl,
    dayPnlPercent: investedAmount > 0 ? (dayPnl / investedAmount) * 100 : 0,
    positions,
    updatedAt: new Date().toISOString()
  });
}

async function getDemoAccount(): Promise<PortfolioSnapshot> {
  await settleOpenOrders();

  const store = getStore();
  const trackedSymbols = Array.from(
    new Set([
      ...Object.keys(store.positions),
      ...store.orders.filter((order) => order.status === "open").map((order) => order.symbol),
      "005930",
      "000660",
      "035420"
    ])
  );
  const priceMap = await getDemoPriceMap(trackedSymbols);

  const positions: PortfolioPosition[] = Object.values(store.positions).map((position) => {
    const quote = priceMap.get(position.symbol);
    const lastPrice = quote?.price ?? position.averagePrice;
    const marketValue = lastPrice * position.quantity;
    const unrealizedPnl = marketValue - position.averagePrice * position.quantity;

    return {
      symbol: position.symbol,
      name: position.name,
      quantity: position.quantity,
      averagePrice: position.averagePrice,
      lastPrice,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPercent:
        position.averagePrice > 0 ? ((lastPrice - position.averagePrice) / position.averagePrice) * 100 : 0
    };
  });

  return buildAccount(positions);
}

async function submitDemoOrder(request: TradeOrderRequest): Promise<TradeOrderResult> {
  const store = getStore();
  const priceMap = await getDemoPriceMap([request.symbol]);
  const quote = priceMap.get(request.symbol);
  const now = new Date().toISOString();
  const order: TradeOrder = {
    id: uid("order"),
    symbol: request.symbol,
    name: request.name || quote?.name || request.symbol,
    side: request.side,
    orderType: request.orderType,
    quantity: request.quantity,
    limitPrice: request.limitPrice,
    status: "open",
    createdAt: now,
    updatedAt: now
  };

  if (!quote) {
    order.status = "rejected";
    order.reason = "Quote unavailable";
    store.orders.unshift(order);
    return {
      order,
      account: await getDemoAccount()
    };
  }

  if (request.orderType === "market") {
    applyFilledOrder(order, quote.price, quote.name);
  } else {
    const shouldFill =
      (request.side === "buy" && quote.price <= (request.limitPrice ?? quote.price)) ||
      (request.side === "sell" && quote.price >= (request.limitPrice ?? quote.price));

    if (shouldFill) {
      applyFilledOrder(order, request.limitPrice ?? quote.price, quote.name);
    }
  }

  store.orders.unshift(order);
  store.orders = store.orders.slice(0, 50);

  return {
    order,
    account: await getDemoAccount()
  };
}

export async function getTradingAccount() {
  try {
    return await getProxyAccount();
  } catch {
    return getDemoAccount();
  }
}

export async function getTradingOrders() {
  try {
    return await getProxyOrders();
  } catch {
    await settleOpenOrders();
    return [...getStore().orders];
  }
}

export async function placeTradingOrder(request: TradeOrderRequest) {
  try {
    return await submitProxyOrder(request);
  } catch {
    return submitDemoOrder(request);
  }
}

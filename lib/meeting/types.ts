export type AgentId = "assistant" | "analyst";

export type Provider = "cerebras" | "anthropic" | "openai" | "mock";

export type WorkspaceTab = "btc" | "kr" | "us" | "trading";

export type RoundPhase = "analysis" | "summary";

export type AgentStatus = "idle" | "thinking" | "speaking" | "browsing";

export type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
  agent?: AgentId;
};

export type MeetingAction = {
  type: "openclaw_task";
  instruction: string;
  url?: string;
};

export type MeetingChatRequest = {
  message: string;
  agentId?: AgentId;
  participants: string[];
  history: ChatHistoryItem[];
  phase?: RoundPhase;
};

export type MeetingChatResponse = {
  agentId: AgentId;
  message: string;
  timestamp: string;
  provider: Provider;
  phase?: RoundPhase;
  actions?: MeetingAction[];
};

export type MeetingTurn = {
  id: string;
  agentId: AgentId;
  speakerLabel: string;
  text: string;
  timestamp: string;
  provider: Provider;
  phase: RoundPhase;
};

export type MeetingTimelineItem = {
  id: string;
  ts: string;
  kind: "message" | "task";
  speakerType: "user" | "agent" | "system";
  agentId?: AgentId;
  speakerLabel: string;
  badge?: string;
  text: string;
  provider?: Provider;
};

export type SpeechMode = "browser" | "whisper";

export type TtsMode = "browser" | "elevenlabs";

export type AutoSpeakMode = "off" | "summary" | "all";

export type MarketQuote = {
  symbol: string;
  name: string;
  market: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  updatedAt: string;
  previousClose?: number;
  volume?: number;
  delayed?: boolean;
};

export type MarketSparkPoint = {
  ts: string;
  price: number;
};

export type MarketSnapshot = {
  tab: WorkspaceTab;
  provider: string;
  updatedAt: string;
  headline: string;
  status: string;
  currency: string;
  indices: MarketQuote[];
  watchlist: MarketQuote[];
  sparkline?: MarketSparkPoint[];
  notes: string[];
  delayed: boolean;
};

export type PortfolioPosition = {
  symbol: string;
  name: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
};

export type PortfolioSnapshot = {
  broker: string;
  mode: "demo" | "kiwoom";
  currency: string;
  cash: number;
  buyingPower: number;
  investedAmount: number;
  marketValue: number;
  equity: number;
  dayPnl: number;
  dayPnlPercent: number;
  positions: PortfolioPosition[];
  updatedAt: string;
};

export type TradeOrderSide = "buy" | "sell";

export type TradeOrderType = "market" | "limit";

export type TradeOrder = {
  id: string;
  symbol: string;
  name: string;
  side: TradeOrderSide;
  orderType: TradeOrderType;
  quantity: number;
  limitPrice?: number;
  fillPrice?: number;
  status: "filled" | "open" | "rejected";
  reason?: string;
  createdAt: string;
  updatedAt: string;
};

export type TradeOrderRequest = {
  symbol: string;
  name?: string;
  side: TradeOrderSide;
  orderType: TradeOrderType;
  quantity: number;
  limitPrice?: number;
};

export type TradeOrderResult = {
  order: TradeOrder;
  account: PortfolioSnapshot;
};

export type MeetingMinutes = {
  sessionId: string;
  title: string;
  updatedAt: string;
  activeTab: WorkspaceTab;
  summary: string;
  marketSnapshot: string[];
  keyPoints: string[];
  actionItems: string[];
  tradeNotes: string[];
};

export type MeetingSessionRecord = {
  id: string;
  createdAt: string;
  minutes: MeetingMinutes;
  turns: MeetingTurn[];
  userMessage: string;
};

export type MeetingRoundRequest = {
  message: string;
  history: ChatHistoryItem[];
  activeTab: WorkspaceTab;
  marketSnapshot?: MarketSnapshot | null;
  portfolioSnapshot?: PortfolioSnapshot | null;
  minutes?: MeetingMinutes | null;
};

export type MeetingRoundResponse = {
  turns: MeetingTurn[];
  minutes: MeetingMinutes;
  provider: Provider;
  actions?: MeetingAction[];
};

export type Capabilities = {
  openaiStt: boolean;
  elevenLabsTts: boolean;
  kiwoomRest: boolean;
  twelveData: boolean;
  demoTrading: boolean;
  openclawRemote: boolean;
};

export type MeetingTaskStatus = "queued" | "running" | "succeeded" | "failed";

export type MeetingTaskLog = {
  id: string;
  ts: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
};

export type MeetingTask = {
  taskId: string;
  sessionId: string;
  agentId: AgentId | string;
  instruction: string;
  url?: string;
  status: MeetingTaskStatus;
  summary: string;
  logs: MeetingTaskLog[];
  screenshot?: string;
  updatedAt: string;
};

export type MeetingTaskArtifacts = {
  taskId: string;
  screenshot?: string;
  notes: string[];
};

import { DEFAULT_LOCALE, resolveAppLocale, type AppLocale } from "@/lib/i18n/config";
import { getAgentsById } from "@/lib/meeting/agents";
import type {
  ChatHistoryItem,
  MeetingTask,
  MeetingTaskArtifacts,
  MeetingTaskLog,
  MeetingTaskStatus,
  RoundPhase
} from "@/lib/meeting/types";
import { uid } from "@/lib/utils";

type StartMeetingTaskArgs = {
  agentId: string;
  instruction: string;
  url?: string;
  sessionId?: string;
  locale?: AppLocale;
};

type RunMeetingResearchOptions = {
  pollIntervalMs?: number;
  timeoutMs?: number;
};

export type OpenClawMeetingChatArgs = {
  agentId: string;
  phase?: RoundPhase;
  systemPrompt: string;
  message: string;
  history: ChatHistoryItem[];
  locale?: AppLocale;
  mode?: "meeting";
};

export type OpenClawMeetingChatResult = {
  text: string;
  provider?: string;
  model?: string;
  citations?: Array<{
    title?: string;
    url?: string;
  }>;
};

type RemoteTaskPayload = {
  id?: string;
  taskId?: string;
  task_id?: string;
  session?: string;
  sessionId?: string;
  session_id?: string;
  agent?: string;
  agentId?: string;
  agent_id?: string;
  instruction?: string;
  prompt?: string;
  url?: string;
  status?: string;
  state?: string;
  summary?: string;
  message?: string;
  locale?: string;
  logs?: Array<{ id?: string; ts?: string; timestamp?: string; level?: string; message?: string }>;
  screenshot?: string;
  image?: string;
  updatedAt?: string;
  updated_at?: string;
  artifacts?: {
    screenshot?: string;
    image?: string;
    notes?: string[];
  };
  notes?: string[];
};

type RemoteChatPayload = {
  text?: string;
  message?: string;
  content?: string;
  provider?: string;
  model?: string;
  citations?: Array<{
    title?: string;
    url?: string;
  }>;
};

type RemoteResponsesPayload = {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type RemoteChatCompletionsPayload = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type OpenClawRequestError = Error & {
  statusCode?: number;
};

const OPENCLAW_BASE_URL = process.env.OPENCLAW_BASE_URL?.replace(/\/$/, "") || "";
const OPENCLAW_CHAT_PATH = normalizePath(process.env.OPENCLAW_CHAT_PATH || "/chat");
const OPENCLAW_CHAT_COMPLETIONS_PATH = normalizePath(process.env.OPENCLAW_CHAT_COMPLETIONS_PATH || "/v1/chat/completions");
const OPENCLAW_RESPONSES_PATH = normalizePath(process.env.OPENCLAW_RESPONSES_PATH || "/v1/responses");
const OPENCLAW_TASKS_PATH = normalizePath(process.env.OPENCLAW_TASKS_PATH || "/tasks");
const OPENCLAW_MODEL = process.env.OPENCLAW_MODEL || process.env.OPENAI_MODEL || "openai-codex/gpt-5.3-codex";
const OPENCLAW_MAX_TOKENS = Number(process.env.OPENCLAW_MAX_TOKENS || 420);
const OPENCLAW_TASK_DETAIL_PATH = normalizePath(process.env.OPENCLAW_TASK_DETAIL_PATH || "/tasks/:id");
const OPENCLAW_TASK_ARTIFACTS_PATH = normalizePath(
  process.env.OPENCLAW_TASK_ARTIFACTS_PATH || "/tasks/:id/artifacts"
);
const OPENCLAW_API_KEY_HEADER = process.env.OPENCLAW_API_KEY_HEADER || "Authorization";
const OPENCLAW_API_KEY_PREFIX = process.env.OPENCLAW_API_KEY_PREFIX ?? "Bearer ";
const OPENCLAW_EXTRA_HEADERS = parseExtraHeaders(process.env.OPENCLAW_EXTRA_HEADERS_JSON);

const OPENCLAW_COPY = {
  ko: {
    title: "OpenClaw 브라우저 작업",
    agent: "에이전트",
    status: "상태",
    recentSummary: "최근 요약",
    noUrl: "명시된 URL이 없습니다.",
    defaultLog: "OpenClaw 로그",
    createdSummary: "OpenClaw 작업을 만들었습니다.",
    createdLog: "작업을 만들고 브라우저 컨텍스트를 준비하고 있습니다.",
    openingSummary: (agentName: string) => `${agentName}가 OpenClaw 브라우저 컨텍스트를 여는 중입니다.`,
    openingLog: (urlHint: string) => `브라우저 세션을 열었습니다. 대상: ${urlHint}`,
    collectingLog: "페이지 구조를 수집하고 회의용 메모를 정리하고 있습니다.",
    reviewingSummary: "OpenClaw가 페이지를 검토하고 결과를 정리하고 있습니다.",
    failLog: "브라우저 작업이 실패했습니다. 요청을 더 구체적으로 쓰거나 URL을 지정해 주세요.",
    failSummary: "OpenClaw가 작업을 완료하지 못했습니다. 요청을 더 구체적으로 쓰거나 URL을 지정해 주세요.",
    successLog: "작업이 완료되었습니다. 요약과 메모를 회의실에서 확인할 수 있습니다.",
    successSummary: "OpenClaw 조사가 완료되었습니다. 최신 브라우저 결과를 확인할 수 있습니다."
  },
  en: {
    title: "OpenClaw Browser Task",
    agent: "Agent",
    status: "Status",
    recentSummary: "Recent summary",
    noUrl: "No explicit URL requested.",
    defaultLog: "OpenClaw log",
    createdSummary: "OpenClaw task created.",
    createdLog: "Task created. Preparing the browser context.",
    openingSummary: (agentName: string) => `${agentName} is opening the OpenClaw browser context.`,
    openingLog: (urlHint: string) => `Browser session opened. Target: ${urlHint}`,
    collectingLog: "Collecting page structure and extracting meeting-ready notes.",
    reviewingSummary: "OpenClaw is reviewing the page and organizing the findings.",
    failLog: "The browser task failed. Check the instruction or provide a more specific URL.",
    failSummary: "OpenClaw could not complete the task. Refine the request or set a concrete URL.",
    successLog: "Task finished. The summary and notes are ready for the meeting room.",
    successSummary: "OpenClaw research finished. The latest browser findings are ready for review."
  }
} as const satisfies Record<
  AppLocale,
  {
    title: string;
    agent: string;
    status: string;
    recentSummary: string;
    noUrl: string;
    defaultLog: string;
    createdSummary: string;
    createdLog: string;
    openingSummary: (agentName: string) => string;
    openingLog: (urlHint: string) => string;
    collectingLog: string;
    reviewingSummary: string;
    failLog: string;
    failSummary: string;
    successLog: string;
    successSummary: string;
  }
>;
declare global {
  var __openclawMeetingTasks__: Map<string, MeetingTask> | undefined;
  var __openclawMeetingArtifacts__: Map<string, MeetingTaskArtifacts> | undefined;
}

function normalizePath(value: string) {
  if (!value) {
    return "/";
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function parseExtraHeaders(value: string | undefined) {
  if (!value) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
  } catch {
    return {} as Record<string, string>;
  }
}

function resolvePath(template: string, taskId: string) {
  return template.replace(":id", encodeURIComponent(taskId)).replace("{id}", encodeURIComponent(taskId));
}

function getStore() {
  if (!global.__openclawMeetingTasks__) {
    global.__openclawMeetingTasks__ = new Map<string, MeetingTask>();
  }
  return global.__openclawMeetingTasks__;
}

function getArtifactsStore() {
  if (!global.__openclawMeetingArtifacts__) {
    global.__openclawMeetingArtifacts__ = new Map<string, MeetingTaskArtifacts>();
  }
  return global.__openclawMeetingArtifacts__;
}

function toStatus(value: string | undefined): MeetingTaskStatus {
  if (value === "queued" || value === "running" || value === "succeeded" || value === "failed") {
    return value;
  }
  return "queued";
}

function normalizeLogs(logs?: RemoteTaskPayload["logs"], fallbackLogs?: MeetingTaskLog[], locale: AppLocale = DEFAULT_LOCALE) {
  const source = logs ?? fallbackLogs ?? [];
  return source.map((log): MeetingTaskLog => {
    let level: MeetingTaskLog["level"] = "info";
    if (log.level === "success" || log.level === "warning" || log.level === "error") {
      level = log.level;
    }

    const timestamp = "timestamp" in log ? log.timestamp : undefined;

    return {
      id: log.id || uid("log"),
      ts: log.ts || timestamp || new Date().toISOString(),
      level,
      message: log.message || OPENCLAW_COPY[locale].defaultLog
    };
  });
}

function normalizeTask(payload: RemoteTaskPayload, fallback?: Partial<MeetingTask>): MeetingTask {
  const locale = resolveAppLocale(payload.locale ?? fallback?.locale ?? DEFAULT_LOCALE);

  return {
    taskId: payload.taskId || payload.task_id || payload.id || fallback?.taskId || uid("task"),
    sessionId: payload.sessionId || payload.session_id || payload.session || fallback?.sessionId || uid("session"),
    agentId: payload.agentId || payload.agent_id || payload.agent || fallback?.agentId || "assistant",
    locale,
    instruction: payload.instruction || payload.prompt || fallback?.instruction || "",
    url: payload.url || fallback?.url,
    status: toStatus(payload.status || payload.state || fallback?.status),
    summary: payload.summary || payload.message || fallback?.summary || OPENCLAW_COPY[locale].createdSummary,
    logs: normalizeLogs(payload.logs, fallback?.logs, locale),
    screenshot:
      payload.screenshot ||
      payload.image ||
      payload.artifacts?.screenshot ||
      payload.artifacts?.image ||
      fallback?.screenshot,
    updatedAt: payload.updatedAt || payload.updated_at || fallback?.updatedAt || new Date().toISOString()
  };
}

function normalizeArtifacts(
  taskId: string,
  payload: {
    screenshot?: string;
    image?: string;
    notes?: string[];
    artifacts?: { screenshot?: string; image?: string; notes?: string[] };
  }
) {
  return {
    taskId,
    screenshot: payload.screenshot || payload.image || payload.artifacts?.screenshot || payload.artifacts?.image,
    notes: payload.notes || payload.artifacts?.notes || []
  } satisfies MeetingTaskArtifacts;
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildScreenshot(task: MeetingTask) {
  const locale = task.locale ?? DEFAULT_LOCALE;
  const copy = OPENCLAW_COPY[locale];
  const agentsById = getAgentsById(locale);
  const agentName = agentsById[task.agentId as keyof typeof agentsById]?.name || task.agentId;
  const accent =
    task.status === "failed"
      ? "#c45565"
      : task.status === "succeeded"
        ? "#18aa74"
        : task.status === "running"
          ? "#2c5bf5"
          : "#e2912c";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#0f1724" />
          <stop offset="100%" stop-color="#16243e" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" rx="38" fill="url(#bg)" />
      <rect x="40" y="40" width="1200" height="640" rx="30" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" />
      <rect x="80" y="88" width="420" height="28" rx="14" fill="${accent}" opacity="0.88" />
      <text x="80" y="170" fill="#fbf6ea" font-size="58" font-family="Arial, sans-serif">${escapeXml(copy.title)}</text>
      <text x="80" y="236" fill="rgba(255,255,255,0.75)" font-size="28" font-family="Arial, sans-serif">${escapeXml(copy.agent)}: ${escapeXml(agentName)}</text>
      <text x="80" y="286" fill="rgba(255,255,255,0.75)" font-size="28" font-family="Arial, sans-serif">${escapeXml(copy.status)}: ${escapeXml(task.status.toUpperCase())}</text>
      <text x="80" y="348" fill="#ffffff" font-size="42" font-family="Arial, sans-serif">${escapeXml(truncate(task.instruction, 48))}</text>
      <rect x="80" y="410" width="1120" height="210" rx="26" fill="rgba(255,255,255,0.08)" />
      <text x="112" y="470" fill="rgba(255,255,255,0.72)" font-size="24" font-family="Arial, sans-serif">${escapeXml(copy.recentSummary)}</text>
      <text x="112" y="528" fill="#ffffff" font-size="34" font-family="Arial, sans-serif">${escapeXml(truncate(task.summary, 70))}</text>
      <text x="112" y="590" fill="rgba(255,255,255,0.6)" font-size="24" font-family="Arial, sans-serif">${escapeXml(task.url || copy.noUrl)}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function appendLog(taskId: string, log: Omit<MeetingTaskLog, "id" | "ts">) {
  const task = getStore().get(taskId);
  if (!task) {
    return;
  }

  task.logs.push({
    id: uid("log"),
    ts: new Date().toISOString(),
    level: log.level,
    message: log.message
  });
  task.updatedAt = new Date().toISOString();
}

function updateTask(taskId: string, update: Partial<MeetingTask>) {
  const task = getStore().get(taskId);
  if (!task) {
    return;
  }

  Object.assign(task, update);
  task.updatedAt = new Date().toISOString();
  task.screenshot = buildScreenshot(task);

  const artifacts = getArtifactsStore().get(taskId);
  if (artifacts) {
    artifacts.screenshot = task.screenshot;
  }
}

function runMockLifecycle(taskId: string) {
  const task = getStore().get(taskId);
  if (!task) {
    return;
  }

  const locale = task.locale ?? DEFAULT_LOCALE;
  const copy = OPENCLAW_COPY[locale];
  const agentsById = getAgentsById(locale);
  const shouldFail = /(fail|error)/i.test(task.instruction);
  const urlHint = task.url || copy.noUrl;
  const agentName = agentsById[task.agentId as keyof typeof agentsById]?.name || task.agentId;

  setTimeout(() => {
    updateTask(taskId, {
      status: "running",
      summary: copy.openingSummary(agentName)
    });
    appendLog(taskId, { level: "info", message: copy.openingLog(urlHint) });
  }, 800);

  setTimeout(() => {
    appendLog(taskId, { level: "info", message: copy.collectingLog });
    updateTask(taskId, {
      status: "running",
      summary: copy.reviewingSummary
    });
  }, 1800);

  setTimeout(() => {
    if (shouldFail) {
      appendLog(taskId, {
        level: "error",
        message: copy.failLog
      });
      updateTask(taskId, {
        status: "failed",
        summary: copy.failSummary
      });
      return;
    }

    appendLog(taskId, {
      level: "success",
      message: copy.successLog
    });
    updateTask(taskId, {
      status: "succeeded",
      summary: copy.successSummary
    });
  }, 3400);
}

function buildGatewayResearchPrompt(task: MeetingTask) {
  const locale = task.locale ?? DEFAULT_LOCALE;
  const target = task.url
    ? locale === "ko"
      ? `먼저 이 URL을 직접 확인하세요: ${task.url}`
      : `Directly inspect this URL first: ${task.url}`
    : locale === "ko"
      ? "필요하면 검색이나 브라우저 확인을 사용해 관련 페이지를 직접 검토하세요."
      : "Use browser/search when needed to inspect relevant pages directly.";

  return locale === "ko"
    ? [
        "너는 OpenClaw 조사 에이전트다.",
        target,
        "요청을 실제로 확인한 사실만 바탕으로 정리해라.",
        "응답 형식:",
        "요약: 2문장 이내",
        "메모:",
        "- 사실 1",
        "- 사실 2",
        "- 사실 3",
        "확인되지 않은 내용은 추측하지 마라."
      ].join("\n")
    : [
        "You are an OpenClaw research agent.",
        target,
        "Verify the request directly and only report confirmed findings.",
        "Reply format:",
        "Summary: within 2 sentences",
        "Notes:",
        "- Fact 1",
        "- Fact 2",
        "- Fact 3",
        "Do not guess when something is unverified."
      ].join("\n");
}

function parseGatewayResearchResult(text: string, locale: AppLocale = DEFAULT_LOCALE) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const cleaned = lines
    .map((line) => line.replace(/^[-*•]+\s*/, "").trim())
    .filter(Boolean);

  const summaryLine = cleaned.find((line) => /^(요약|summary)\s*[:：]/i.test(line));
  const summary = summaryLine
    ? summaryLine.replace(/^(요약|summary)\s*[:：]\s*/i, "").trim()
    : cleaned.find((line) => !/^(메모|notes)\s*[:：]?/i.test(line)) ||
      (locale === "ko"
        ? "조사는 완료되었지만 요약 문장을 받지 못했습니다."
        : "Research completed, but no summary was returned.");

  const notes = cleaned
    .map((line) => line.replace(/^(메모|notes)\s*[:：]\s*/i, "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^(요약|summary)\s*[:：]?/i.test(line))
    .filter((line) => !/^(메모|notes)$/i.test(line))
    .filter((line) => line !== summary)
    .slice(0, 6);

  return {
    summary,
    notes: notes.length > 0 ? notes : [summary]
  };
}
async function runGatewayResearchLifecycle(taskId: string) {
  const task = getStore().get(taskId);
  if (!task) {
    return;
  }

  const locale = task.locale ?? DEFAULT_LOCALE;
  const copy = OPENCLAW_COPY[locale];
  const agentsById = getAgentsById(locale);
  const urlHint = task.url || copy.noUrl;
  const agentName = agentsById[task.agentId as keyof typeof agentsById]?.name || task.agentId;

  updateTask(taskId, {
    status: "running",
    summary: copy.openingSummary(agentName)
  });
  appendLog(taskId, { level: "info", message: copy.openingLog(urlHint) });
  appendLog(taskId, { level: "info", message: copy.collectingLog });
  updateTask(taskId, {
    status: "running",
    summary: copy.reviewingSummary
  });

  try {
    const result = await callOpenClawMeetingChat({
      agentId: task.agentId,
      phase: "analysis",
      systemPrompt: buildGatewayResearchPrompt(task),
      message: task.instruction,
      history: [],
      locale,
      mode: "meeting"
    });

    const parsed = parseGatewayResearchResult(result.text, locale);
    updateTask(taskId, {
      status: "succeeded",
      summary: parsed.summary
    });
    getArtifactsStore().set(taskId, {
      taskId,
      screenshot: getStore().get(taskId)?.screenshot,
      notes: parsed.notes
    });
    appendLog(taskId, { level: "success", message: copy.successLog });
  } catch (error) {
    const message = error instanceof Error ? error.message : copy.failLog;
    updateTask(taskId, {
      status: "failed",
      summary: copy.failSummary
    });
    getArtifactsStore().set(taskId, {
      taskId,
      screenshot: getStore().get(taskId)?.screenshot,
      notes: [message]
    });
    appendLog(taskId, { level: "error", message });
  }
}

function createOpenClawRequestError(statusCode: number, text: string) {
  const error = new Error(text ? `OpenClaw error ${statusCode}: ${text}` : `OpenClaw error ${statusCode}.`) as OpenClawRequestError;
  error.statusCode = statusCode;
  return error;
}

function shouldFallbackToResponses(error: unknown) {
  const statusCode = (error as OpenClawRequestError | undefined)?.statusCode;
  return statusCode === 404 || statusCode === 405 || statusCode === 501;
}

async function requestRemoteRaw(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);

  for (const [key, value] of Object.entries(OPENCLAW_EXTRA_HEADERS)) {
    headers.set(key, value);
  }

  if (process.env.OPENCLAW_API_KEY) {
    headers.set(OPENCLAW_API_KEY_HEADER, `${OPENCLAW_API_KEY_PREFIX}${process.env.OPENCLAW_API_KEY}`);
  }

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${OPENCLAW_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
}

async function requestRemote<T>(path: string, init?: RequestInit) {
  const response = await requestRemoteRaw(path, init);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw createOpenClawRequestError(response.status, text);
  }

  if (response.status === 204) {
    return {} as T;
  }

  const text = await response.text().catch(() => "");
  return (text ? JSON.parse(text) : {}) as T;
}

function asAssistantLine(item: ChatHistoryItem, locale: AppLocale = DEFAULT_LOCALE) {
  const agentsById = getAgentsById(locale);
  const agentName = item.agent ? agentsById[item.agent as keyof typeof agentsById]?.name : undefined;
  return agentName ? `${agentName}: ${item.content}` : item.content;
}

function normalizeChatResult(payload: RemoteChatPayload): OpenClawMeetingChatResult {
  const text = payload.text || payload.message || payload.content || "";
  if (!text.trim()) {
    throw new Error("OpenClaw chat returned an empty response.");
  }

  return {
    text: text.trim(),
    provider: payload.provider,
    model: payload.model,
    citations: payload.citations
  };
}

function extractResponsesOutputText(payload: RemoteResponsesPayload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  for (const item of payload.output ?? []) {
    if (item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    const text = item.content
      .filter((chunk) => chunk.type === "output_text" && typeof chunk.text === "string")
      .map((chunk) => chunk.text)
      .join("")
      .trim();

    if (text) {
      return text;
    }
  }

  return "";
}

function toResponsesInput(args: OpenClawMeetingChatArgs) {
  const locale = args.locale ?? DEFAULT_LOCALE;
  return [
    { role: "system", content: args.systemPrompt },
    ...args.history.map((item) =>
      item.role === "user"
        ? { role: "user", content: item.content }
        : { role: "assistant", content: asAssistantLine(item, locale) }
    ),
    { role: "user", content: args.message }
  ];
}

function normalizeResponsesResult(payload: RemoteResponsesPayload): OpenClawMeetingChatResult {
  const text = extractResponsesOutputText(payload);
  if (!text) {
    throw new Error("OpenClaw responses endpoint returned an empty response.");
  }

  return {
    text,
    provider: "openclaw",
    model: payload.model || OPENCLAW_MODEL
  };
}

function toChatCompletionsMessages(args: OpenClawMeetingChatArgs) {
  const locale = args.locale ?? DEFAULT_LOCALE;
  return [
    { role: "system", content: args.systemPrompt },
    ...args.history.map((item) =>
      item.role === "user"
        ? { role: "user", content: item.content }
        : { role: "assistant", content: asAssistantLine(item, locale) }
    ),
    { role: "user", content: args.message }
  ];
}

function normalizeChatCompletionsResult(payload: RemoteChatCompletionsPayload): OpenClawMeetingChatResult {
  const text = payload.choices?.[0]?.message?.content?.trim() || "";
  if (!text) {
    throw new Error("OpenClaw chat completions endpoint returned an empty response.");
  }

  return {
    text,
    provider: "openclaw",
    model: payload.model || OPENCLAW_MODEL
  };
}

export function isOpenClawRemoteConfigured() {
  return Boolean(OPENCLAW_BASE_URL);
}

export function isOpenClawChatConfigured() {
  return Boolean(OPENCLAW_BASE_URL);
}

export async function callOpenClawMeetingChat(args: OpenClawMeetingChatArgs): Promise<OpenClawMeetingChatResult> {
  if (!OPENCLAW_BASE_URL) {
    throw new Error("OPENCLAW_BASE_URL is not set.");
  }

  try {
    const payload = await requestRemote<RemoteChatPayload>(OPENCLAW_CHAT_PATH, {
      method: "POST",
      body: JSON.stringify({
        agentId: args.agentId,
        phase: args.phase,
        systemPrompt: args.systemPrompt,
        message: args.message,
        history: args.history,
        locale: args.locale ?? DEFAULT_LOCALE,
        mode: args.mode || "meeting"
      })
    });

    return normalizeChatResult(payload);
  } catch (error) {
    if (!shouldFallbackToResponses(error)) {
      throw error;
    }
  }

  try {
    const payload = await requestRemote<RemoteChatCompletionsPayload>(OPENCLAW_CHAT_COMPLETIONS_PATH, {
      method: "POST",
      body: JSON.stringify({
        model: OPENCLAW_MODEL,
        messages: toChatCompletionsMessages(args),
        temperature: 0.4,
        max_tokens: OPENCLAW_MAX_TOKENS
      })
    });

    return normalizeChatCompletionsResult(payload);
  } catch (error) {
    if (!shouldFallbackToResponses(error)) {
      throw error;
    }
  }

  const payload = await requestRemote<RemoteResponsesPayload>(OPENCLAW_RESPONSES_PATH, {
    method: "POST",
    body: JSON.stringify({
      model: OPENCLAW_MODEL,
      input: toResponsesInput(args),
      temperature: 0.4,
      max_output_tokens: OPENCLAW_MAX_TOKENS
    })
  });

  return normalizeResponsesResult(payload);
}

export async function startMeetingTask(args: StartMeetingTaskArgs): Promise<MeetingTask> {
  const locale = args.locale ?? DEFAULT_LOCALE;
  const copy = OPENCLAW_COPY[locale];

  if (OPENCLAW_BASE_URL) {
    try {
      const payload = await requestRemote<RemoteTaskPayload>(OPENCLAW_TASKS_PATH, {
        method: "POST",
        body: JSON.stringify({ ...args, locale })
      });
      return normalizeTask(payload, {
        agentId: args.agentId,
        instruction: args.instruction,
        url: args.url,
        sessionId: args.sessionId,
        locale
      });
    } catch (error) {
      if (!shouldFallbackToResponses(error)) {
        throw error;
      }
    }
  }

  const task: MeetingTask = {
    taskId: uid("task"),
    sessionId: args.sessionId || uid("session"),
    agentId: args.agentId,
    locale,
    instruction: args.instruction,
    url: args.url,
    status: "queued",
    summary: copy.createdSummary,
    logs: [
      {
        id: uid("log"),
        ts: new Date().toISOString(),
        level: "info",
        message: copy.createdLog
      }
    ],
    updatedAt: new Date().toISOString()
  };

  task.screenshot = buildScreenshot(task);
  getStore().set(task.taskId, task);
  getArtifactsStore().set(task.taskId, {
    taskId: task.taskId,
    screenshot: task.screenshot,
    notes: task.logs.map((log) => log.message)
  });

  if (OPENCLAW_BASE_URL) {
    void runGatewayResearchLifecycle(task.taskId);
  } else {
    runMockLifecycle(task.taskId);
  }

  return structuredClone(task);
}

export async function getMeetingTask(taskId: string): Promise<MeetingTask | undefined> {
  const localTask = getStore().get(taskId);
  if (localTask) {
    return structuredClone(localTask);
  }

  if (OPENCLAW_BASE_URL) {
    const payload = await requestRemote<RemoteTaskPayload>(resolvePath(OPENCLAW_TASK_DETAIL_PATH, taskId));
    return normalizeTask(payload, {
      taskId
    });
  }

  return undefined;
}

export async function getMeetingTaskArtifacts(taskId: string): Promise<MeetingTaskArtifacts | undefined> {
  const task = getStore().get(taskId);
  if (task) {
    const artifacts = getArtifactsStore().get(taskId);
    return artifacts
      ? structuredClone({
          ...artifacts,
          screenshot: artifacts.screenshot || task.screenshot
        })
      : {
          taskId: task.taskId,
          screenshot: task.screenshot,
          notes: task.logs.map((log) => log.message)
        };
  }

  if (OPENCLAW_BASE_URL) {
    const payload = await requestRemote<{
      screenshot?: string;
      image?: string;
      notes?: string[];
      artifacts?: { screenshot?: string; image?: string; notes?: string[] };
    }>(resolvePath(OPENCLAW_TASK_ARTIFACTS_PATH, taskId));
    return normalizeArtifacts(taskId, payload);
  }

  return undefined;
}

export async function runMeetingResearchTask(
  args: StartMeetingTaskArgs,
  options: RunMeetingResearchOptions = {}
): Promise<{ task: MeetingTask; artifacts: MeetingTaskArtifacts }> {
  const locale = args.locale ?? DEFAULT_LOCALE;
  const copy = OPENCLAW_COPY[locale];
  const pollIntervalMs = options.pollIntervalMs ?? 900;
  const timeoutMs = options.timeoutMs ?? 20_000;

  const startedTask = await startMeetingTask(args);
  let latestTask = startedTask;
  const startedAt = Date.now();

  while (latestTask.status === "queued" || latestTask.status === "running") {
    if (Date.now() - startedAt >= timeoutMs) {
      latestTask = {
        ...latestTask,
        status: "failed",
        summary: copy.failSummary,
        logs: [
          ...latestTask.logs,
          {
            id: uid("log"),
            ts: new Date().toISOString(),
            level: "warning",
            message: copy.failLog
          }
        ],
        updatedAt: new Date().toISOString()
      };
      break;
    }

    await sleep(pollIntervalMs);
    const nextTask = await getMeetingTask(startedTask.taskId);
    if (!nextTask) {
      latestTask = {
        ...latestTask,
        status: "failed",
        summary: copy.failSummary,
        updatedAt: new Date().toISOString()
      };
      break;
    }
    latestTask = nextTask;
  }

  const artifacts =
    (await getMeetingTaskArtifacts(startedTask.taskId)) ?? {
      taskId: latestTask.taskId,
      screenshot: latestTask.screenshot,
      notes: latestTask.logs.map((log) => log.message)
    };

  return {
    task: latestTask,
    artifacts
  };
}
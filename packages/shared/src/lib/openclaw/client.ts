import { AGENTS_BY_ID } from "@/lib/meeting/agents";
import type { MeetingTask, MeetingTaskArtifacts, MeetingTaskLog, MeetingTaskStatus } from "@/lib/meeting/types";
import { uid } from "@/lib/utils";

type StartMeetingTaskArgs = {
  agentId: string;
  instruction: string;
  url?: string;
  sessionId?: string;
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

const OPENCLAW_BASE_URL = process.env.OPENCLAW_BASE_URL?.replace(/\/$/, "") || "";
const OPENCLAW_TASKS_PATH = normalizePath(process.env.OPENCLAW_TASKS_PATH || "/tasks");
const OPENCLAW_TASK_DETAIL_PATH = normalizePath(process.env.OPENCLAW_TASK_DETAIL_PATH || "/tasks/:id");
const OPENCLAW_TASK_ARTIFACTS_PATH = normalizePath(
  process.env.OPENCLAW_TASK_ARTIFACTS_PATH || "/tasks/:id/artifacts"
);
const OPENCLAW_API_KEY_HEADER = process.env.OPENCLAW_API_KEY_HEADER || "Authorization";
const OPENCLAW_API_KEY_PREFIX = process.env.OPENCLAW_API_KEY_PREFIX ?? "Bearer ";
const OPENCLAW_EXTRA_HEADERS = parseExtraHeaders(process.env.OPENCLAW_EXTRA_HEADERS_JSON);

declare global {
  var __openclawMeetingTasks__: Map<string, MeetingTask> | undefined;
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

function toStatus(value: string | undefined): MeetingTaskStatus {
  if (value === "queued" || value === "running" || value === "succeeded" || value === "failed") {
    return value;
  }
  return "queued";
}

function normalizeLogs(logs?: RemoteTaskPayload["logs"], fallbackLogs?: MeetingTaskLog[]) {
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
      message: log.message || "OpenClaw log"
    };
  });
}

function normalizeTask(payload: RemoteTaskPayload, fallback?: Partial<MeetingTask>): MeetingTask {
  return {
    taskId: payload.taskId || payload.task_id || payload.id || fallback?.taskId || uid("task"),
    sessionId: payload.sessionId || payload.session_id || payload.session || fallback?.sessionId || uid("session"),
    agentId: payload.agentId || payload.agent_id || payload.agent || fallback?.agentId || "assistant",
    instruction: payload.instruction || payload.prompt || fallback?.instruction || "",
    url: payload.url || fallback?.url,
    status: toStatus(payload.status || payload.state || fallback?.status),
    summary: payload.summary || payload.message || fallback?.summary || "OpenClaw task is being processed.",
    logs: normalizeLogs(payload.logs, fallback?.logs),
    screenshot:
      payload.screenshot ||
      payload.image ||
      payload.artifacts?.screenshot ||
      payload.artifacts?.image ||
      fallback?.screenshot,
    updatedAt: payload.updatedAt || payload.updated_at || fallback?.updatedAt || new Date().toISOString()
  };
}

function normalizeArtifacts(taskId: string, payload: { screenshot?: string; image?: string; notes?: string[]; artifacts?: { screenshot?: string; image?: string; notes?: string[] } }) {
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

function buildScreenshot(task: MeetingTask) {
  const agentName = AGENTS_BY_ID[task.agentId]?.name || task.agentId;
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
      <text x="80" y="170" fill="#fbf6ea" font-size="58" font-family="Arial, sans-serif">OpenClaw Browser Task</text>
      <text x="80" y="236" fill="rgba(255,255,255,0.75)" font-size="28" font-family="Arial, sans-serif">Agent: ${escapeXml(agentName)}</text>
      <text x="80" y="286" fill="rgba(255,255,255,0.75)" font-size="28" font-family="Arial, sans-serif">Status: ${escapeXml(task.status.toUpperCase())}</text>
      <text x="80" y="348" fill="#ffffff" font-size="42" font-family="Arial, sans-serif">${escapeXml(truncate(task.instruction, 48))}</text>
      <rect x="80" y="410" width="1120" height="210" rx="26" fill="rgba(255,255,255,0.08)" />
      <text x="112" y="470" fill="rgba(255,255,255,0.72)" font-size="24" font-family="Arial, sans-serif">Recent summary</text>
      <text x="112" y="528" fill="#ffffff" font-size="34" font-family="Arial, sans-serif">${escapeXml(truncate(task.summary, 70))}</text>
      <text x="112" y="590" fill="rgba(255,255,255,0.6)" font-size="24" font-family="Arial, sans-serif">${escapeXml(task.url || "No explicit URL requested")}</text>
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
}

function runMockLifecycle(taskId: string) {
  const task = getStore().get(taskId);
  if (!task) {
    return;
  }

  const shouldFail = /(fail|error)/i.test(task.instruction);
  const urlHint = task.url || "No explicit URL requested.";

  setTimeout(() => {
    updateTask(taskId, {
      status: "running",
      summary: `${AGENTS_BY_ID[task.agentId]?.name || "Agent"} is opening the OpenClaw browser context.`
    });
    appendLog(taskId, { level: "info", message: `Browser session opened. Target: ${urlHint}` });
  }, 800);

  setTimeout(() => {
    appendLog(taskId, { level: "info", message: "Collecting page structure and extracting meeting-ready notes." });
    updateTask(taskId, {
      status: "running",
      summary: "OpenClaw is reviewing the page and organizing the findings."
    });
  }, 1800);

  setTimeout(() => {
    if (shouldFail) {
      appendLog(taskId, {
        level: "error",
        message: "The browser task failed. Check the instruction or provide a more specific URL."
      });
      updateTask(taskId, {
        status: "failed",
        summary: "OpenClaw could not complete the task. Refine the request or set a concrete URL."
      });
      return;
    }

    appendLog(taskId, {
      level: "success",
      message: "Task finished. The summary and notes are ready for the meeting room."
    });
    updateTask(taskId, {
      status: "succeeded",
      summary: "OpenClaw research finished. The latest browser findings are ready for review."
    });
  }, 3400);
}

async function requestRemote<T>(path: string, init?: RequestInit) {
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

  const response = await fetch(`${OPENCLAW_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenClaw error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export async function startMeetingTask(args: StartMeetingTaskArgs): Promise<MeetingTask> {
  if (OPENCLAW_BASE_URL) {
    const payload = await requestRemote<RemoteTaskPayload>(OPENCLAW_TASKS_PATH, {
      method: "POST",
      body: JSON.stringify(args)
    });
    return normalizeTask(payload, {
      agentId: args.agentId,
      instruction: args.instruction,
      url: args.url,
      sessionId: args.sessionId
    });
  }

  const task: MeetingTask = {
    taskId: uid("task"),
    sessionId: args.sessionId || uid("session"),
    agentId: args.agentId,
    instruction: args.instruction,
    url: args.url,
    status: "queued",
    summary: "OpenClaw task created.",
    logs: [
      {
        id: uid("log"),
        ts: new Date().toISOString(),
        level: "info",
        message: "Task created. Preparing the browser context."
      }
    ],
    updatedAt: new Date().toISOString()
  };

  task.screenshot = buildScreenshot(task);
  getStore().set(task.taskId, task);
  runMockLifecycle(task.taskId);
  return structuredClone(task);
}

export async function getMeetingTask(taskId: string): Promise<MeetingTask | undefined> {
  if (OPENCLAW_BASE_URL) {
    const payload = await requestRemote<RemoteTaskPayload>(resolvePath(OPENCLAW_TASK_DETAIL_PATH, taskId));
    return normalizeTask(payload, {
      taskId
    });
  }

  const task = getStore().get(taskId);
  return task ? structuredClone(task) : undefined;
}

export async function getMeetingTaskArtifacts(taskId: string): Promise<MeetingTaskArtifacts | undefined> {
  if (OPENCLAW_BASE_URL) {
    const payload = await requestRemote<{
      screenshot?: string;
      image?: string;
      notes?: string[];
      artifacts?: { screenshot?: string; image?: string; notes?: string[] };
    }>(resolvePath(OPENCLAW_TASK_ARTIFACTS_PATH, taskId));
    return normalizeArtifacts(taskId, payload);
  }

  const task = getStore().get(taskId);
  if (!task) {
    return undefined;
  }

  return {
    taskId: task.taskId,
    screenshot: task.screenshot,
    notes: task.logs.map((log) => log.message)
  };
}

import type { OpenClawConnectionProbe } from "@/lib/meeting/types";

const OPENCLAW_BASE_URL = process.env.OPENCLAW_BASE_URL?.replace(/\/$/, "") || "";
const OPENCLAW_CHAT_PATH = normalizePath(process.env.OPENCLAW_CHAT_PATH || "/chat");
const OPENCLAW_CHAT_COMPLETIONS_PATH = normalizePath(process.env.OPENCLAW_CHAT_COMPLETIONS_PATH || "/v1/chat/completions");
const OPENCLAW_RESPONSES_PATH = normalizePath(process.env.OPENCLAW_RESPONSES_PATH || "/v1/responses");
const OPENCLAW_MODEL = process.env.OPENCLAW_MODEL || process.env.OPENAI_MODEL || "openai-codex/gpt-5.3-codex";
const OPENCLAW_TASKS_PATH = normalizePath(process.env.OPENCLAW_TASKS_PATH || "/tasks");
const OPENCLAW_API_KEY_HEADER = process.env.OPENCLAW_API_KEY_HEADER || "Authorization";
const OPENCLAW_API_KEY_PREFIX = process.env.OPENCLAW_API_KEY_PREFIX ?? "Bearer ";
const OPENCLAW_EXTRA_HEADERS = parseExtraHeaders(process.env.OPENCLAW_EXTRA_HEADERS_JSON);

function normalizePath(value: string) {
  if (!value) return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

function parseExtraHeaders(value: string | undefined) {
  if (!value) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {} as Record<string, string>;
  }
}

function buildHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(OPENCLAW_EXTRA_HEADERS)) headers.set(key, value);
  if (process.env.OPENCLAW_API_KEY) headers.set(OPENCLAW_API_KEY_HEADER, `${OPENCLAW_API_KEY_PREFIX}${process.env.OPENCLAW_API_KEY}`);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return headers;
}

async function requestRaw(path: string, init?: RequestInit) {
  return fetch(`${OPENCLAW_BASE_URL}${path}`, {
    ...init,
    headers: buildHeaders(init),
    cache: "no-store"
  });
}

async function testCustomChat() {
  const response = await requestRaw(OPENCLAW_CHAT_PATH, {
    method: "POST",
    body: JSON.stringify({
      agentId: "assistant",
      phase: "discussion",
      systemPrompt: "Connection probe. Reply with one short sentence.",
      message: "Ping",
      history: [],
      locale: "en",
      mode: "meeting"
    })
  });
  if (!response.ok) return { ok: false, statusCode: response.status, body: await response.text().catch(() => "") };
  const payload = (await response.json()) as { text?: string; message?: string; content?: string };
  const text = payload.text || payload.message || payload.content || "";
  return { ok: Boolean(text.trim()), statusCode: response.status, body: text };
}

async function testChatCompletions() {
  const response = await requestRaw(OPENCLAW_CHAT_COMPLETIONS_PATH, {
    method: "POST",
    body: JSON.stringify({
      model: OPENCLAW_MODEL,
      messages: [
        { role: "system", content: "Reply with one short sentence." },
        { role: "user", content: "Ping" }
      ],
      max_tokens: 64
    })
  });
  if (!response.ok) return { ok: false, statusCode: response.status, body: await response.text().catch(() => "") };
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = payload.choices?.[0]?.message?.content?.trim() || "";
  return { ok: Boolean(text), statusCode: response.status, body: text };
}

async function testResponsesApi() {
  const response = await requestRaw(OPENCLAW_RESPONSES_PATH, {
    method: "POST",
    body: JSON.stringify({
      model: OPENCLAW_MODEL,
      input: [{ role: "user", content: "Ping" }],
      max_output_tokens: 64
    })
  });
  if (!response.ok) return { ok: false, statusCode: response.status, body: await response.text().catch(() => "") };
  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };
  const direct = payload.output_text?.trim();
  if (direct) return { ok: true, statusCode: response.status, body: direct };
  const nested = (payload.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text" && typeof item.text === "string").map((item) => item.text?.trim() ?? "").join("").trim();
  return { ok: Boolean(nested), statusCode: response.status, body: nested };
}

export async function probeOpenClawConnection(): Promise<OpenClawConnectionProbe> {
  const checkedAt = new Date().toISOString();

  if (!OPENCLAW_BASE_URL) {
    return {
      configured: false,
      reachable: false,
      status: "unconfigured",
      checkedAt,
      baseUrl: "",
      chatPath: OPENCLAW_CHAT_PATH,
      tasksPath: OPENCLAW_TASKS_PATH,
      message: "OPENCLAW_BASE_URL is not set."
    };
  }

  try {
    const customChat = await testCustomChat();
    if (customChat.ok) {
      return { configured: true, reachable: true, status: "reachable", checkedAt, baseUrl: OPENCLAW_BASE_URL, chatPath: OPENCLAW_CHAT_PATH, tasksPath: OPENCLAW_TASKS_PATH, message: "OpenClaw custom chat endpoint responded successfully.", statusCode: customChat.statusCode };
    }
    if (![404, 405, 501].includes(customChat.statusCode ?? 0)) {
      return { configured: true, reachable: false, status: "unreachable", checkedAt, baseUrl: OPENCLAW_BASE_URL, chatPath: OPENCLAW_CHAT_PATH, tasksPath: OPENCLAW_TASKS_PATH, message: customChat.body ? `OpenClaw returned ${customChat.statusCode}: ${customChat.body}` : `OpenClaw returned ${customChat.statusCode}.`, statusCode: customChat.statusCode };
    }
  } catch {
    // Continue.
  }

  try {
    const chatCompletions = await testChatCompletions();
    if (chatCompletions.ok) {
      return { configured: true, reachable: true, status: "reachable", checkedAt, baseUrl: OPENCLAW_BASE_URL, chatPath: OPENCLAW_CHAT_COMPLETIONS_PATH, tasksPath: OPENCLAW_TASKS_PATH, message: "OpenClaw Chat Completions endpoint responded successfully.", statusCode: chatCompletions.statusCode };
    }
    if (![404, 405, 501].includes(chatCompletions.statusCode ?? 0)) {
      return { configured: true, reachable: false, status: "unreachable", checkedAt, baseUrl: OPENCLAW_BASE_URL, chatPath: OPENCLAW_CHAT_COMPLETIONS_PATH, tasksPath: OPENCLAW_TASKS_PATH, message: chatCompletions.body ? `OpenClaw returned ${chatCompletions.statusCode}: ${chatCompletions.body}` : `OpenClaw returned ${chatCompletions.statusCode}.`, statusCode: chatCompletions.statusCode };
    }
  } catch {
    // Continue.
  }

  try {
    const responses = await testResponsesApi();
    if (responses.ok) {
      return { configured: true, reachable: true, status: "reachable", checkedAt, baseUrl: OPENCLAW_BASE_URL, chatPath: OPENCLAW_RESPONSES_PATH, tasksPath: OPENCLAW_TASKS_PATH, message: "OpenClaw Responses API responded successfully.", statusCode: responses.statusCode };
    }
    return { configured: true, reachable: false, status: "unreachable", checkedAt, baseUrl: OPENCLAW_BASE_URL, chatPath: OPENCLAW_RESPONSES_PATH, tasksPath: OPENCLAW_TASKS_PATH, message: responses.body ? `OpenClaw returned ${responses.statusCode}: ${responses.body}` : `OpenClaw returned ${responses.statusCode}.`, statusCode: responses.statusCode };
  } catch (error) {
    return { configured: true, reachable: false, status: "unreachable", checkedAt, baseUrl: OPENCLAW_BASE_URL, chatPath: OPENCLAW_RESPONSES_PATH, tasksPath: OPENCLAW_TASKS_PATH, message: error instanceof Error ? error.message : "OpenClaw connection test failed.", statusCode: undefined };
  }
}
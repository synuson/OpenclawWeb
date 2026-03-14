import { NextResponse } from "next/server";
import { resolveAppLocale, type AppLocale } from "@/lib/i18n/config";
import { startMeetingTask } from "@/lib/openclaw/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      agentId?: string;
      instruction?: string;
      url?: string;
      sessionId?: string;
      locale?: AppLocale;
    };

    if (!body.agentId || !body.instruction) {
      return NextResponse.json({ error: "agentId and instruction are required" }, { status: 400 });
    }

    const task = await startMeetingTask({
      agentId: body.agentId,
      instruction: body.instruction,
      url: body.url,
      sessionId: body.sessionId,
      locale: resolveAppLocale(body.locale)
    });

    return NextResponse.json(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

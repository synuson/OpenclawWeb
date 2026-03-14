import { NextResponse } from "next/server";
import { resolveAppLocale } from "@/lib/i18n/config";
import { runMeetingRound } from "@/lib/meeting/orchestrator";
import type { MeetingRoundRequest } from "@/lib/meeting/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MeetingRoundRequest;

    if (!body?.message || typeof body.message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    return NextResponse.json(
      await runMeetingRound({
        message: body.message,
        history: Array.isArray(body.history) ? body.history : [],
        activeTab: body.activeTab || "btc",
        marketSnapshot: body.marketSnapshot ?? null,
        portfolioSnapshot: body.portfolioSnapshot ?? null,
        minutes: body.minutes ?? null,
        locale: resolveAppLocale(body.locale),
        personaOverrides: body.personaOverrides
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

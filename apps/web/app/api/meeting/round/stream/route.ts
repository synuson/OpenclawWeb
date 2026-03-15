import { resolveAppLocale } from "@/lib/i18n/config";
import { runMeetingRound } from "@/lib/meeting/orchestrator";
import type { MeetingRoundRequest, MeetingRoundStreamEvent } from "@/lib/meeting/types";

export const runtime = "nodejs";

function normalizeMeetingRoundRequest(body: MeetingRoundRequest): MeetingRoundRequest {
  return {
    message: body.message,
    history: Array.isArray(body.history) ? body.history : [],
    activeTab: body.activeTab || "btc",
    marketSnapshot: body.marketSnapshot ?? null,
    portfolioSnapshot: body.portfolioSnapshot ?? null,
    minutes: body.minutes ?? null,
    locale: resolveAppLocale(body.locale),
    personaOverrides: body.personaOverrides,
    responseMode: body.responseMode,
    speedMode: body.speedMode
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MeetingRoundRequest;

    if (!body?.message || typeof body.message !== "string") {
      return Response.json({ error: "message is required" }, { status: 400 });
    }

    const payload = normalizeMeetingRoundRequest(body);
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    const writeEvent = async (event: MeetingRoundStreamEvent) => {
      await writer.write(encoder.encode(`${JSON.stringify(event)}\n`));
    };

    void (async () => {
      try {
        const response = await runMeetingRound(payload, {
          onEvent: writeEvent
        });

        await writeEvent({
          type: "final",
          ts: new Date().toISOString(),
          response
        });
      } catch (error) {
        await writeEvent({
          type: "error",
          ts: new Date().toISOString(),
          message: error instanceof Error ? error.message : "unknown error"
        });
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
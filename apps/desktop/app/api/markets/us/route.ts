import { NextResponse } from "next/server";
import { getUsMarketSnapshot } from "@/lib/markets/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbols = (searchParams.get("symbols") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    return NextResponse.json(await getUsMarketSnapshot(symbols));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

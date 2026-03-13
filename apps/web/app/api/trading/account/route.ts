import { NextResponse } from "next/server";
import { getTradingAccount } from "@/lib/trading/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getTradingAccount());
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { probeOpenClawConnection } from "@/lib/system/openclaw-probe";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(await probeOpenClawConnection());
}
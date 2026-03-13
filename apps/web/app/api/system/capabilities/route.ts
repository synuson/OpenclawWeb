import { NextResponse } from "next/server";
import { getCapabilities } from "@/lib/system/capabilities";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getCapabilities());
}

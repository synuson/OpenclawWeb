import { NextResponse } from "next/server";
import { getMeetingTask } from "@/lib/openclaw/client";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const task = await getMeetingTask(params.id);
    if (!task) {
      return NextResponse.json({ error: "task not found" }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

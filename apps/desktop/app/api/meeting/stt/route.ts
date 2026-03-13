import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const model = typeof form.get("model") === "string" ? (form.get("model") as string) : "gpt-4o-mini-transcribe";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required (multipart/form-data)" }, { status: 400 });
  }

  const out = new FormData();
  out.append("file", file, file.name || "audio.webm");
  out.append("model", model);
  out.append("language", "ko");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: out
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return NextResponse.json({ error: `OpenAI STT error ${response.status}: ${text}` }, { status: 500 });
  }

  const data = (await response.json()) as {
    text?: string;
  };

  return NextResponse.json({ text: data.text?.toString() || "" });
}

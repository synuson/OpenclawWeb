import { NextResponse } from "next/server";
import { AGENTS_BY_ID, DEFAULT_AGENT_ID, detectMentionedAgentId } from "@/lib/meeting/agents";
import { callLLM, detectBrowserActions, getAgentContext, isoNow, pickProvider } from "@/lib/meeting/provider";
import type { MeetingChatRequest, MeetingChatResponse } from "@/lib/meeting/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MeetingChatRequest;

    if (!body?.message || typeof body.message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const participants = Array.isArray(body.participants) ? body.participants : [];
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

    let chosenId =
      body.agentId?.trim() ||
      detectMentionedAgentId(body.message) ||
      participants[participants.length - 1] ||
      DEFAULT_AGENT_ID;

    if (participants.length > 0 && !participants.includes(chosenId)) {
      chosenId = participants[participants.length - 1] || DEFAULT_AGENT_ID;
    }

    const agent = AGENTS_BY_ID[chosenId] ?? AGENTS_BY_ID[DEFAULT_AGENT_ID];
    const provider = pickProvider();
    const actions = detectBrowserActions(body.message);
    const extraContext = await getAgentContext(agent.id);
    const systemPrompt = [
      agent.systemPrompt,
      "[미팅 규칙]",
      "- 반드시 한국어로 답하세요.",
      "- 결론이나 권고가 있다면 섹션 제목을 유지한 채 명확한 문장으로 쓰세요.",
      "- 웹 조사 의도가 보이면 OpenClaw 후속 조사를 짧게 제안해도 됩니다.",
      "- 실제 다자 음성 통화가 아니라 회의 UI 안에서 논의 중이라는 전제를 유지하세요.",
      "[추가 컨텍스트]",
      extraContext
    ].join("\n\n");

    let reply = await callLLM(provider, {
      agentSystemPrompt: systemPrompt,
      message: body.message,
      history
    });

    if (actions.length > 0 && !/(웹 조사|브라우저|확인|OpenClaw)/.test(reply)) {
      reply = `${reply}\n\n추가 웹 조사가 필요하면 OpenClaw 후속 조사를 실행할 수 있습니다.`;
    }

    const response: MeetingChatResponse = {
      agentId: agent.id,
      message: reply,
      timestamp: isoNow(),
      provider,
      actions
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
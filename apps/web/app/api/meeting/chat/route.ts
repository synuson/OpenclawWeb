import { NextResponse } from "next/server";
import { resolveAppLocale } from "@/lib/i18n/config";
import { DEFAULT_AGENT_ID, detectMentionedAgentId, getAgentsById } from "@/lib/meeting/agents";
import { getRoleDefinitionForAgent } from "@/lib/meeting/role-definitions";
import { callLLM, detectBrowserActions, getAgentContext, isoNow, pickProvider } from "@/lib/meeting/provider";
import type { MeetingChatRequest, MeetingChatResponse } from "@/lib/meeting/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MeetingChatRequest;

    if (!body?.message || typeof body.message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const locale = resolveAppLocale(body.locale);
    const agentsById = getAgentsById(locale);
    const participants = Array.isArray(body.participants) ? body.participants : [];
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

    let chosenId =
      body.agentId?.trim() ||
      detectMentionedAgentId(body.message, locale) ||
      participants[participants.length - 1] ||
      DEFAULT_AGENT_ID;

    if (participants.length > 0 && !participants.includes(chosenId)) {
      chosenId = participants[participants.length - 1] || DEFAULT_AGENT_ID;
    }

    const normalizedAgentId = chosenId === "analyst" ? "analyst" : DEFAULT_AGENT_ID;
    const agent = agentsById[normalizedAgentId];
    const preferredProvider = pickProvider();
    const extraContext = await getAgentContext(agent.id, locale);
    const sections = getRoleDefinitionForAgent(agent.id, locale).outputFormat.sections;
    const systemPrompt = [
      agent.systemPrompt,
      locale === "ko" ? "[미팅 규칙]" : "[Meeting Rules]",
      locale === "ko" ? "- 반드시 한국어로 답하세요." : "- Answer in English.",
      locale === "ko"
        ? "- 역할 정의에 있는 섹션 제목을 정확히 유지하세요."
        : "- Keep the exact section headings required by the role definition.",
      locale === "ko"
        ? "- 웹 검증이 필요하면 OpenClaw 후속 조사를 짧게 제안할 수 있습니다."
        : "- You may suggest an OpenClaw follow-up when web verification is needed.",
      locale === "ko"
        ? "- 실제 음성 통화가 아니라 회의 UI 안에서 대화 중이라는 전제를 유지하세요."
        : "- Keep the frame that this is a discussion inside a meeting UI, not a real voice call.",
      locale === "ko" ? "[추가 컨텍스트]" : "[Extra Context]",
      extraContext
    ].join("\n\n");

    const result = await callLLM(preferredProvider, {
      agentId: agent.id,
      phase: body.phase,
      agentSystemPrompt: systemPrompt,
      message: body.message,
      history,
      locale,
      requiredSections: sections
    });

    const actions = result.provider === "openclaw" ? [] : detectBrowserActions(body.message);
    let reply = result.text;

    if (actions.length > 0 && !/(web|research|browser|OpenClaw|웹 조사|브라우저|확인)/i.test(reply)) {
      reply = `${reply}\n\n${
        locale === "ko"
          ? "추가 웹 조사가 필요하면 OpenClaw 후속 조사를 실행할 수 있습니다."
          : "Run an OpenClaw follow-up if additional web research is needed."
      }`;
    }

    const response: MeetingChatResponse = {
      agentId: agent.id,
      message: reply,
      timestamp: isoNow(),
      provider: result.provider,
      phase: body.phase,
      actions
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
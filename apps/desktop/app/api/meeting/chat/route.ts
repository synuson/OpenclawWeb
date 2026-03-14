import { NextResponse } from "next/server";
import { AGENTS_BY_ID, DEFAULT_AGENT_ID, detectMentionedAgentId } from "@/lib/meeting/agents";
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
    const preferredProvider = pickProvider();
    const extraContext = await getAgentContext(agent.id);
    const sections = getRoleDefinitionForAgent(agent.id).outputFormat.sections;
    const systemPrompt = [
      agent.systemPrompt,
      "[Meeting rules]",
      "- Respond in Korean.",
      "- Keep the exact section headings when the role definition requires them.",
      "- You may suggest a follow-up OpenClaw research task when web verification is needed.",
      "- Stay inside the meeting-room UI context instead of pretending to be in a live call.",
      "[Extra context]",
      extraContext
    ].join("\n\n");

    const result = await callLLM(preferredProvider, {
      agentId: agent.id,
      phase: body.phase,
      agentSystemPrompt: systemPrompt,
      message: body.message,
      history,
      requiredSections: sections
    });

    const actions = result.provider === "openclaw" ? [] : detectBrowserActions(body.message);
    let reply = result.text;

    if (actions.length > 0 && !/(OpenClaw|research|browse|web)/i.test(reply)) {
      reply = `${reply}\n\n\ucd94\uac00 \uc6f9 \uc870\uc0ac\uac00 \ud544\uc694\ud558\uba74 OpenClaw \uc870\uc0ac \ud328\ub110\uc5d0\uc11c \ud6c4\uc18d \ud655\uc778\uc744 \uc9c4\ud589\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.`;
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

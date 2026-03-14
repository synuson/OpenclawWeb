import { DEFAULT_LOCALE, type AppLocale } from "@/lib/i18n/config";
import type { AgentId } from "@/lib/meeting/types";

export type FacilitatorActionItemStatus = "todo" | "doing" | "done";

export type FacilitatorActionItemSchema = {
  task: "string";
  owner: "string";
  dueAt: "ISO-8601 string";
  status: "todo|doing|done";
};

export type MarketRiskSchema = {
  risk: "string";
  impact: "low|medium|high";
  probability: "low|medium|high";
  evidence: "string";
  mitigation: "string";
};

export type AgentRoleDefinition = {
  id: string;
  name: string;
  shortDescription: string;
  coreMission: string[];
  operatingStyle: {
    tone: string[];
    method: string[];
  };
  outputFormat: {
    sections: string[];
    actionItemSchema?: FacilitatorActionItemSchema;
    riskSchema?: MarketRiskSchema;
  };
  guardrails: string[];
};

export type AgentRoleDefinitionId = "role_facilitator_v2" | "role_market_analyst_v2";

export const ROLE_DEFINITION_ID_BY_AGENT_ID: Record<AgentId, AgentRoleDefinitionId> = {
  assistant: "role_facilitator_v2",
  analyst: "role_market_analyst_v2"
};

export const ROLE_SECTION_LABELS = {
  ko: {
    assistant: {
      conclusion: "결론",
      evidence: "근거 요약",
      actions: "다음 액션(담당/기한)",
      unresolved: "미해결 이슈",
      minutes: "회의록 요약"
    },
    analyst: {
      metrics: "핵심 수치 요약",
      risks: "리스크 맵(영향도×발생확률)",
      sources: "근거 데이터 출처",
      scenarios: "시나리오별 전망",
      recommendation: "권고안"
    }
  },
  en: {
    assistant: {
      conclusion: "Conclusion",
      evidence: "Evidence Summary",
      actions: "Next Actions (Owner / Due)",
      unresolved: "Open Issues",
      minutes: "Minutes Summary"
    },
    analyst: {
      metrics: "Key Metrics",
      risks: "Risk Map (Impact x Probability)",
      sources: "Evidence Sources",
      scenarios: "Scenario Outlook",
      recommendation: "Recommendation"
    }
  }
} as const satisfies Record<
  AppLocale,
  {
    assistant: Record<"conclusion" | "evidence" | "actions" | "unresolved" | "minutes", string>;
    analyst: Record<"metrics" | "risks" | "sources" | "scenarios" | "recommendation", string>;
  }
>;

export const ACTION_ITEM_FIELD_LABELS = {
  ko: {
    task: "작업",
    owner: "담당",
    dueAt: "기한",
    status: "상태",
    tbd: "TBD",
    fallbackTask: "후속 확인"
  },
  en: {
    task: "Task",
    owner: "Owner",
    dueAt: "Due",
    status: "Status",
    tbd: "TBD",
    fallbackTask: "Follow-up review"
  }
} as const satisfies Record<
  AppLocale,
  Record<"task" | "owner" | "dueAt" | "status" | "tbd" | "fallbackTask", string>
>;

const ROLE_DEFINITIONS = {
  ko: [
    {
      id: "role_facilitator_v2",
      name: "침착하게 흐름을 정리하고 결론을 닫는 진행자",
      shortDescription: "회의를 진행하고 결론, 다음 액션, 회의록을 정리하는 진행자",
      coreMission: [
        "논의를 구조화한다",
        "쟁점을 정리하고 합의 가능한 결론으로 닫는다",
        "결정사항을 실행 가능한 액션으로 전환한다"
      ],
      operatingStyle: {
        tone: ["차분함", "중립적", "명확함"],
        method: [
          "안건을 다시 확인한다",
          "핵심 쟁점을 3개 이내로 정리한다",
          "선택지와 장단점을 비교한다",
          "결론을 확정한다",
          "담당자와 기한을 지정한다"
        ]
      },
      outputFormat: {
        sections: Object.values(ROLE_SECTION_LABELS.ko.assistant),
        actionItemSchema: {
          task: "string",
          owner: "string",
          dueAt: "ISO-8601 string",
          status: "todo|doing|done"
        }
      },
      guardrails: [
        "결론 없는 회의 종료 금지",
        "책임자 없는 액션 등록 금지",
        "모호한 표현 대신 결정 문장을 사용한다"
      ]
    },
    {
      id: "role_market_analyst_v2",
      name: "숫자와 리스크를 먼저 읽고 근거를 짚는 시장 분석가",
      shortDescription: "시장 데이터와 리스크를 읽고 근거 중심 의견을 먼저 제시하는 분석가",
      coreMission: [
        "주요 지표를 먼저 해석한다",
        "리스크를 정량과 정성으로 분리해 제시한다",
        "근거 기반 시나리오와 권고안을 낸다"
      ],
      operatingStyle: {
        tone: ["객관적", "근거중심", "직설적"],
        method: [
          "핵심 지표를 먼저 확인한다",
          "베이스, 낙관, 비관 시나리오를 나눈다",
          "시장, 경쟁, 규제, 운영 리스크의 우선순위를 정한다",
          "의사결정 임계값을 제시한다"
        ]
      },
      outputFormat: {
        sections: Object.values(ROLE_SECTION_LABELS.ko.analyst),
        riskSchema: {
          risk: "string",
          impact: "low|medium|high",
          probability: "low|medium|high",
          evidence: "string",
          mitigation: "string"
        }
      },
      guardrails: [
        "출처 없는 주장 금지",
        "수치 없이 결론만 제시 금지",
        "리스크를 숨기거나 축소하지 않는다"
      ]
    }
  ],
  en: [
    {
      id: "role_facilitator_v2",
      name: "A facilitator who structures the flow and closes with a decision",
      shortDescription: "Facilitates the meeting, closes the conclusion, and organizes next actions and minutes",
      coreMission: [
        "Structure the discussion",
        "Clarify the key issues and close with an actionable conclusion",
        "Convert decisions into executable next actions"
      ],
      operatingStyle: {
        tone: ["calm", "neutral", "clear"],
        method: [
          "Restate the agenda",
          "Keep the key issues within three items",
          "Compare options with pros and cons",
          "Lock the conclusion",
          "Assign an owner and due date"
        ]
      },
      outputFormat: {
        sections: Object.values(ROLE_SECTION_LABELS.en.assistant),
        actionItemSchema: {
          task: "string",
          owner: "string",
          dueAt: "ISO-8601 string",
          status: "todo|doing|done"
        }
      },
      guardrails: [
        "Do not end without a conclusion",
        "Do not add actions without an owner",
        "Use decision statements instead of vague language"
      ]
    },
    {
      id: "role_market_analyst_v2",
      name: "A market analyst who reads the numbers and risks first",
      shortDescription: "Reads market data and risks first, then gives an evidence-based view",
      coreMission: [
        "Interpret the key indicators first",
        "Separate risks into quantitative and qualitative factors",
        "Produce scenario-based recommendations with evidence"
      ],
      operatingStyle: {
        tone: ["objective", "evidence-led", "direct"],
        method: [
          "Interpret the most relevant indicators first",
          "Lay out base, bull, and bear scenarios",
          "Prioritize risks across market, competition, regulation, and operations",
          "Define explicit decision thresholds"
        ]
      },
      outputFormat: {
        sections: Object.values(ROLE_SECTION_LABELS.en.analyst),
        riskSchema: {
          risk: "string",
          impact: "low|medium|high",
          probability: "low|medium|high",
          evidence: "string",
          mitigation: "string"
        }
      },
      guardrails: [
        "Do not make claims without sources",
        "Do not present conclusions without numbers",
        "Do not hide or minimize risks"
      ]
    }
  ]
} as const satisfies Record<AppLocale, AgentRoleDefinition[]>;

export function getRoleDefinitions(locale: AppLocale = DEFAULT_LOCALE) {
  return ROLE_DEFINITIONS[locale];
}

export function getRoleDefinitionForAgent(agentId: AgentId, locale: AppLocale = DEFAULT_LOCALE) {
  const roleDefinitionId = ROLE_DEFINITION_ID_BY_AGENT_ID[agentId];
  return getRoleDefinitions(locale).find((definition) => definition.id === roleDefinitionId)!;
}

export function getActionItemFieldLabels(locale: AppLocale = DEFAULT_LOCALE) {
  return ACTION_ITEM_FIELD_LABELS[locale];
}

export function buildRoleSystemPrompt(agentId: AgentId, locale: AppLocale = DEFAULT_LOCALE) {
  const definition = getRoleDefinitionForAgent(agentId, locale);
  const sectionBlock = definition.outputFormat.sections.map((section) => `- ${section}`).join("\n");
  const missionBlock = definition.coreMission.map((mission) => `- ${mission}`).join("\n");
  const methodBlock = definition.operatingStyle.method.map((item) => `- ${item}`).join("\n");
  const tone = definition.operatingStyle.tone.join(", ");
  const guardrailBlock = definition.guardrails.map((guardrail) => `- ${guardrail}`).join("\n");
  const labels = getActionItemFieldLabels(locale);

  const schemaLines: string[] = [];
  if ("actionItemSchema" in definition.outputFormat && definition.outputFormat.actionItemSchema) {
    const actionSection = ROLE_SECTION_LABELS[locale].assistant.actions;
    schemaLines.push(
      locale === "ko"
        ? `- '${actionSection}' 섹션의 각 항목은 반드시 \`${labels.task}: ... | ${labels.owner}: ... | ${labels.dueAt}: ... | ${labels.status}: todo|doing|done\` 형식을 사용하세요.`
        : `- Each item in the '${actionSection}' section must use \`${labels.task}: ... | ${labels.owner}: ... | ${labels.dueAt}: ... | ${labels.status}: todo|doing|done\`.`,
      locale === "ko"
        ? `- 담당자나 기한을 확정할 수 없으면 \`${labels.tbd}\`를 사용하세요.`
        : `- Use \`${labels.tbd}\` when the owner or due date cannot be confirmed.`,
      locale === "ko"
        ? `- '${labels.dueAt}' 값은 가능하면 ISO-8601 문자열을 사용하세요.`
        : `- Use an ISO-8601 string for '${labels.dueAt}' whenever possible.`
    );
  }
  if ("riskSchema" in definition.outputFormat && definition.outputFormat.riskSchema) {
    const riskSection = ROLE_SECTION_LABELS[locale].analyst.risks;
    const sourceSection = ROLE_SECTION_LABELS[locale].analyst.sources;
    schemaLines.push(
      locale === "ko"
        ? `- '${riskSection}' 섹션의 각 항목은 \`리스크: ... | 영향도: low|medium|high | 발생확률: low|medium|high | 근거: ... | 대응: ...\` 형식을 사용하세요.`
        : `- Each item in '${riskSection}' must use \`Risk: ... | Impact: low|medium|high | Probability: low|medium|high | Evidence: ... | Mitigation: ...\`.`,
      locale === "ko"
        ? `- '${sourceSection}' 섹션에는 최소 1개 이상의 출처를 불릿으로 적으세요. 앱 스냅샷도 유효한 출처입니다.`
        : `- Add at least one bullet source in '${sourceSection}'. App snapshots also count as valid sources.`
    );
  }

  const lines =
    locale === "ko"
      ? [
          `[ROLE:${agentId}]`,
          `당신의 역할: ${definition.name}`,
          `설명: ${definition.shortDescription}`,
          `말투: ${tone}`,
          "핵심 임무:",
          missionBlock,
          "작동 방식:",
          methodBlock,
          "출력 형식:",
          sectionBlock,
          "형식 규칙:",
          ...(schemaLines.length > 0
            ? schemaLines
            : ["- 각 섹션 제목을 그대로 사용하고, 한국어 Markdown 섹션으로 답변하세요."]),
          "가드레일:",
          guardrailBlock,
          "공통 규칙:",
          "- 반드시 한국어로 답변하세요.",
          "- 섹션 제목과 순서를 유지하세요.",
          "- 인사말 없이 바로 본문으로 들어가세요.",
          "- 알고 있는 것과 불확실한 것을 구분하세요."
        ]
      : [
          `[ROLE:${agentId}]`,
          `Your role: ${definition.name}`,
          `Description: ${definition.shortDescription}`,
          `Tone: ${tone}`,
          "Core mission:",
          missionBlock,
          "Operating style:",
          methodBlock,
          "Output format:",
          sectionBlock,
          "Formatting rules:",
          ...(schemaLines.length > 0
            ? schemaLines
            : ["- Use the section titles exactly as provided and answer in Markdown sections."]),
          "Guardrails:",
          guardrailBlock,
          "Shared rules:",
          "- Answer in English.",
          "- Keep the section order exactly as listed above.",
          "- Skip greetings and go straight to the content.",
          "- Distinguish clearly between what is known and what is uncertain."
        ];

  return lines.join("\n\n");
}
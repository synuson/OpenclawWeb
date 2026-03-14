import type { AgentStatus, AutoSpeakMode, WorkspaceTab } from "@/lib/meeting/types";

export type AppLocale = "ko";

export const DEFAULT_LOCALE: AppLocale = "ko";

const BADGE_LABELS = {
  analysis: "분석",
  summary: "요약",
  queued: "대기열",
  running: "실행 중",
  succeeded: "완료",
  failed: "실패",
  error: "오류",
  warning: "경고",
  info: "안내",
  success: "성공",
  open: "접수",
  filled: "체결",
  rejected: "거절",
  loading: "불러오는 중",
  live: "실시간",
  demo: "데모",
  delayed: "지연",
  standby: "대기"
} as const;

const dictionaries = {
  ko: {
    app: {
      lang: "ko",
      title: "OpenClawWEB 금융 미팅룸",
      description: "두 에이전트가 참여하는 금융 회의 워크스페이스. 시장 탭, 모의투자, OpenClaw 조사를 한 화면에서 다룹니다."
    },
    tabs: {
      btc: "비트코인",
      kr: "국내주식",
      us: "미국증시",
      trading: "모의투자"
    } satisfies Record<WorkspaceTab, string>,
    autoSpeak: {
      summary: "요약만 읽기",
      all: "전체 읽기",
      off: "음성 끄기"
    } satisfies Record<AutoSpeakMode, string>,
    agentStatus: {
      idle: "대기",
      thinking: "검토 중",
      speaking: "발화 중",
      browsing: "조사 중"
    } satisfies Record<AgentStatus, string>,
    agentCard: {
      latestBrief: "최근 브리프",
      portraitAlt: (name: string) => `${name} 프로필 이미지`
    },
    meeting: {
      headerBadge: "금융 미팅룸",
      fixedAgents: "2인 고정 에이전트",
      providerBadge: (provider: string) => `모델 ${provider}`,
      tabBadge: (tab: string) => `탭 ${tab}`,
      openClawBadge: (id: string) => `OpenClaw ${id}`,
      title: "2인 금융 전략 워크스페이스",
      initialNotice: "브라우저 음성 기능과 데모 시세 피드가 준비되었습니다.",
      browserStt: "브라우저 STT",
      whisper: "Whisper",
      browserTts: "브라우저 TTS",
      elevenLabs: "ElevenLabs",
      workspaceEyebrow: "워크스페이스",
      workspaceTitle: "시장 탭",
      stageEyebrow: "스테이지",
      stageTitle: "회의 화면",
      timelineEyebrow: "타임라인",
      timelineTitle: "회의 로그",
      minutesEyebrow: "회의록",
      minutesTitle: "현재 세션",
      participants: (count: number) => `참여자 ${count}명`,
      userLabel: "나",
      systemLabel: "시스템",
      localCam: "로컬 카메라",
      cameraFallback: "카메라 미리보기는 선택 사항입니다. 카메라가 없어도 회의는 계속 진행됩니다.",
      timelineEmpty: "회의를 한 번 실행하면 회의록이 생성됩니다.",
      savedLocally: "로컬 저장됨",
      download: "다운로드",
      placeholder: "비트코인, 국내 주식, 미국 증시, 모의투자에 대해 분석가와 진행자에게 물어보세요...",
      runMeeting: "회의 실행",
      runningMeeting: "실행 중...",
      reset: "초기화",
      runOpenClaw: "OpenClaw 실행",
      stopMic: "마이크 중지",
      browserMic: "브라우저 마이크",
      stopWhisper: "Whisper 중지",
      whisperRecord: "Whisper 녹음",
      openClawResearch: "OpenClaw 조사",
      openClawSummary: "요약",
      openClawIdle: "웹 조사 요청이나 수동 실행 전까지 OpenClaw는 대기합니다.",
      noResearchTask: "선택된 조사 작업이 없습니다.",
      recentTasks: "최근 작업",
      minutesSummary: "요약",
      marketSnapshot: "시장 스냅샷",
      actionItems: "액션 아이템",
      tradeNotes: "매매 메모",
      feedNotes: "피드 메모",
      noFeedNotes: "피드 메모가 없습니다.",
      noIntradaySparkline: "당일 스파크라인이 없습니다.",
      tradingCash: "예수금",
      tradingEquity: "총자산",
      paperTrade: "모의투자",
      positions: "보유 포지션",
      recentOrders: "최근 주문",
      quantityPlaceholder: "수량",
      limitPlaceholder: "지정가",
      submitOrder: "모의 주문 제출",
      submittingOrder: "주문 전송 중...",
      btckrw: "BTC / KRW",
      kospiKosdaq: "코스피 / 코스닥",
      krWatchlist: "국내 관심종목",
      usProxies: "미국 시장 프록시",
      usWatchlist: "미국 관심종목",
      capabilitiesLine: (args: {
        browserStt: string;
        whisper: string;
        browserTts: string;
        elevenLabs: string;
        openClawRemote: string;
        openClawChat: string;
      }) =>
        `\uae30\ub2a5: STT ${args.browserStt}, Whisper ${args.whisper}, TTS ${args.browserTts}, ElevenLabs ${args.elevenLabs}, OpenClaw \uc870\uc0ac ${args.openClawRemote}, OpenClaw \ud68c\uc758 ${args.openClawChat}.`,
      notices: {
        openClawStarting: "OpenClaw 조사 작업을 시작합니다.",
        openClawCompleted: "OpenClaw 작업이 완료되었습니다.",
        openClawFailed: "OpenClaw 작업이 실패했습니다.",
        openClawStartFailed: "OpenClaw 조사 작업 시작에 실패했습니다.",
        browserSttUnsupported: "이 브라우저는 브라우저 STT를 지원하지 않습니다.",
        transcriptInserted: "음성 인식 결과를 입력창에 넣었습니다.",
        whisperFailed: "Whisper 전사에 실패했습니다.",
        whisperInserted: "Whisper 전사 결과를 입력창에 넣었습니다.",
        whisperRecording: "Whisper 녹음 중입니다. 다시 누르면 중지합니다.",
        audioPermissionUnavailable: "오디오 캡처 권한을 사용할 수 없습니다.",
        meetingCompleted: (provider: string) => `${provider}로 회의 라운드를 완료했습니다.`,
        meetingFailed: "회의 라운드 실행에 실패했습니다.",
        paperOrder: (status: string) => `모의 주문 상태: ${status}`,
        paperOrderFailed: "모의 주문 실행에 실패했습니다.",
        reset: "회의를 초기화했습니다. 시장 패널과 포트폴리오는 계속 갱신됩니다."
      }
    },
    markdown: {
      updated: "업데이트",
      workspace: "워크스페이스",
      summary: "요약",
      marketSnapshot: "시장 스냅샷",
      keyPoints: "핵심 포인트",
      actionItems: "액션 아이템",
      tradeNotes: "매매 메모",
      timeline: "타임라인"
    },
    trading: {
      side: {
        buy: "매수",
        sell: "매도"
      },
      orderType: {
        market: "시장가",
        limit: "지정가"
      }
    }
  }
} as const;

export type AppDictionary = (typeof dictionaries)[typeof DEFAULT_LOCALE];

export function getDictionary(locale: AppLocale = DEFAULT_LOCALE): AppDictionary {
  return dictionaries[locale];
}

export function labelForBadge(value?: string | null) {
  if (!value) {
    return "";
  }

  return BADGE_LABELS[value as keyof typeof BADGE_LABELS] ?? value;
}

export function labelForOrderSide(value: string) {
  if (value === "buy") {
    return "매수";
  }
  if (value === "sell") {
    return "매도";
  }
  return value;
}

export function labelForOrderType(value: string) {
  if (value === "market") {
    return "시장가";
  }
  if (value === "limit") {
    return "지정가";
  }
  return value;
}
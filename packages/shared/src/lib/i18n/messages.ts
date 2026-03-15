import type { AgentStatus, AutoSpeakMode, WorkspaceTab } from "@/lib/meeting/types";
import { DEFAULT_LOCALE, getIntlLocale, getSpeechLocale, type AppLocale } from "@/lib/i18n/config";

const BADGE_LABELS: Record<AppLocale, Record<string, string>> = {
  ko: {
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
    ready: "준비",
    live: "실시간",
    demo: "데모",
    delayed: "지연",
    standby: "대기"
  },
  en: {
    analysis: "Analysis",
    summary: "Summary",
    queued: "Queued",
    running: "Running",
    succeeded: "Done",
    failed: "Failed",
    error: "Error",
    warning: "Warning",
    info: "Info",
    success: "Success",
    open: "Open",
    filled: "Filled",
    rejected: "Rejected",
    loading: "Loading",
    ready: "Ready",
    live: "Live",
    demo: "Demo",
    delayed: "Delayed",
    standby: "Standby"
  }
};

const ORDER_SIDE_LABELS: Record<AppLocale, Record<"buy" | "sell", string>> = {
  ko: {
    buy: "매수",
    sell: "매도"
  },
  en: {
    buy: "Buy",
    sell: "Sell"
  }
};

const ORDER_TYPE_LABELS: Record<AppLocale, Record<"market" | "limit", string>> = {
  ko: {
    market: "시장가",
    limit: "지정가"
  },
  en: {
    market: "Market",
    limit: "Limit"
  }
};

const dictionaries = {
  ko: {
    app: {
      lang: "ko",
      title: "OpenClawWEB 금융 미팅룸",
      description:
        "두 에이전트가 참여하는 금융 워크스페이스. 시장 탭, 모의투자, OpenClaw 조사를 한 화면에서 다룹니다.",
      localeLabel: "언어",
      localeNames: {
        ko: "한국어",
        en: "English"
      },
      dateLocale: getIntlLocale("ko"),
      speechLocale: getSpeechLocale("ko")
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
      portraitAlt: (name: string) => `${name} 프로필 이미지`,
      descriptors: {
        assistant: "진행자",
        analyst: "리스크 데스크"
      }
    },
    meeting: {
      headerBadge: "금융 미팅룸",
      fixedAgents: "2인 고정 에이전트",
      providerBadge: (provider: string) => `모델 ${provider}`,
      tabBadge: (tab: string) => `탭 ${tab}`,
      openClawBadge: (id: string) => `OpenClaw ${id}`,
      title: "2인 금융 전략 워크스페이스",
      initialNotice: "브라우저 음성 기능과 시장 모니터가 준비되었습니다.",
      browserStt: "브라우저 STT",
      whisper: "Whisper",
      browserTts: "브라우저 TTS",
      elevenLabs: "ElevenLabs",
      workspaceEyebrow: "워크스페이스",
      workspaceTitle: "시장 탭",
      stageEyebrow: "\uC2A4\uD14C\uC774\uC9C0",
      stageTitle: "\uD68C\uC758 \uD654\uBA74",
      timelineEyebrow: "\uD0C0\uC784\uB77C\uC778",
      timelineTitle: "\uD68C\uC758 \uB85C\uADF8",
      minutesEyebrow: "회의록",
      minutesTitle: "현재 세션",
      participants: (count: number) => `\uCC38\uC5EC\uC790 ${count}\uBA85`,
      userLabel: "\uC0AC\uC6A9\uC790",
      systemLabel: "\uC2DC\uC2A4\uD15C",
      localCam: "로컬 카메라",
      cameraFallback:
        "카메라 미리보기는 선택 사항입니다. 카메라가 없어도 회의는 계속 진행됩니다.",
      timelineEmpty: "\uD68C\uC758\uB97C \uD55C \uBC88 \uC2E4\uD589\uD558\uBA74 \uD68C\uC758\uB85D\uC774 \uC0DD\uC131\uB429\uB2C8\uB2E4.",
      savedLocally: "로컬 저장됨",
      download: "다운로드",
      downloadFilename: (date: string) => `회의록-${date}.md`,
      placeholder: "\uBE44\uD2B8\uCF54\uC778, \uAD6D\uB0B4 \uC8FC\uC2DD, \uBBF8\uAD6D \uC99D\uC2DC, \uBAA8\uC758\uD22C\uC790\uC5D0 \uB300\uD574 \uBD84\uC11D\uAC00\uC640 \uC9C4\uD589\uC790\uC5D0\uAC8C \uBB3C\uC5B4\uBCF4\uC138\uC694...",
      runMeeting: "\uD68C\uC758 \uC2E4\uD589",
      runningMeeting: "\uC2E4\uD589 \uC911...",
      reset: "\uCD08\uAE30\uD654",
      runOpenClaw: "OpenClaw \uC870\uC0AC",
      stopMic: "\uB9C8\uC774\uD06C \uC911\uC9C0",
      browserMic: "브라우저 마이크",
      browserMicHint: "말하고 실행을 누르고 말하면 바로 회의를 시작합니다.",
      stopWhisper: "Whisper \uC911\uC9C0",
      whisperRecord: "Whisper \uB179\uC74C",
      speakAndRun: "\uB9D0\uD558\uACE0 \uC2E4\uD589",
      whisperAndRun: "Whisper \uD6C4 \uC2E4\uD589",
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
      marketOverview: "시장 개요",
      marketPulse: "시장 상태",
      marketSource: "데이터 소스",
      marketReferenceTime: "기준 시각",
      marketPreviousClose: "전일 종가",
      marketVolume: "거래량",
      marketChange: "변동폭",
      marketWatch: "관찰 포인트",
      marketClosedNote: "휴장 중이며 마지막 종가 기준으로 표시합니다.",
      marketPreNote: "정규장 시작 전 호가와 프리마켓 흐름을 반영합니다.",
      marketPostNote: "정규장 종료 후 시간외 흐름을 반영합니다.",
      marketLiveNote: "정규장 기준으로 최신 체결 흐름을 반영합니다.",
      marketDelayedNote: "지연 시세 기준으로 표시합니다.",
      marketDemoNote: "실데이터 연결 전까지 데모 피드로 표시합니다.",
      marketFeedNote: (provider: string) => `${provider} 기준 데이터입니다.`,
      providerNames: {
        upbit: "업비트",
        "naver-finance": "네이버 파이낸스",
        "yahoo-finance": "야후 파이낸스",
        "kiwoom-proxy": "키움 프록시",
        "twelve-data": "Twelve Data",
        demo: "데모"
      },
      tradingCash: "예수금",
      tradingEquity: "총자산",
      paperTrade: "모의투자",
      positions: "보유 포지션",
      recentOrders: "최근 주문",
      quantityPlaceholder: "\uC218\uB7C9",
      limitPlaceholder: "\uC9C0\uC815\uAC00",
      submitOrder: "모의 주문 제출",
      submittingOrder: "주문 전송 중...",
      btckrw: "비트코인 시세",
      kospiKosdaq: "국내 대표지수",
      krWatchlist: "국내 관심종목",
      usProxies: "미국 대표지수",
      usWatchlist: "미국 관심종목",
      settings: "설정",
      language: "언어",
      enterHint: "Enter\uB85C \uC2E4\uD589 \u00B7 Shift+Enter\uB85C \uC904\uBC14\uAFC8",
      voiceAutoRunOn: "\uB9C8\uC774\uD06C \uACB0\uACFC\uAC00 \uB3C4\uCC29\uD558\uBA74 \uBC14\uB85C \uD68C\uC758\uB97C \uC2DC\uC791\uD569\uB2C8\uB2E4.",
      voiceAutoRunOff: "\uB9C8\uC774\uD06C \uACB0\uACFC\uB294 \uC785\uB825\uCC3D\uB9CC \uCC44\uC6C1\uB2C8\uB2E4.",
      voiceAutoRunLabelOn: "\uC74C\uC131 \uC790\uB3D9 \uC2E4\uD589 \uCF1C\uC9D0",
      voiceAutoRunLabelOff: "\uC74C\uC131 \uC790\uB3D9 \uC2E4\uD589 \uAEBC\uC9D0",
      voiceSubmittingBrowser: "브라우저 음성을 받아 바로 회의를 시작합니다.",
      voiceSubmittingWhisper: "Whisper 음성을 받아 바로 회의를 시작합니다.",
      capabilityStates: {
        browser: "브라우저",
        unavailable: "없음",
        ready: "준비",
        off: "꺼짐"
      },
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
      side: ORDER_SIDE_LABELS.ko,
      orderType: ORDER_TYPE_LABELS.ko
    }
  },
  en: {
    app: {
      lang: "en",
      title: "OpenClawWEB Finance War Room",
      description:
        "A two-agent finance workspace covering market tabs, paper trading, and OpenClaw research in one view.",
      localeLabel: "Language",
      localeNames: {
        ko: "Korean",
        en: "English"
      },
      dateLocale: getIntlLocale("en"),
      speechLocale: getSpeechLocale("en")
    },
    tabs: {
      btc: "Bitcoin",
      kr: "Korean Equities",
      us: "US Markets",
      trading: "Paper Trading"
    } satisfies Record<WorkspaceTab, string>,
    autoSpeak: {
      summary: "Summary only",
      all: "Read all",
      off: "Mute"
    } satisfies Record<AutoSpeakMode, string>,
    agentStatus: {
      idle: "Idle",
      thinking: "Thinking",
      speaking: "Speaking",
      browsing: "Researching"
    } satisfies Record<AgentStatus, string>,
    agentCard: {
      latestBrief: "Latest brief",
      portraitAlt: (name: string) => `${name} portrait`,
      descriptors: {
        assistant: "Facilitator",
        analyst: "Risk Desk"
      }
    },
    meeting: {
      headerBadge: "Finance War Room",
      fixedAgents: "2 fixed agents",
      providerBadge: (provider: string) => `Model ${provider}`,
      tabBadge: (tab: string) => `Tab ${tab}`,
      openClawBadge: (id: string) => `OpenClaw ${id}`,
      title: "Two-agent finance strategy workspace",
      initialNotice: "Browser voice features and the market monitor are ready.",
      browserStt: "Browser STT",
      whisper: "Whisper",
      browserTts: "Browser TTS",
      elevenLabs: "ElevenLabs",
      workspaceEyebrow: "Workspace",
      workspaceTitle: "Market Tabs",
      stageEyebrow: "Stage",
      stageTitle: "Meeting View",
      timelineEyebrow: "Timeline",
      timelineTitle: "Meeting Log",
      minutesEyebrow: "Minutes",
      minutesTitle: "Current Session",
      participants: (count: number) => `${count} participants`,
      userLabel: "You",
      systemLabel: "System",
      localCam: "Local camera",
      cameraFallback:
        "Camera preview is optional. The meeting can continue without a camera.",
      timelineEmpty: "Run a meeting once to generate the minutes.",
      savedLocally: "Saved locally",
      download: "Download",
      downloadFilename: (date: string) => `meeting-minutes-${date}.md`,
      placeholder: "Ask the analyst and facilitator about bitcoin, Korean equities, US markets, or paper trading...",
      runMeeting: "Run meeting",
      runningMeeting: "Running...",
      reset: "Reset",
      runOpenClaw: "Run OpenClaw",
      stopMic: "Stop mic",
      browserMic: "Browser mic",
      browserMicHint: "Press Speak and run, then speak to start the meeting right away.",
      stopWhisper: "Stop Whisper",
      whisperRecord: "Whisper record",
      speakAndRun: "Speak and run",
      whisperAndRun: "Whisper and run",
      openClawResearch: "OpenClaw Research",
      openClawSummary: "Summary",
      openClawIdle: "OpenClaw stays idle until a web research request or manual run is triggered.",
      noResearchTask: "No research task selected.",
      recentTasks: "Recent tasks",
      minutesSummary: "Summary",
      marketSnapshot: "Market snapshot",
      actionItems: "Action items",
      tradeNotes: "Trade notes",
      feedNotes: "Feed notes",
      noFeedNotes: "No feed notes available.",
      noIntradaySparkline: "No intraday sparkline available.",
      marketOverview: "Market overview",
      marketPulse: "Market pulse",
      marketSource: "Data source",
      marketReferenceTime: "Reference time",
      marketPreviousClose: "Previous close",
      marketVolume: "Volume",
      marketChange: "Change",
      marketWatch: "Watch notes",
      marketClosedNote: "The market is closed. Quotes are anchored to the latest close.",
      marketPreNote: "Quotes reflect pre-market activity before the regular session.",
      marketPostNote: "Quotes reflect after-hours activity after the regular session.",
      marketLiveNote: "Quotes reflect the latest regular-session market move.",
      marketDelayedNote: "Quotes are marked as delayed by the provider.",
      marketDemoNote: "The board is running on a demo feed until a live source is available.",
      marketFeedNote: (provider: string) => `Feed source: ${provider}.`,
      providerNames: {
        upbit: "Upbit",
        "naver-finance": "Naver Finance",
        "yahoo-finance": "Yahoo Finance",
        "kiwoom-proxy": "Kiwoom proxy",
        "twelve-data": "Twelve Data",
        demo: "Demo"
      },
      tradingCash: "Cash",
      tradingEquity: "Equity",
      paperTrade: "Paper Trading",
      positions: "Positions",
      recentOrders: "Recent orders",
      quantityPlaceholder: "Quantity",
      limitPlaceholder: "Limit",
      submitOrder: "Submit paper order",
      submittingOrder: "Submitting order...",
      btckrw: "Bitcoin spot",
      kospiKosdaq: "Korean benchmarks",
      krWatchlist: "Korea watchlist",
      usProxies: "US benchmarks",
      usWatchlist: "US watchlist",
      settings: "Settings",
      language: "Language",
      enterHint: "Enter to run \u00B7 Shift+Enter for newline",
      voiceAutoRunOn: "The meeting starts immediately when a mic result arrives.",
      voiceAutoRunOff: "Mic results only fill the input box.",
      voiceAutoRunLabelOn: "Voice auto-run on",
      voiceAutoRunLabelOff: "Voice auto-run off",
      voiceSubmittingBrowser: "Starting the meeting from the browser transcript.",
      voiceSubmittingWhisper: "Starting the meeting from the Whisper transcript.",
      capabilityStates: {
        browser: "Browser",
        unavailable: "Unavailable",
        ready: "Ready",
        off: "Off"
      },
      capabilitiesLine: (args: {
        browserStt: string;
        whisper: string;
        browserTts: string;
        elevenLabs: string;
      }) =>
        `Capabilities: STT ${args.browserStt}, Whisper ${args.whisper}, TTS ${args.browserTts}, ElevenLabs ${args.elevenLabs}.`,
      notices: {
        openClawStarting: "Starting an OpenClaw research task.",
        openClawCompleted: "OpenClaw finished the task.",
        openClawFailed: "OpenClaw failed the task.",
        openClawStartFailed: "Failed to start the OpenClaw task.",
        browserSttUnsupported: "This browser does not support browser STT.",
        transcriptInserted: "The transcript was inserted into the composer.",
        whisperFailed: "Whisper transcription failed.",
        whisperInserted: "The Whisper transcript was inserted into the composer.",
        whisperRecording: "Whisper is recording. Press again to stop.",
        audioPermissionUnavailable: "Audio capture permission is unavailable.",
        meetingCompleted: (provider: string) => `Meeting round completed with ${provider}.`,
        meetingFailed: "Meeting round failed.",
        paperOrder: (status: string) => `Paper order status: ${status}`,
        paperOrderFailed: "Failed to place the paper order.",
        reset: "The meeting was reset. Market panels and the portfolio will keep updating."
      }
    },
    markdown: {
      updated: "Updated",
      workspace: "Workspace",
      summary: "Summary",
      marketSnapshot: "Market snapshot",
      keyPoints: "Key points",
      actionItems: "Action items",
      tradeNotes: "Trade notes",
      timeline: "Timeline"
    },
    trading: {
      side: ORDER_SIDE_LABELS.en,
      orderType: ORDER_TYPE_LABELS.en
    }
  }
} as const;

export type AppDictionary = (typeof dictionaries)[typeof DEFAULT_LOCALE];

export function getDictionary(locale: AppLocale = DEFAULT_LOCALE): AppDictionary {
  return dictionaries[locale];
}

export function labelForBadge(value?: string | null, locale: AppLocale = DEFAULT_LOCALE) {
  if (!value) {
    return "";
  }

  return BADGE_LABELS[locale][value] ?? value;
}

export function labelForOrderSide(value: string, locale: AppLocale = DEFAULT_LOCALE) {
  if (value === "buy" || value === "sell") {
    return ORDER_SIDE_LABELS[locale][value];
  }
  return value;
}

export function labelForOrderType(value: string, locale: AppLocale = DEFAULT_LOCALE) {
  if (value === "market" || value === "limit") {
    return ORDER_TYPE_LABELS[locale][value];
  }
  return value;
}

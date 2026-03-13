export const desktopApiKeyServices = ["anthropic", "openai", "twelvedata", "elevenlabs"] as const;

export type DesktopApiKeyService = (typeof desktopApiKeyServices)[number];
export type DesktopApiKeyValidationStatus = "success" | "error" | null;

export interface DesktopApiKeySummary {
  service: DesktopApiKeyService;
  configured: boolean;
  maskedValue: string | null;
  updatedAt: string | null;
  lastValidationStatus: DesktopApiKeyValidationStatus;
  lastValidatedAt: string | null;
}

export interface DesktopApiKeyTestResult {
  success: boolean;
  message: string;
  statusCode?: number;
}

export interface DesktopRuntimeInfo {
  isElectron: boolean;
  platform: NodeJS.Platform;
  version: string;
  userDataPath: string;
  databasePath: string;
  onboardingCompleted: boolean;
}

export interface DesktopApiBridge {
  getRuntimeInfo: () => Promise<DesktopRuntimeInfo>;
  getApiKeySummaries: () => Promise<DesktopApiKeySummary[]>;
  saveApiKey: (service: DesktopApiKeyService, key: string) => Promise<DesktopApiKeySummary>;
  clearApiKey: (service: DesktopApiKeyService) => Promise<DesktopApiKeySummary>;
  testApiKey: (service: DesktopApiKeyService, key?: string) => Promise<DesktopApiKeyTestResult>;
  setOnboardingComplete: (done: boolean) => Promise<void>;
}

import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApiBridge, DesktopApiKeyService } from "../lib/electron/contracts";

const electronAPI: DesktopApiBridge = {
  getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
  getApiKeySummaries: () => ipcRenderer.invoke("desktop:get-api-key-summaries"),
  saveApiKey: (service, key) => ipcRenderer.invoke("desktop:save-api-key", service, key),
  clearApiKey: (service) => ipcRenderer.invoke("desktop:clear-api-key", service),
  testApiKey: (service, key) => ipcRenderer.invoke("desktop:test-api-key", service, key),
  setOnboardingComplete: (done) => ipcRenderer.invoke("desktop:set-onboarding-complete", done)
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

contextBridge.exposeInMainWorld("desktopApiServices", {
  anthropic: "anthropic" as DesktopApiKeyService,
  openai: "openai" as DesktopApiKeyService,
  twelvedata: "twelvedata" as DesktopApiKeyService,
  elevenlabs: "elevenlabs" as DesktopApiKeyService
});

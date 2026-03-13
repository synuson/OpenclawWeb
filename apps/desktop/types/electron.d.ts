import type { DesktopApiBridge } from "../lib/electron/contracts";

declare global {
  interface Window {
    electronAPI?: DesktopApiBridge;
  }
}

export {};

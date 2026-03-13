import type { BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

export function setupAutoUpdater(mainWindow: BrowserWindow) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", () => {
    mainWindow.webContents.send("desktop:update-state", {
      state: "update-available"
    });
  });

  autoUpdater.on("update-downloaded", () => {
    mainWindow.webContents.send("desktop:update-state", {
      state: "update-downloaded"
    });
  });

  autoUpdater.on("error", (error) => {
    console.error("[updater]", error);
  });

  void autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error("[updater:check]", error);
  });
}

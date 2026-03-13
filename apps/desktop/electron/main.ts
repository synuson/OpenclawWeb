import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import Store from "electron-store";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  desktopApiKeyServices,
  type DesktopApiKeyService,
  type DesktopApiKeySummary,
  type DesktopApiKeyTestResult
} from "../lib/electron/contracts";
import { setupAutoUpdater } from "./updater";

type StoredApiKeyRecord = {
  value: string;
  updatedAt: string;
  lastValidationStatus: "success" | "error" | null;
  lastValidatedAt: string | null;
};

type DesktopStoreShape = {
  apiKeys: Partial<Record<DesktopApiKeyService, StoredApiKeyRecord>>;
  onboardingCompleted: boolean;
};

const LOCALHOST = "127.0.0.1";
const BACKEND_PORT = 18374;
const STORE_NAME = "desktop-config";
const API_KEY_ENV_MAP: Record<DesktopApiKeyService, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  twelvedata: "TWELVE_DATA_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY"
};

const desktopStore = new Store<DesktopStoreShape>({
  name: STORE_NAME,
  defaults: {
    apiKeys: {},
    onboardingCompleted: false
  }
}) as Store<DesktopStoreShape> & {
  get: <Value = unknown>(key: string) => Value;
  set: (key: string, value: unknown) => void;
  delete: (key: string) => void;
};

let mainWindow: BrowserWindow | null = null;
let nextServerProcess: ChildProcessWithoutNullStreams | null = null;
let backendProcess: ChildProcessWithoutNullStreams | null = null;
let serverPort = 0;

function nowIso() {
  return new Date().toISOString();
}

function getProjectRoot() {
  return path.resolve(__dirname, "..", "..");
}

function getDatabasePath() {
  return path.join(app.getPath("userData"), "data.db");
}

function assertEncryptionAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("safeStorage is not available on this machine.");
  }
}

function encryptSecret(secret: string) {
  assertEncryptionAvailable();
  return safeStorage.encryptString(secret).toString("base64");
}

function decryptSecret(secret: string) {
  assertEncryptionAvailable();
  return safeStorage.decryptString(Buffer.from(secret, "base64"));
}

function maskSecret(secret: string) {
  if (!secret) {
    return null;
  }

  if (secret.length <= 4) {
    return "*".repeat(8);
  }

  return `${"*".repeat(Math.max(8, secret.length - 4))}${secret.slice(-4)}`;
}

function readStoredRecord(service: DesktopApiKeyService) {
  return desktopStore.get<StoredApiKeyRecord | undefined>(`apiKeys.${service}`);
}

function getApiKeySummary(service: DesktopApiKeyService): DesktopApiKeySummary {
  const record = readStoredRecord(service);
  const decrypted = record?.value ? decryptSecret(record.value) : "";

  return {
    service,
    configured: Boolean(record?.value),
    maskedValue: decrypted ? maskSecret(decrypted) : null,
    updatedAt: record?.updatedAt ?? null,
    lastValidationStatus: record?.lastValidationStatus ?? null,
    lastValidatedAt: record?.lastValidatedAt ?? null
  };
}

function getApiKeySummaries() {
  return desktopApiKeyServices.map((service) => getApiKeySummary(service));
}

function getApiKeyEnvironment() {
  return Object.fromEntries(
    desktopApiKeyServices.flatMap((service) => {
      const record = readStoredRecord(service);
      if (!record?.value) {
        return [];
      }

      return [[API_KEY_ENV_MAP[service], decryptSecret(record.value)]];
    })
  ) as Record<string, string>;
}

function updateValidationStatus(
  service: DesktopApiKeyService,
  status: "success" | "error" | null,
  validatedAt: string | null
) {
  const record = readStoredRecord(service);
  if (!record) {
    return;
  }

  desktopStore.set(`apiKeys.${service}`, {
    ...record,
    lastValidationStatus: status,
    lastValidatedAt: validatedAt
  });
}

async function validateApiKey(
  service: DesktopApiKeyService,
  secret: string
): Promise<DesktopApiKeyTestResult> {
  if (!secret.trim()) {
    return {
      success: false,
      message: "API key is empty."
    };
  }

  if (service === "openai") {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${secret}`
      }
    });

    return {
      success: response.ok,
      message: response.ok ? "OpenAI key is valid." : await response.text(),
      statusCode: response.status
    };
  }

  if (service === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": secret,
        "anthropic-version": "2023-06-01"
      }
    });

    return {
      success: response.ok,
      message: response.ok ? "Anthropic key is valid." : await response.text(),
      statusCode: response.status
    };
  }

  if (service === "twelvedata") {
    const response = await fetch(
      `https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day&outputsize=1&apikey=${encodeURIComponent(secret)}`
    );
    const data = (await response.json()) as { status?: string; message?: string };

    return {
      success: response.ok && data.status !== "error",
      message: response.ok && data.status !== "error" ? "Twelve Data key is valid." : data.message || "Validation failed.",
      statusCode: response.status
    };
  }

  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: {
      "xi-api-key": secret
    }
  });

  return {
    success: response.ok,
    message: response.ok ? "ElevenLabs key is valid." : await response.text(),
    statusCode: response.status
  };
}

function spawnProcess(command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
  return spawn(command, args, {
    cwd,
    env,
    stdio: "pipe"
  });
}

async function allocatePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, LOCALHOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate a local port."));
        return;
      }

      resolve(address.port);
      server.close();
    });
    server.on("error", reject);
  });
}

async function waitForServer(url: string, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.status < 500) {
        return;
      }
    } catch {
      // The local server is still booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcess(processRef: ChildProcessWithoutNullStreams | null) {
  if (!processRef?.pid) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(processRef.pid), "/T", "/F"]);
      killer.on("close", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }

  processRef.kill("SIGTERM");
}

function findStandaloneServerPath(searchRoot: string): string | null {
  if (!fs.existsSync(searchRoot)) {
    return null;
  }

  const directServerPath = path.join(searchRoot, "server.js");
  if (fs.existsSync(directServerPath)) {
    return directServerPath;
  }

  const entries = fs.readdirSync(searchRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const nested = findStandaloneServerPath(path.join(searchRoot, entry.name));
    if (nested) {
      return nested;
    }
  }

  return null;
}

function resolveStandaloneServerPath() {
  const projectRoot = getProjectRoot();
  const candidateRoots = [
    path.join(projectRoot, ".next", "standalone"),
    path.join(process.resourcesPath, "app.asar.unpacked", "apps", "desktop", ".next", "standalone")
  ];

  const found = candidateRoots
    .map((candidateRoot) => findStandaloneServerPath(candidateRoot))
    .find((candidate): candidate is string => Boolean(candidate));

  if (!found) {
    throw new Error("Could not find the Next standalone server bundle.");
  }

  return found;
}

function resolveBackendBinaryPath() {
  const projectRoot = getProjectRoot();
  const candidates = [
    process.env.OPENCLAW_BACKEND_BINARY || "",
    path.join(
      projectRoot,
      "openclaw-backend",
      "dist",
      process.platform === "win32" ? "openclaw-backend.exe" : "openclaw-backend"
    ),
    path.join(
      process.resourcesPath,
      "openclaw-backend",
      process.platform === "win32" ? "openclaw-backend.exe" : "openclaw-backend"
    )
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function maybeStartBackend() {
  if (backendProcess) {
    return `http://${LOCALHOST}:${BACKEND_PORT}`;
  }

  const backendBinaryPath = resolveBackendBinaryPath();
  if (!backendBinaryPath) {
    return undefined;
  }

  backendProcess = spawnProcess(
    backendBinaryPath,
    [],
    {
      ...process.env,
      PORT: String(BACKEND_PORT)
    },
    path.dirname(backendBinaryPath)
  );

  backendProcess.stderr.on("data", (chunk) => {
    console.error("[openclaw-backend]", chunk.toString().trim());
  });

  return `http://${LOCALHOST}:${BACKEND_PORT}`;
}

async function startNextServer() {
  serverPort = await allocatePort();
  const projectRoot = getProjectRoot();
  const backendBaseUrl = await maybeStartBackend();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...getApiKeyEnvironment(),
    DATABASE_URL: `file:${getDatabasePath().replace(/\\/g, "/")}`,
    HOSTNAME: LOCALHOST,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: app.isPackaged ? "production" : "development",
    OPENCLAW_USER_DATA_DIR: app.getPath("userData"),
    PORT: String(serverPort)
  };

  if (backendBaseUrl) {
    env.OPENCLAW_BASE_URL = backendBaseUrl;
  }

  if (app.isPackaged) {
    nextServerProcess = spawnProcess(
      process.execPath,
      [resolveStandaloneServerPath()],
      {
        ...env,
        ELECTRON_RUN_AS_NODE: "1"
      },
      projectRoot
    );
  } else {
    const nextCliPath = require.resolve("next/dist/bin/next");
    nextServerProcess = spawnProcess(
      process.execPath,
      [
        nextCliPath,
        "dev",
        "--hostname",
        LOCALHOST,
        "--port",
        String(serverPort)
      ],
      {
        ...env,
        ELECTRON_RUN_AS_NODE: "1"
      },
      projectRoot
    );
  }

  nextServerProcess.stdout.on("data", (chunk) => {
    console.log("[next]", chunk.toString().trim());
  });

  nextServerProcess.stderr.on("data", (chunk) => {
    console.error("[next]", chunk.toString().trim());
  });

  const url = `http://${LOCALHOST}:${serverPort}`;
  await waitForServer(url);
  return url;
}

async function restartNextServer() {
  await stopProcess(nextServerProcess);
  nextServerProcess = null;
  const url = await startNextServer();

  if (mainWindow) {
    await mainWindow.loadURL(url);
  }
}

function createMainWindow() {
  const preloadPath = path.join(__dirname, "preload.js");

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1200,
    minHeight: 780,
    backgroundColor: "#f6f0e4",
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
}

function registerIpcHandlers() {
  ipcMain.handle("desktop:get-runtime-info", () => ({
    isElectron: true,
    platform: process.platform,
    version: app.getVersion(),
    userDataPath: app.getPath("userData"),
    databasePath: getDatabasePath(),
    onboardingCompleted: desktopStore.get("onboardingCompleted")
  }));

  ipcMain.handle("desktop:get-api-key-summaries", () => getApiKeySummaries());

  ipcMain.handle("desktop:save-api-key", async (_event, service: DesktopApiKeyService, key: string) => {
    desktopStore.set(`apiKeys.${service}`, {
      value: encryptSecret(key.trim()),
      updatedAt: nowIso(),
      lastValidationStatus: null,
      lastValidatedAt: null
    });

    await restartNextServer();
    return getApiKeySummary(service);
  });

  ipcMain.handle("desktop:clear-api-key", async (_event, service: DesktopApiKeyService) => {
    desktopStore.delete(`apiKeys.${service}`);
    await restartNextServer();
    return getApiKeySummary(service);
  });

  ipcMain.handle(
    "desktop:test-api-key",
    async (_event, service: DesktopApiKeyService, candidate?: string): Promise<DesktopApiKeyTestResult> => {
      const stored = readStoredRecord(service);
      const secret = candidate?.trim() || (stored?.value ? decryptSecret(stored.value) : "");
      const result = await validateApiKey(service, secret);

      if (stored) {
        updateValidationStatus(service, result.success ? "success" : "error", nowIso());
      }

      return result;
    }
  );

  ipcMain.handle("desktop:set-onboarding-complete", (_event, done: boolean) => {
    desktopStore.set("onboardingCompleted", done);
  });
}

async function bootstrap() {
  await app.whenReady();
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  registerIpcHandlers();
  createMainWindow();

  const url = await startNextServer();
  await mainWindow?.loadURL(url);

  if (mainWindow && app.isPackaged) {
    setupAutoUpdater(mainWindow);
  }
}

app.on("window-all-closed", async () => {
  await stopProcess(nextServerProcess);
  await stopProcess(backendProcess);
  nextServerProcess = null;
  backendProcess = null;

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
    if (serverPort > 0) {
      await mainWindow?.loadURL(`http://${LOCALHOST}:${serverPort}`);
    }
  }
});

app.on("before-quit", async () => {
  await stopProcess(nextServerProcess);
  await stopProcess(backendProcess);
});

void bootstrap().catch((error) => {
  console.error("[electron-bootstrap]", error);
  app.quit();
});

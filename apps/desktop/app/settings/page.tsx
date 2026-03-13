"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  desktopApiKeyServices,
  type DesktopApiKeyService,
  type DesktopApiKeySummary,
  type DesktopRuntimeInfo
} from "@/lib/electron/contracts";

const SERVICE_META: Array<{
  service: DesktopApiKeyService;
  label: string;
  description: string;
  required: boolean;
}> = [
  {
    service: "anthropic",
    label: "Anthropic API Key",
    description: "Meeting analyst and facilitator responses.",
    required: true
  },
  {
    service: "openai",
    label: "OpenAI API Key",
    description: "Whisper STT and optional LLM fallback.",
    required: false
  },
  {
    service: "twelvedata",
    label: "Twelve Data API Key",
    description: "US market snapshot feed.",
    required: false
  },
  {
    service: "elevenlabs",
    label: "ElevenLabs API Key",
    description: "Premium TTS playback for agent voices.",
    required: false
  }
];

function createEmptyRecord<T>(factory: () => T) {
  return Object.fromEntries(desktopApiKeyServices.map((service) => [service, factory()])) as Record<
    DesktopApiKeyService,
    T
  >;
}

export default function SettingsPage() {
  const [runtime, setRuntime] = useState<DesktopRuntimeInfo | null>(null);
  const [inputs, setInputs] = useState<Record<DesktopApiKeyService, string>>(() => createEmptyRecord(() => ""));
  const [summaries, setSummaries] = useState<Record<DesktopApiKeyService, DesktopApiKeySummary | null>>(() =>
    createEmptyRecord(() => null)
  );
  const [messages, setMessages] = useState<Record<DesktopApiKeyService, string>>(() =>
    createEmptyRecord(() => "")
  );
  const [busyState, setBusyState] = useState<string | null>(null);
  const isElectron = typeof window !== "undefined" && Boolean(window.electronAPI);

  const configuredCount = useMemo(
    () => Object.values(summaries).filter((summary) => summary?.configured).length,
    [summaries]
  );

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    async function hydrate() {
      const [nextRuntime, nextSummaries] = await Promise.all([
        window.electronAPI?.getRuntimeInfo(),
        window.electronAPI?.getApiKeySummaries()
      ]);

      if (nextRuntime) {
        setRuntime(nextRuntime);
      }

      if (nextSummaries) {
        setSummaries(
          Object.fromEntries(nextSummaries.map((summary) => [summary.service, summary])) as Record<
            DesktopApiKeyService,
            DesktopApiKeySummary
          >
        );
      }
    }

    void hydrate();
  }, []);

  async function refreshSummaries() {
    if (!window.electronAPI) {
      return;
    }

    const nextSummaries = await window.electronAPI.getApiKeySummaries();
    setSummaries(
      Object.fromEntries(nextSummaries.map((summary) => [summary.service, summary])) as Record<
        DesktopApiKeyService,
        DesktopApiKeySummary
      >
    );
  }

  async function handleSave(service: DesktopApiKeyService) {
    if (!window.electronAPI || !inputs[service].trim()) {
      return;
    }

    setBusyState(`save:${service}`);
    try {
      const summary = await window.electronAPI.saveApiKey(service, inputs[service].trim());
      setSummaries((previous) => ({ ...previous, [service]: summary }));
      setInputs((previous) => ({ ...previous, [service]: "" }));
      setMessages((previous) => ({
        ...previous,
        [service]: "Saved locally and synced to the desktop runtime."
      }));
    } catch (error) {
      setMessages((previous) => ({
        ...previous,
        [service]: error instanceof Error ? error.message : "Failed to save the key."
      }));
    } finally {
      setBusyState(null);
    }
  }

  async function handleClear(service: DesktopApiKeyService) {
    if (!window.electronAPI) {
      return;
    }

    setBusyState(`clear:${service}`);
    try {
      const summary = await window.electronAPI.clearApiKey(service);
      setSummaries((previous) => ({ ...previous, [service]: summary }));
      setInputs((previous) => ({ ...previous, [service]: "" }));
      setMessages((previous) => ({
        ...previous,
        [service]: "Stored key removed from the local desktop profile."
      }));
    } catch (error) {
      setMessages((previous) => ({
        ...previous,
        [service]: error instanceof Error ? error.message : "Failed to clear the key."
      }));
    } finally {
      setBusyState(null);
    }
  }

  async function handleTest(service: DesktopApiKeyService) {
    if (!window.electronAPI) {
      return;
    }

    setBusyState(`test:${service}`);
    try {
      const result = await window.electronAPI.testApiKey(service, inputs[service].trim() || undefined);
      await refreshSummaries();
      setMessages((previous) => ({ ...previous, [service]: result.message }));
    } catch (error) {
      setMessages((previous) => ({
        ...previous,
        [service]: error instanceof Error ? error.message : "Connection test failed."
      }));
    } finally {
      setBusyState(null);
    }
  }

  async function handleOnboardingComplete() {
    if (!window.electronAPI) {
      return;
    }

    await window.electronAPI.setOnboardingComplete(true);
    const nextRuntime = await window.electronAPI.getRuntimeInfo();
    setRuntime(nextRuntime);
  }

  return (
    <div className="min-h-dvh bg-paper px-4 py-4 text-ink md:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="panel-surface rounded-[30px] px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="section-kicker">Desktop Runtime</div>
              <h1 className="mt-2 font-display text-4xl">Local API Vault</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-mist">
                Electron local build settings. API keys stay on the customer machine and are encrypted before they are written to disk.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isElectron ? "signal" : "outline"}>{isElectron ? "Electron" : "Web Preview"}</Badge>
              <Link
                href="/meeting"
                className="inline-flex h-11 items-center justify-center rounded-full border border-ink/10 bg-white/80 px-4 text-sm font-medium text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_12px_28px_rgba(18,24,36,0.05)]"
              >
                Return to Meeting
              </Link>
            </div>
          </div>
        </header>

        {!isElectron ? (
          <Card className="p-6">
            <div className="section-kicker">Runtime Notice</div>
            <p className="mt-3 text-sm leading-6 text-mist">
              This page is designed for the Electron desktop runtime. Open the app with `npm run electron:dev` to use encrypted local storage and IPC.
            </p>
          </Card>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-5">
            <div className="section-kicker">Configured Keys</div>
            <div className="mt-3 text-3xl font-semibold">{configuredCount}</div>
            <p className="mt-2 text-sm text-mist">Anthropic is the only required key for the first desktop workflow.</p>
          </Card>
          <Card className="p-5">
            <div className="section-kicker">Database Path</div>
            <div className="mt-3 break-all font-mono text-sm text-ink/80">
              {runtime?.databasePath || "Pending Electron runtime..."}
            </div>
            <p className="mt-2 text-sm text-mist">SQLite will be resolved from the desktop profile directory.</p>
          </Card>
          <Card className="p-5">
            <div className="section-kicker">Runtime State</div>
            <div className="mt-3 text-sm leading-6 text-ink/85">
              <div>Platform: {runtime?.platform || "unknown"}</div>
              <div>Version: {runtime?.version || "0.0.0"}</div>
              <div>UserData: {runtime?.userDataPath || "Pending Electron runtime..."}</div>
            </div>
            <Button className="mt-4" variant="secondary" onClick={() => void handleOnboardingComplete()}>
              Mark Onboarding Complete
            </Button>
          </Card>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {SERVICE_META.map((entry) => {
            const summary = summaries[entry.service];
            const isSaving = busyState === `save:${entry.service}`;
            const isTesting = busyState === `test:${entry.service}`;
            const isClearing = busyState === `clear:${entry.service}`;

            return (
              <Card key={entry.service} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="section-kicker">{entry.label}</div>
                    <div className="mt-2 text-sm leading-6 text-mist">{entry.description}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={summary?.configured ? "signal" : "outline"}>
                      {summary?.configured ? "Configured" : "Missing"}
                    </Badge>
                    {entry.required ? <Badge>Required</Badge> : <Badge variant="secondary">Optional</Badge>}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <Input
                    type="password"
                    value={inputs[entry.service]}
                    onChange={(event) =>
                      setInputs((previous) => ({ ...previous, [entry.service]: event.target.value }))
                    }
                    placeholder={summary?.maskedValue || "Paste a new key to save"}
                  />

                  <div className="rounded-[20px] border border-ink/10 bg-white/68 px-4 py-3 text-sm text-mist">
                    <div>Stored: {summary?.maskedValue || "Not saved"}</div>
                    <div>Updated: {summary?.updatedAt || "-"}</div>
                    <div>
                      Last test: {summary?.lastValidationStatus || "-"} {summary?.lastValidatedAt || ""}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => void handleSave(entry.service)}
                      disabled={isSaving || !inputs[entry.service].trim()}
                    >
                      {isSaving ? "Saving..." : "Save Key"}
                    </Button>
                    <Button variant="outline" onClick={() => void handleTest(entry.service)} disabled={isTesting}>
                      {isTesting ? "Testing..." : "Connection Test"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void handleClear(entry.service)}
                      disabled={isClearing || !summary?.configured}
                    >
                      {isClearing ? "Clearing..." : "Clear"}
                    </Button>
                  </div>

                  {messages[entry.service] ? (
                    <div className="rounded-[18px] border border-cobalt/12 bg-cobalt/5 px-4 py-3 text-sm text-ink/85">
                      {messages[entry.service]}
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

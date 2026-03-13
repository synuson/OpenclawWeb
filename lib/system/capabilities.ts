import type { Capabilities } from "@/lib/meeting/types";

export function getKiwoomProxyConfig() {
  const baseUrl = process.env.KIWOOM_PROXY_BASE_URL?.replace(/\/$/, "") || "";
  const token = process.env.KIWOOM_PROXY_TOKEN || "";

  if (!baseUrl) {
    return null;
  }

  return {
    baseUrl,
    token
  };
}

export function getCapabilities(): Capabilities {
  return {
    openaiStt: Boolean(process.env.OPENAI_API_KEY),
    elevenLabsTts: Boolean(process.env.ELEVENLABS_API_KEY),
    kiwoomRest: Boolean(getKiwoomProxyConfig()),
    twelveData: Boolean(process.env.TWELVE_DATA_API_KEY),
    demoTrading: !Boolean(getKiwoomProxyConfig()),
    openclawRemote: Boolean(process.env.OPENCLAW_BASE_URL)
  };
}

from __future__ import annotations

from urllib.parse import quote


def build_artifacts(agent_id: str, instruction: str, url: str | None):
    title = f"OpenClaw Local Task | {agent_id}"
    subtitle = url or "No explicit URL provided"
    svg = f"""
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f1724" />
          <stop offset="100%" stop-color="#21408f" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" rx="36" fill="url(#bg)" />
      <text x="72" y="132" fill="#f8fafc" font-size="54" font-family="Arial, sans-serif">{title}</text>
      <text x="72" y="204" fill="rgba(248,250,252,0.72)" font-size="26" font-family="Arial, sans-serif">{subtitle}</text>
      <text x="72" y="314" fill="#ffffff" font-size="38" font-family="Arial, sans-serif">{instruction[:60]}</text>
      <rect x="72" y="382" width="1136" height="220" rx="26" fill="rgba(255,255,255,0.08)" />
      <text x="108" y="448" fill="rgba(248,250,252,0.72)" font-size="24" font-family="Arial, sans-serif">Local backend placeholder</text>
      <text x="108" y="520" fill="#ffffff" font-size="30" font-family="Arial, sans-serif">Replace this with a bundled Playwright workflow later.</text>
    </svg>
    """
    return {
        "screenshot": f"data:image/svg+xml;charset=UTF-8,{quote(svg)}",
        "notes": [
            "Placeholder backend artifact generated locally.",
            "PyInstaller output should replace this stub during packaging."
        ]
    }

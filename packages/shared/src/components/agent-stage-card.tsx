"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/messages";
import type { Agent } from "@/lib/meeting/agents";
import type { AgentStatus } from "@/lib/meeting/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type CharacterTheme = {
  photoUrl: string;
  photoPosition: string;
  shellBackground: string;
  ambient: string;
  cardTint: string;
  cardBorder: string;
  fallbackGradient: string;
};

const STATUS_DOT_CLASSES: Record<AgentStatus, string> = {
  idle: "bg-ink/28",
  thinking: "bg-ember shadow-[0_0_0_6px_rgba(226,145,44,0.12)]",
  speaking: "bg-mint shadow-[0_0_0_6px_rgba(24,170,116,0.14)]",
  browsing: "bg-cobalt shadow-[0_0_0_6px_rgba(44,91,245,0.14)]"
};

const CHARACTER_THEMES: Record<Agent["id"], CharacterTheme> = {
  assistant: {
    photoUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=80",
    photoPosition: "center 28%",
    shellBackground:
      "radial-gradient(circle at 18% 18%, rgba(43, 194, 138, 0.34), transparent 28%), linear-gradient(180deg, rgba(246, 255, 251, 0.96), rgba(229, 246, 239, 0.94))",
    ambient: "rgba(43, 194, 138, 0.2)",
    cardTint: "rgba(24, 170, 116, 0.06)",
    cardBorder: "rgba(24, 170, 116, 0.16)",
    fallbackGradient: "linear-gradient(135deg, rgba(24, 170, 116, 0.24), rgba(44, 91, 245, 0.28))"
  },
  analyst: {
    photoUrl:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1200&q=80",
    photoPosition: "center 20%",
    shellBackground:
      "radial-gradient(circle at 20% 18%, rgba(226, 145, 44, 0.32), transparent 28%), linear-gradient(180deg, rgba(255, 251, 245, 0.96), rgba(252, 242, 229, 0.94))",
    ambient: "rgba(226, 145, 44, 0.2)",
    cardTint: "rgba(226, 145, 44, 0.08)",
    cardBorder: "rgba(226, 145, 44, 0.18)",
    fallbackGradient: "linear-gradient(135deg, rgba(226, 145, 44, 0.26), rgba(16, 25, 39, 0.3))"
  }
};

type AgentHeroProps = {
  agent: Agent;
  theme: CharacterTheme;
  locale: AppLocale;
};

function AgentHero({ agent, theme, locale }: AgentHeroProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const copy = getDictionary(locale);

  return (
    <div
      className="relative h-[260px] overflow-hidden rounded-[26px] border border-white/60"
      style={{ backgroundImage: photoFailed ? theme.fallbackGradient : theme.shellBackground }}
    >
      {!photoFailed ? (
        <>
          <img
            src={theme.photoUrl}
            alt={copy.agentCard.portraitAlt(agent.name)}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: theme.photoPosition }}
            loading="eager"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setPhotoFailed(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f1724]/76 via-[#0f1724]/28 to-transparent" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_36%)]" />
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.28),transparent_42%)] text-white">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/30 bg-black/20 text-3xl font-semibold backdrop-blur-md">
            {agent.emoji}
          </div>
        </div>
      )}
      <div className="absolute left-4 top-4 rounded-full border border-white/25 bg-white/14 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-white/86 backdrop-blur-md">
        {copy.agentCard.descriptors[agent.id]}
      </div>
      <div className="absolute right-4 top-4 h-16 w-16 rounded-full blur-3xl" style={{ backgroundColor: theme.ambient }} />
      <div className="absolute inset-x-4 bottom-4 rounded-[22px] border border-white/18 bg-black/35 p-4 text-white backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-[2rem] leading-none">{agent.name}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.22em] text-white/72">{agent.title}</div>
          </div>
          <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white/76">
            {agent.emoji}
          </div>
        </div>
      </div>
    </div>
  );
}

type AgentStageCardProps = {
  agent: Agent;
  status: AgentStatus;
  latestMessage: string;
  locale?: AppLocale;
};

export function AgentStageCard({
  agent,
  status,
  latestMessage,
  locale = DEFAULT_LOCALE
}: AgentStageCardProps) {
  const copy = getDictionary(locale);
  const theme = CHARACTER_THEMES[agent.id];
  const highlightStyle: CSSProperties = {
    backgroundColor: theme.cardTint,
    borderColor: theme.cardBorder
  };

  return (
    <div
      className={cn(
        "rounded-[30px] border border-ink/10 bg-white/88 p-5 transition duration-200",
        status === "thinking" && "status-ring-thinking",
        status === "speaking" && "status-ring-speaking",
        status === "browsing" && "status-ring-browsing",
        status === "idle" && "status-ring-idle"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full transition", STATUS_DOT_CLASSES[status])} />
          <Badge variant="secondary">
            {agent.emoji} {agent.title}
          </Badge>
        </div>
        <Badge variant="outline">{copy.agentStatus[status]}</Badge>
      </div>
      <div className="mt-4">
        <AgentHero agent={agent} theme={theme} locale={locale} />
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium leading-6 text-ink">{agent.tagline}</p>
        <p className="text-sm leading-6 text-mist">{agent.role}</p>
      </div>
      <div
        className="mt-4 rounded-[24px] border px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
        style={highlightStyle}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-mist">{copy.agentCard.latestBrief}</div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-mist">{copy.agentStatus[status]}</span>
        </div>
        <p className="mt-2 line-clamp-4 text-sm leading-6 text-ink/85">{latestMessage}</p>
      </div>
    </div>
  );
}

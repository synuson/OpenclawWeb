import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "signal";

const badgeVariants: Record<BadgeVariant, string> = {
  default: "border border-ink/80 bg-ink text-white shadow-[0_8px_20px_rgba(18,24,36,0.14)]",
  secondary: "border border-white/60 bg-white/72 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
  outline: "border border-ink/10 bg-white/72 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]",
  signal: "border border-cobalt/15 bg-cobalt/10 text-cobalt shadow-[0_10px_24px_rgba(44,91,245,0.1)]"
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] backdrop-blur-sm",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}

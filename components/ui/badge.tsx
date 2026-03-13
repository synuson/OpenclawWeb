import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "signal";

const badgeVariants: Record<BadgeVariant, string> = {
  default: "bg-ink text-white",
  secondary: "bg-ink/7 text-ink",
  outline: "border border-ink/10 bg-white/70 text-ink",
  signal: "border border-cobalt/15 bg-cobalt/10 text-cobalt"
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}

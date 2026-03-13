import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel-surface rounded-[30px] border-white/55 shadow-[0_18px_60px_rgba(24,33,51,0.12)]", className)} {...props} />;
}

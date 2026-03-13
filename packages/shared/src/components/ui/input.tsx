import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-12 w-full rounded-full border border-ink/10 bg-white/82 px-4 text-sm text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_12px_28px_rgba(18,24,36,0.05)] outline-none transition placeholder:text-mist focus:border-cobalt/35 focus:ring-4 focus:ring-cobalt/10 disabled:bg-white/45 disabled:text-mist",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-[120px] w-full rounded-[28px] border border-ink/10 bg-white/86 px-4 py-3 text-sm text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_14px_34px_rgba(18,24,36,0.06)] outline-none transition placeholder:text-mist focus:border-cobalt/35 focus:ring-4 focus:ring-cobalt/10 disabled:bg-white/50 disabled:text-mist",
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-[120px] w-full rounded-[28px] border border-ink/10 bg-white/85 px-4 py-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-mist focus:border-cobalt/35 focus:ring-4 focus:ring-cobalt/10",
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

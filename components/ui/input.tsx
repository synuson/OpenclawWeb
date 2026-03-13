import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-12 w-full rounded-full border border-ink/10 bg-white/80 px-4 text-sm text-ink shadow-sm outline-none transition placeholder:text-mist focus:border-cobalt/35 focus:ring-4 focus:ring-cobalt/10",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

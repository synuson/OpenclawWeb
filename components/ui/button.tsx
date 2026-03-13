import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "secondary" | "destructive" | "ghost";
type ButtonSize = "default" | "sm" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-ink text-white shadow-panel hover:-translate-y-0.5 hover:bg-ink/90 disabled:bg-ink/30",
  outline:
    "border border-ink/10 bg-white/80 text-ink hover:-translate-y-0.5 hover:bg-white disabled:text-ink/35",
  secondary:
    "bg-cobalt/10 text-cobalt hover:-translate-y-0.5 hover:bg-cobalt/15 disabled:text-cobalt/35",
  destructive:
    "bg-rose text-white hover:-translate-y-0.5 hover:bg-rose/90 disabled:bg-rose/30",
  ghost:
    "bg-transparent text-ink hover:bg-white/70 disabled:text-ink/35"
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-11 px-4 text-sm",
  sm: "h-9 px-3 text-xs",
  lg: "h-12 px-6 text-sm",
  icon: "h-10 w-10"
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-medium transition duration-200 disabled:pointer-events-none",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

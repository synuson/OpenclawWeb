import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "secondary" | "destructive" | "ghost";
type ButtonSize = "default" | "sm" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "border border-ink/90 bg-ink text-white shadow-[0_18px_40px_rgba(18,24,36,0.18)] hover:-translate-y-0.5 hover:bg-ink/92 hover:shadow-[0_22px_48px_rgba(18,24,36,0.22)] disabled:border-ink/20 disabled:bg-ink/30",
  outline:
    "border border-ink/10 bg-white/78 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_10px_24px_rgba(18,24,36,0.05)] hover:-translate-y-0.5 hover:border-ink/16 hover:bg-white disabled:text-ink/35",
  secondary:
    "border border-cobalt/10 bg-cobalt/10 text-cobalt shadow-[0_12px_28px_rgba(44,91,245,0.12)] hover:-translate-y-0.5 hover:bg-cobalt/14 hover:shadow-[0_18px_32px_rgba(44,91,245,0.16)] disabled:text-cobalt/35",
  destructive:
    "border border-rose/80 bg-rose text-white shadow-[0_16px_36px_rgba(196,85,101,0.18)] hover:-translate-y-0.5 hover:bg-rose/92 disabled:border-rose/20 disabled:bg-rose/30",
  ghost:
    "border border-transparent bg-transparent text-ink hover:bg-white/70 disabled:text-ink/35"
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
          "inline-flex items-center justify-center gap-2 rounded-full font-medium transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cobalt/12 disabled:pointer-events-none disabled:translate-y-0 disabled:shadow-none",
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

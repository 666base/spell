import * as React from "react";
import { cn } from "../../lib/utils";
import { normalizeIconChildren } from "./Icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "default" | "secondary" | "ghost" | "outline" | "link";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

const buttonSizes = {
  xs: "h-6 px-2.5 text-[11px]", // 24px
  sm: "h-7 px-3 text-xs", // 28px
  md: "h-8 px-4 text-sm", // 32px
  lg: "h-9 px-5 text-sm", // 36px
  xl: "h-10 px-6 text-sm", // 40px
};

const buttonVariants = {
  primary: "bg-accent text-text-inverse hover:bg-accent/90 rounded-lg shadow-[var(--shadow-control)]",
  default: "bg-bg-muted text-text hover:bg-bg-hover rounded-lg",
  secondary: "bg-bg-muted text-text hover:bg-bg-hover rounded-lg",
  ghost: "hover:bg-bg-hover text-text-muted hover:text-text rounded-lg",
  outline:
    "border border-border bg-transparent hover:bg-bg-hover text-text rounded-lg",
  link: "text-text-muted hover:text-text underline-offset-4 hover:underline",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", children, ...props }, ref) => {
    return (
      <button
        className={cn(
          "app-control motion-interactive inline-flex items-center justify-center whitespace-nowrap font-medium active:scale-[0.97]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          buttonSizes[size],
          buttonVariants[variant],
          className
        )}
        ref={ref}
        type={props.type ?? "button"}
        {...props}
      >
        {normalizeIconChildren(children)}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };

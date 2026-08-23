import * as React from "react";
import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { PinIcon } from "../icons/velocity";
import { normalizeIconChildren } from "./Icon";

// Re-export components
export {
  Tooltip,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from "./Tooltip";
export { Button } from "./Button";
export { CodeCopyButton } from "./CodeCopyButton";
export { CheckmarkIcon, DisclosureIcon, FolderGlyph, PanelToggleIcon } from "./StateIcon";
export { Input } from "./Input";
export { InlineNameInput } from "./InlineNameInput";
export { Select } from "./Select";
export { Toaster } from "./Toaster";
export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "./AlertDialog";

// Toolbar button with active state and tooltip
interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  children: ReactNode;
}

export function ToolbarButton({
  isActive = false,
  className = "",
  children,
  title,
  ...props
}: ToolbarButtonProps) {
  return (
    <button
      className={cn(
        "app-control toolbar-button motion-interactive size-7 flex items-center justify-center text-sm rounded-md shrink-0",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1",
        isActive
          ? "bg-bg-selected text-text"
          : "hover:bg-bg-hover text-text-muted",
        className,
      )}
      aria-label={title}
      aria-pressed={isActive}
      data-active={isActive ? "true" : "false"}
      type={props.type ?? "button"}
      {...props}
    >
      {normalizeIconChildren(children)}
    </button>
  );
}

// Icon button (for sidebar actions, etc.)
export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant?: "primary" | "default" | "secondary" | "ghost" | "outline";
  title?: string;
  pressed?: boolean;
}

const iconButtonSizes = {
  xs: "size-6",
  sm: "size-7",
  md: "size-8",
  lg: "size-9",
  xl: "size-10",
};

const iconButtonVariants = {
  primary: "bg-accent text-text-inverse hover:bg-accent/90",
  default: "bg-bg-emphasis text-text hover:bg-bg-hover",
  secondary: "bg-bg-muted text-text hover:bg-bg-hover",
  ghost: "",
  outline:
    "border border-border text-text-muted hover:bg-bg-hover hover:text-text",
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      children,
      title,
      size = "sm",
      variant = "ghost",
      pressed = false,
      ...props
    },
    ref
  ) => {
    const active = pressed || props["aria-pressed"] === true;
    return (
      <button
        ref={ref}
        {...props}
        type={props.type ?? "button"}
        className={cn(
          "app-control icon-button motion-interactive flex items-center justify-center rounded-md",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1",
          "disabled:pointer-events-none cursor-pointer",
          iconButtonSizes[size],
          iconButtonVariants[variant],
          className,
        )}
        data-size={size}
        data-active={active ? "true" : "false"}
        aria-label={title ?? props["aria-label"]}
        aria-pressed={pressed || props["aria-pressed"] != null ? active : undefined}
      >
        {normalizeIconChildren(children)}
      </button>
    );
  }
);
IconButton.displayName = "IconButton";

// List item for sidebar
interface ListItemProps {
  title: string;
  subtitle?: string;
  meta?: string;
  isSelected?: boolean;
  isMultiSelected?: boolean;
  isPinned?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  /** Optional status icon to display next to meta */
}

export function ListItem({
  title,
  subtitle,
  meta,
  isSelected = false,
  isMultiSelected = false,
  isPinned = false,
  onClick,
  onContextMenu,
}: ListItemProps & { onContextMenu?: (e: React.MouseEvent) => void }) {
  // Clean subtitle: treat whitespace-only or &nbsp; as empty
  const cleanSubtitle = subtitle
    ?.replace(/&nbsp;/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
  const hasSubtitle = cleanSubtitle && cleanSubtitle.length > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        "note-row w-full rounded-[8px] border-0 bg-transparent px-3 py-[9px] text-left cursor-pointer select-none",
        "focus:outline-none",
        (isSelected || isMultiSelected) && "note-row-selected",
      )}
      data-selected={isSelected || isMultiSelected ? "true" : "false"}
    >
      <div className="note-row-title-line">
        <span className="note-row-title">{title}</span>
        {isPinned && <PinIcon aria-hidden="true" className="source-list-pin" />}
      </div>
      {(meta || hasSubtitle) && (
        <p className="note-row-meta-line">
          {meta && <span className="note-row-date">{meta}</span>}
          {hasSubtitle && (
            <span className="note-row-preview">{cleanSubtitle}</span>
          )}
        </p>
      )}
    </button>
  );
}

// Command palette item
interface CommandItemProps {
  label: string;
  subtitle?: string;
  shortcut?: string;
  icon?: ReactNode;
  iconText?: string;
  variant?: "note" | "command";
  isSelected?: boolean;
  onClick?: () => void;
}

export function CommandItem({
  label,
  subtitle,
  shortcut,
  icon,
  iconText,
  variant = "command",
  isSelected = false,
  onClick,
}: CommandItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between rounded-lg border-0 bg-transparent px-2 py-1.5 text-left",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        isSelected ? "bg-bg-selected text-text" : "text-text hover:bg-bg-hover",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {(icon || iconText) && (
          <div
            className={cn(
              "shrink-0 flex items-center justify-center text-text-muted",
              variant === "note" &&
                "w-9 h-9 rounded-md bg-bg-emphasis flex items-center justify-center"
            )}
          >
            {iconText ? (
              <span className="text-xl text-text-muted font-serif">
                {iconText}
              </span>
            ) : (
              icon
            )}
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-medium truncate">{label}</span>
          {subtitle && (
            <span className="text-[12px] truncate text-text-muted">{subtitle}</span>
          )}
        </div>
      </div>
      {shortcut && <span className="spell-menu-shortcut">{shortcut}</span>}
    </button>
  );
}

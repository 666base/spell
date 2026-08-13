import { cn } from "../../lib/utils";
import { CheckIcon, ChevronRightIcon } from "../icons/velocity";

interface DisclosureIconProps {
  open: boolean;
  className?: string;
}

export function DisclosureIcon({ open, className }: DisclosureIconProps) {
  return (
    <ChevronRightIcon
      aria-hidden="true"
      data-open={open}
      className={cn("state-disclosure", className)}
    />
  );
}

interface PanelToggleIconProps {
  side: "left" | "right";
  open: boolean;
  className?: string;
}

/**
 * A compact app-frame icon whose side rail fades in and out with the sidebar.
 * It communicates layout state without relying on directional arrows.
 */
export function PanelToggleIcon({ side, open, className }: PanelToggleIconProps) {
  const dividerX = side === "left" ? 5.25 : 10.75;
  const panelX = side === "left" ? 2.75 : 11.5;

  return (
    <span
      aria-hidden="true"
      data-open={open}
      data-side={side}
      className={cn("state-panel-toggle", className)}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.75" y="2.5" width="12.5" height="11" rx="1.5" />
        <rect
          className="state-panel-toggle-rail"
          x={panelX}
          y="4"
          width="1.75"
          height="8"
          rx="0.55"
          stroke="none"
          fill="currentColor"
        />
        <line className="state-panel-toggle-divider" x1={dividerX} y1="3.7" x2={dividerX} y2="12.3" />
      </svg>
    </span>
  );
}

interface CheckmarkIconProps {
  checked: boolean;
  className?: string;
}

export function CheckmarkIcon({ checked, className }: CheckmarkIconProps) {
  return (
    <span
      aria-hidden="true"
      data-state={checked ? "checked" : "unchecked"}
      className={cn("state-checkmark", className)}
    >
      <CheckIcon className="state-checkmark-svg" />
    </span>
  );
}

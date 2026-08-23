import { cn } from "../../lib/utils";
import {
  CheckIcon,
  ChevronRightIcon,
  PanelLeftIcon,
  PanelRightIcon,
} from "../icons/velocity";

interface DisclosureIconProps {
  open: boolean;
  className?: string;
}

export function DisclosureIcon({ open, className }: DisclosureIconProps) {
  return (
    <ChevronRightIcon
      aria-hidden="true"
      data-open={open ? "true" : "false"}
      className={cn("state-disclosure", className)}
    />
  );
}

interface PanelToggleIconProps {
  side: "left" | "right";
  open: boolean;
  className?: string;
}

export function PanelToggleIcon({ side, open, className }: PanelToggleIconProps) {
  const Icon = side === "left" ? PanelLeftIcon : PanelRightIcon;
  return (
    <Icon
      aria-hidden="true"
      data-open={open ? "true" : "false"}
      data-side={side}
      className={cn("ui-icon panel-toggle-icon", className)}
    />
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

const FOLDER_BACK =
  "M1.55 4.15C1.55 2.96 2.51 2 3.7 2h4.25c.52 0 1.02.19 1.4.53l1.28 1.14c.38.34.88.53 1.4.53H16.3c1.2 0 2.15.96 2.15 2.15V15.7c0 1.38-1.12 2.5-2.5 2.5H4.05c-1.38 0-2.5-1.12-2.5-2.5V4.15Z";

export function FolderGlyph({ open = false, className }: { open?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      data-open={open ? "true" : "false"}
      className={cn("folder-glyph", className)}
    >
      <path className="folder-glyph-back" d={FOLDER_BACK} />
      <path className="folder-glyph-body" d={FOLDER_BACK} />
      <path
        className="folder-glyph-pocket"
        d="M4.05 7.4H15.95c.67 0 1.23.48 1.37 1.14L18.45 15.7c0 1.38-1.12 2.5-2.5 2.5H4.05c-1.38 0-2.5-1.12-2.5-2.5L2.68 8.54C2.82 7.88 3.38 7.4 4.05 7.4Z"
      />
      <path
        className="folder-glyph-tab"
        d="M1.55 4.15C1.55 2.96 2.51 2 3.7 2h4.25c.52 0 1.02.19 1.4.53l1.28 1.14c.38.34.88.53 1.4.53V4.45H1.55V4.15Z"
      />
    </svg>
  );
}

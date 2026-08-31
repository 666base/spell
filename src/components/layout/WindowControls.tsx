import { cn } from "../../lib/utils";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { isAndroid, isMac, isWindows } from "../../lib/platform";
import { MaximizeIcon, MinusIcon, XIcon } from "../icons/velocity";
import { IconButton } from "../ui";

export function usesInlineWindowControls() {
  return isTauri() && !isAndroid && !isMac && !isWindows;
}

export function WindowControls({ className }: { className?: string }) {
  if (!usesInlineWindowControls()) return null;

  const appWindow = getCurrentWindow();

  return (
    <div className={cn("titlebar-no-drag flex items-center gap-px", className)}>
      <IconButton
        size="sm"
        title="Minimize"
        onClick={() => void appWindow.minimize()}
      >
        <MinusIcon />
      </IconButton>
      <IconButton
        size="sm"
        title="Maximize"
        onClick={() => void appWindow.toggleMaximize()}
      >
        <MaximizeIcon />
      </IconButton>
      <IconButton
        size="sm"
        title="Close"
        className="hover:bg-rose-500/90 hover:text-white"
        onClick={() => void appWindow.close()}
      >
        <XIcon />
      </IconButton>
    </div>
  );
}

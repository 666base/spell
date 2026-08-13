import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { isAndroid, isMac, isWindows } from "../../lib/platform";
import { MaximizeIcon, MinusIcon, XIcon } from "../icons/velocity";

export function WindowControls() {
  if (!isTauri() || isAndroid || isMac || isWindows) return null;

  const appWindow = getCurrentWindow();
  const controlClass =
    "motion-interactive flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

  return (
    <div className="titlebar-no-drag fixed right-0 top-0 z-50 flex h-10 items-center gap-0.5 px-2">
      <button
        type="button"
        aria-label="Minimize"
        title="Minimize"
        className={controlClass}
        onClick={() => void appWindow.minimize()}
      >
        <MinusIcon className="size-3.5 -translate-y-px stroke-[1.7]" />
      </button>
      <button
        type="button"
        aria-label="Maximize"
        title="Maximize"
        className={controlClass}
        onClick={() => void appWindow.toggleMaximize()}
      >
        <MaximizeIcon className="size-3.5 stroke-[1.55]" />
      </button>
      <button
        type="button"
        aria-label="Close"
        title="Close"
        className={`${controlClass} hover:bg-rose-500/90 hover:text-white`}
        onClick={() => void appWindow.close()}
      >
        <XIcon className="size-3.5 stroke-[1.7]" />
      </button>
    </div>
  );
}

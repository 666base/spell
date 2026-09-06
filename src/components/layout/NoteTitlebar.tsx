import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { windowDragRegionProps } from "../../lib/windowDrag";
import { isMac } from "../../lib/platform";
import { AddNoteIcon, PlusIcon } from "../icons/velocity";
import { IconButton, PanelToggleIcon } from "../ui";
import { WindowControls } from "./WindowControls";

interface NoteTitlebarProps {
  sidebarVisible?: boolean;
  foldersVisible?: boolean;
  focusMode?: boolean;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  showCompose?: boolean;
  showWindowControls?: boolean;
  composePlus?: boolean;
  newNoteBusy?: boolean;
  leading?: ReactNode;
  center?: ReactNode;
  trailing?: ReactNode;
}

export function NoteTitlebar({
  sidebarVisible = true,
  foldersVisible,
  focusMode = false,
  onToggleSidebar,
  onNewNote,
  showCompose,
  showWindowControls = false,
  composePlus = false,
  newNoteBusy = false,
  leading,
  center,
  trailing,
}: NoteTitlebarProps) {
  const foldersOpen = foldersVisible ?? sidebarVisible;
  const showToggle = Boolean(onToggleSidebar) && !focusMode;
  const showCollapsedChrome = !sidebarVisible && !focusMode;
  const showNewNote = showCompose ?? showCollapsedChrome;
  const hasChrome = showToggle || (showNewNote && onNewNote) || leading;

  return (
    <div
      className={cn(
        "note-titlebar app-titlebar relative grid shrink-0 select-none grid-cols-[minmax(0,1fr)_auto_minmax(min-content,1fr)] items-center gap-2",
        showCollapsedChrome && isMac && "pl-20",
      )}
      {...windowDragRegionProps}
    >
      <div className="flex min-w-0 items-center">
        {hasChrome && (
          <div className="titlebar-no-drag flex shrink-0 items-center gap-px">
            {showToggle && (
              <IconButton
                size="sm"
                title={foldersOpen ? "Hide folders" : "Show folders"}
                onClick={onToggleSidebar}
                aria-expanded={foldersOpen}
              >
                <PanelToggleIcon side="left" open={foldersOpen} />
              </IconButton>
            )}
            {leading}
            {showNewNote && onNewNote && (
              <IconButton
                size="sm"
                title={composePlus ? "Create daily note" : "New note"}
                onClick={onNewNote}
                disabled={newNoteBusy}
                aria-busy={newNoteBusy || undefined}
              >
                {composePlus ? <PlusIcon /> : <AddNoteIcon />}
              </IconButton>
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 max-w-[min(100%,20rem)] justify-center px-1">
        {center}
      </div>

      <div className="flex min-w-min items-center justify-end gap-2">
        <div
          className={cn(
            "titlebar-no-drag flex items-center gap-2",
            focusMode && "pointer-events-none opacity-0",
          )}
        >
          {trailing}
        </div>
        {showWindowControls && <WindowControls />}
      </div>
    </div>
  );
}

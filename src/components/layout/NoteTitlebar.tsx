import type { ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { cn } from "../../lib/utils";
import { isMac } from "../../lib/platform";
import { AddNoteIcon, PlusIcon } from "../icons/velocity";
import { IconButton, PanelToggleIcon } from "../ui";
import { TitlebarTools } from "./TitlebarTools";
import { WindowControls } from "./WindowControls";

interface NoteTitlebarProps {
  sidebarVisible?: boolean;
  focusMode?: boolean;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  showCompose?: boolean;
  showWindowControls?: boolean;
  editor?: Editor | null;
  showTools?: boolean;
  composePlus?: boolean;
  leading?: ReactNode;
  center?: ReactNode;
  trailing?: ReactNode;
}

export function NoteTitlebar({
  sidebarVisible = true,
  focusMode = false,
  onToggleSidebar,
  onNewNote,
  showCompose,
  showWindowControls = false,
  editor = null,
  showTools = true,
  composePlus = false,
  leading,
  center,
  trailing,
}: NoteTitlebarProps) {
  const showCollapsedChrome = !sidebarVisible && !focusMode;
  const showNewNote = showCompose ?? showCollapsedChrome;
  const tools = showTools ? <TitlebarTools editor={editor} /> : null;
  const hasChrome =
    (showCollapsedChrome && onToggleSidebar) || (showNewNote && onNewNote) || leading;

  return (
    <div
      className={cn(
        "note-titlebar app-titlebar relative grid h-11 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(min-content,1fr)] items-center gap-2 px-2",
        showCollapsedChrome && isMac && "pl-20",
      )}
      data-tauri-drag-region
    >
      <div className="flex min-w-0 items-center">
        {hasChrome && (
          <div className="titlebar-no-drag flex shrink-0 items-center gap-px">
            {showCollapsedChrome && onToggleSidebar && (
              <IconButton size="sm" title="Show sidebar" onClick={onToggleSidebar} aria-expanded={sidebarVisible}>
                <PanelToggleIcon side="left" open={sidebarVisible} />
              </IconButton>
            )}
            {leading}
            {showNewNote && onNewNote && (
              <IconButton
                size="sm"
                title={composePlus ? "Create daily note" : "New note"}
                onClick={onNewNote}
              >
                {composePlus ? <PlusIcon /> : <AddNoteIcon />}
              </IconButton>
            )}
          </div>
        )}
      </div>

      <div className="titlebar-no-drag flex min-w-0 max-w-[min(100%,20rem)] justify-center px-1">
        {center}
      </div>

      <div className="titlebar-no-drag flex min-w-min items-center justify-end gap-2">
        <div
          className={cn(
            "flex items-center gap-2",
            focusMode && "pointer-events-none opacity-0",
          )}
        >
          {tools}
          {trailing}
        </div>
        {showWindowControls && <WindowControls className="notes-toolbar-group" />}
      </div>
    </div>
  );
}

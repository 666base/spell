import type { ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { cn } from "../../lib/utils";
import { isMac } from "../../lib/platform";
import { AddNoteIcon } from "../icons/velocity";
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
  center,
  trailing,
}: NoteTitlebarProps) {
  const showCollapsedChrome = !sidebarVisible && !focusMode;
  const showNewNote = showCompose ?? showCollapsedChrome;
  const tools = showTools ? <TitlebarTools editor={editor} /> : null;
  const hasChrome = (showCollapsedChrome && onToggleSidebar) || (showNewNote && onNewNote);

  return (
    <div
      className={cn(
        "note-titlebar relative flex h-11 shrink-0 items-center gap-2 px-2.5 app-titlebar",
        showCollapsedChrome && isMac && "pl-20",
      )}
      data-tauri-drag-region
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {hasChrome && (
          <div className="titlebar-no-drag z-20 flex shrink-0 items-center gap-px">
            {showCollapsedChrome && onToggleSidebar && (
              <IconButton size="sm" title="Show sidebar" onClick={onToggleSidebar} aria-expanded={sidebarVisible}>
                <PanelToggleIcon side="left" open={sidebarVisible} />
              </IconButton>
            )}
            {showNewNote && onNewNote && (
              <IconButton size="sm" title="New note" onClick={onNewNote}>
                <AddNoteIcon />
              </IconButton>
            )}
          </div>
        )}
      </div>

      {center && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-24">
          <div className="titlebar-no-drag pointer-events-auto max-w-full min-w-0">
            {center}
          </div>
        </div>
      )}

      <div className="titlebar-no-drag z-20 flex shrink-0 items-center justify-end gap-2">
        <div
          className={cn(
            "flex items-center gap-2",
            focusMode && "pointer-events-none opacity-0",
          )}
        >
          {tools}
          {trailing}
        </div>
        {showWindowControls && <WindowControls />}
      </div>
    </div>
  );
}

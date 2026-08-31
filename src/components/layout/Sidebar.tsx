import { cn } from "../../lib/utils";
import { NoteList } from "../notes/NoteList";
import {
  IconButton,
  PanelToggleIcon,
} from "../ui";
import {
  XIcon,
  NoteIcon,
  BookIcon,
} from "../icons/velocity";
import { isMac } from "../../lib/platform";
import type { NotesScope } from "../../lib/notesScope";
import { useLibrarySelection } from "./LibraryDnd";

export type SidebarPanel = "notes" | "journal";

const SIDEBAR_PANELS: { id: SidebarPanel; label: string; icon: typeof NoteIcon }[] = [
  { id: "notes", label: "Notes", icon: NoteIcon },
  { id: "journal", label: "Journal", icon: BookIcon },
];

interface SidebarProps {
  panel: SidebarPanel;
  onSelectPanel: (panel: SidebarPanel) => void;
  onClose?: () => void;
  onToggle?: () => void;
  foldersVisible?: boolean;
  scope?: NotesScope;
  onOpenSettings?: () => void;
  mobile?: boolean;
}

export function Sidebar({
  panel,
  onClose,
  onToggle,
  foldersVisible = true,
  scope,
  mobile = false,
}: SidebarProps) {
  const {
    selectedNoteIds,
    setSelectedNoteIds,
    lastClickedNoteId,
    setLastClickedNoteId,
  } = useLibrarySelection();
  const panelLabel = SIDEBAR_PANELS.find((item) => item.id === panel)?.label ?? "Library";
  const showFoldersToggle = Boolean(onToggle && !foldersVisible);

  return (
    <div className={cn("relative flex h-full w-full flex-col select-none", mobile ? "app-sidebar-surface" : "bg-bg-secondary")}>
      {mobile ? (
        <div className="app-chrome flex h-14 shrink-0 items-center justify-between px-3">
          <span className="text-sm font-semibold tracking-[-0.012em] text-text">{panelLabel}</span>
          {onClose && (
            <IconButton
              size="xl"
              variant="ghost"
              onClick={onClose}
              aria-label="Close library"
              className="!h-11 !w-11 rounded-xl"
            >
              <XIcon />
            </IconButton>
          )}
        </div>
      ) : showFoldersToggle ? (
        <div
          className={cn(
            "app-titlebar flex h-11 shrink-0 items-center gap-1 px-2",
            isMac && "pl-20",
          )}
          data-tauri-drag-region
        >
          <div className="titlebar-no-drag flex min-w-0 items-center gap-px" data-tauri-drag-region="false">
            <IconButton size="sm" title="Show folders" onClick={onToggle} aria-expanded={false}>
              <PanelToggleIcon side="left" open={false} />
            </IconButton>
          </div>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col bg-bg-secondary">
        <div className="min-h-0 flex-1">
          <NoteList
            filter={
              (scope?.type ?? panel) === "journal" ? "journal" : "all"
            }
            folderPath={scope?.type === "folder" ? scope.path : null}
            showEmptyCanvas={mobile}
            multiSelectedNoteIds={selectedNoteIds}
            setMultiSelectedNoteIds={setSelectedNoteIds}
            lastClickedNoteId={lastClickedNoteId}
            setLastClickedNoteId={setLastClickedNoteId}
          />
        </div>
      </div>
    </div>
  );
}

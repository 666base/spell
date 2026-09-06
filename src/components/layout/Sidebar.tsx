import { NoteList } from "../notes/NoteList";
import { IconButton } from "../ui";
import {
  XIcon,
} from "../icons/velocity";
import { isMac } from "../../lib/platform";
import { windowDragRegionProps } from "../../lib/windowDrag";
import { isMoneyTab, isProjectsTab, type NotesScope } from "../../lib/notesScope";
import { useLibrarySelection } from "./LibraryDnd";
import { ProjectList } from "../kanban/ProjectList";
import { MoneyList } from "../finance/MoneyList";

export type SidebarPanel = "notes" | "journal";

interface SidebarProps {
  panel: SidebarPanel;
  onSelectPanel: (panel: SidebarPanel) => void;
  onClose?: () => void;
  foldersVisible?: boolean;
  scope?: NotesScope;
  onSelectScope?: (scope: NotesScope) => void;
  mobile?: boolean;
}

export function Sidebar({
  panel,
  onClose,
  foldersVisible = true,
  scope,
  onSelectScope,
  mobile = false,
}: SidebarProps) {
  const {
    selectedNoteIds,
    setSelectedNoteIds,
    lastClickedNoteId,
    setLastClickedNoteId,
  } = useLibrarySelection();
  const current = scope ?? { type: "all" as const };
  const listLabel = isProjectsTab(current)
    ? "Projects"
    : isMoneyTab(current)
      ? "Money"
      : panel === "journal"
        ? "Journal"
        : "Notes";

  return (
    <div className="app-sidebar-surface relative flex h-full w-full flex-col select-none">
      {mobile ? (
        <div className="app-chrome flex h-14 shrink-0 items-center justify-between px-3">
          <span className="text-sm font-semibold tracking-[-0.012em] text-text">{listLabel}</span>
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
      ) : isMac && !foldersVisible ? (
        <div
          className="app-titlebar folder-titlebar"
          {...windowDragRegionProps}
        />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {isProjectsTab(current) ? (
            <ProjectList
              selectedId={current.type === "project" ? current.id : null}
              overviewSelected={current.type === "projects"}
              onSelect={(id) => onSelectScope?.({ type: "project", id })}
              onSelectOverview={() => onSelectScope?.({ type: "projects" })}
              onCreated={(id) => onSelectScope?.({ type: "project", id })}
              onDeletedSelected={() => onSelectScope?.({ type: "projects" })}
            />
          ) : isMoneyTab(current) ? (
            <MoneyList
              scope={current}
              onSelect={(next) => onSelectScope?.(next)}
            />
          ) : (
            <NoteList
              filter={
                (current.type === "journal" ? "journal" : "all")
              }
              folderPath={current.type === "folder" ? current.path : null}
              showEmptyCanvas={mobile}
              multiSelectedNoteIds={selectedNoteIds}
              setMultiSelectedNoteIds={setSelectedNoteIds}
              lastClickedNoteId={lastClickedNoteId}
              setLastClickedNoteId={setLastClickedNoteId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

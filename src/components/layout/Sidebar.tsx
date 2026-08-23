import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useNotes } from "../../context/NotesContext";
import { NoteList } from "../notes/NoteList";
import { ProjectList } from "../kanban/ProjectList";
import { MoneyList } from "../finance/MoneyList";
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
import { isMoneyTab, isProjectsTab } from "../../lib/notesScope";
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
  onSelectScope?: (scope: NotesScope) => void;
  onOpenSettings?: () => void;
  mobile?: boolean;
}

export function Sidebar({
  panel,
  onClose,
  onToggle,
  foldersVisible = true,
  scope,
  onSelectScope,
  mobile = false,
}: SidebarProps) {
  const {
    moveNote,
    moveFolder,
  } = useNotes();
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [dragCount, setDragCount] = useState(1);
  const [multiSelectedNoteIds, setMultiSelectedNoteIds] = useState<Set<string>>(new Set());
  const [lastClickedNoteId, setLastClickedNoteId] = useState<string | null>(null);
  const multiSelectedRef = useRef(multiSelectedNoteIds);
  const panelLabel = SIDEBAR_PANELS.find((item) => item.id === panel)?.label ?? "Library";

  useEffect(() => {
    multiSelectedRef.current = multiSelectedNoteIds;
  }, [multiSelectedNoteIds]);

  // dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // A short delay keeps a tap selecting a note while still making a
    // deliberate long-press drag possible on phones and tablets.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "note") {
      const noteId = data.id as string;
      const leaf = noteId.includes("/")
        ? noteId.substring(noteId.lastIndexOf("/") + 1)
        : noteId;
      setDragLabel(leaf);

      // Multi-select: if dragged note is in selection, drag all; otherwise reset
      const selected = multiSelectedRef.current!;
      if (selected.has(noteId) && selected.size > 1) {
        setDragCount(selected.size);
      } else {
        setMultiSelectedNoteIds(new Set([noteId]));
        setDragCount(1);
      }
    } else if (data?.type === "folder") {
      const path = data.path as string;
      const name = path.includes("/")
        ? path.substring(path.lastIndexOf("/") + 1)
        : path;
      setDragLabel(name);
      setDragCount(1);
    }
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setDragLabel(null);
      setDragCount(1);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current;
      const overData = over.data.current;
      if (!activeData || !overData) return;



      const targetFolder = overData.path as string;

      try {
        if (activeData.type === "note") {
          const noteId = activeData.id as string;
          const selected = multiSelectedRef.current!;

          // Batch move if multi-selected
          if (selected.has(noteId) && selected.size > 1) {
            const noteIds = Array.from(selected).filter((id) => {
              const parent = id.includes("/")
                ? id.substring(0, id.lastIndexOf("/"))
                : "";
              return parent !== targetFolder;
            });
            if (noteIds.length === 0) return;
            let failures = 0;
            for (const id of noteIds) {
              try {
                await moveNote(id, targetFolder);
              } catch {
                failures++;
              }
            }
            if (failures > 0) {
              toast.error(`Failed to move ${failures} note(s)`);
            }
            setMultiSelectedNoteIds(new Set());
          } else {
            const noteParent = noteId.includes("/")
              ? noteId.substring(0, noteId.lastIndexOf("/"))
              : "";
            if (noteParent === targetFolder) return;
            await moveNote(noteId, targetFolder);
            setMultiSelectedNoteIds(new Set());
          }
        } else if (activeData.type === "folder") {
          const folderPath = activeData.path as string;
          if (
            targetFolder === folderPath ||
            targetFolder.startsWith(folderPath + "/")
          )
            return;
          const folderParent = folderPath.includes("/")
            ? folderPath.substring(0, folderPath.lastIndexOf("/"))
            : "";
          if (folderParent === targetFolder) return;
          await moveFolder(folderPath, targetFolder);
        }

        // Expand target folder so the moved item is visible
        if (targetFolder) {
          window.dispatchEvent(
            new CustomEvent("expand-folder", { detail: targetFolder }),
          );
        }
      } catch (error) {
        console.error("Failed to move item:", error);
        toast.error("Failed to move item");
      }
    },
    [moveNote, moveFolder],
  );

  const showFoldersToggle = Boolean(onToggle && !foldersVisible);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragLabel(null)}
    >
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
          {scope && isMoneyTab(scope) && onSelectScope ? (
            <MoneyList scope={scope} onSelect={onSelectScope} />
          ) : scope && isProjectsTab(scope) && onSelectScope ? (
            <ProjectList
              selectedId={scope?.type === "project" ? scope.id : null}
              overviewSelected={scope?.type === "projects"}
              onSelect={(id) => onSelectScope({ type: "project", id })}
              onSelectOverview={() => onSelectScope({ type: "projects" })}
              onCreated={(id) => onSelectScope({ type: "project", id })}
              onDeletedSelected={() => onSelectScope({ type: "projects" })}
            />
          ) : (
          <NoteList
            filter={
              (scope?.type ?? panel) === "journal" ? "journal" : "all"
            }
            folderPath={scope?.type === "folder" ? scope.path : null}
            showEmptyCanvas={mobile}
            multiSelectedNoteIds={multiSelectedNoteIds}
              setMultiSelectedNoteIds={setMultiSelectedNoteIds}
              lastClickedNoteId={lastClickedNoteId}
              setLastClickedNoteId={setLastClickedNoteId}
            />
          )}
        </div>
      </div>

    </div>

    {/* Drag overlay — floating label while dragging */}
    <DragOverlay dropAnimation={null}>
      {dragLabel && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bg border border-border rounded-md text-sm text-text">
          <NoteIcon className="w-3.5 h-3.5 stroke-[1.6] opacity-50 shrink-0" />
          {dragLabel}
          {dragCount > 1 && (
            <span className="ml-1 px-1.5 py-0.5 bg-accent text-text-inverse text-xs rounded-full leading-none">
              +{dragCount - 1}
            </span>
          )}
        </div>
      )}
    </DragOverlay>
    </DndContext>
  );
}

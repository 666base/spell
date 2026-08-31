import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import {
  LIBRARY_FOLDER_REORDER,
  LIBRARY_NOTE_REORDER,
  dropModeFor,
  folderParentPath,
  isInsideFolder,
  leafName,
  libraryCollision,
  noteParentFolder,
  parseLibraryId,
  pointerYFromDrag,
  type DropMode,
  type LibraryItemType,
} from "../../lib/libraryDnd";
import { FolderGlyph } from "../ui";

interface LibrarySelection {
  selectedNoteIds: Set<string>;
  setSelectedNoteIds: Dispatch<SetStateAction<Set<string>>>;
  lastClickedNoteId: string | null;
  setLastClickedNoteId: Dispatch<SetStateAction<string | null>>;
  selectedNoteIdsRef: React.MutableRefObject<Set<string>>;
}

interface LibraryDropState {
  overId: string | null;
  activeId: string | null;
  mode: DropMode | null;
  activeType: LibraryItemType | null;
}

const SelectionContext = createContext<LibrarySelection | null>(null);
const DropContext = createContext<LibraryDropState>({
  overId: null,
  activeId: null,
  mode: null,
  activeType: null,
});

export function useLibrarySelection() {
  const value = useContext(SelectionContext);
  if (!value) {
    throw new Error("useLibrarySelection must be used inside LibraryDnd");
  }
  return value;
}

export function useLibraryDropState() {
  return useContext(DropContext);
}

export function LibraryDnd({ children }: { children: ReactNode }) {
  const { moveNote, moveFolder, selectedNoteId } = useNotes();
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [lastClickedNoteId, setLastClickedNoteId] = useState<string | null>(null);
  const selectedNoteIdsRef = useRef(selectedNoteIds);
  selectedNoteIdsRef.current = selectedNoteIds;

  const [overlay, setOverlay] = useState<{
    type: LibraryItemType;
    label: string;
    preview?: string;
    meta?: string;
    count: number;
  } | null>(null);
  const [dropState, setDropState] = useState<LibraryDropState>({
    overId: null,
    activeId: null,
    mode: null,
    activeType: null,
  });
  const dropModeRef = useRef<DropMode>("into");
  const expandTimer = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const selection = useMemo(
    () => ({
      selectedNoteIds,
      setSelectedNoteIds,
      lastClickedNoteId,
      setLastClickedNoteId,
      selectedNoteIdsRef,
    }),
    [lastClickedNoteId, selectedNoteIds],
  );

  useEffect(() => {
    setSelectedNoteIds((previous) => {
      if (!selectedNoteId) {
        return previous.size === 0 ? previous : new Set();
      }
      if (previous.size > 1 && previous.has(selectedNoteId)) {
        return previous;
      }
      if (previous.size === 1 && previous.has(selectedNoteId)) {
        return previous;
      }
      return new Set([selectedNoteId]);
    });
  }, [selectedNoteId]);

  useEffect(() => {
    if (!overlay) {
      delete document.documentElement.dataset.libraryDragging;
      delete document.documentElement.dataset.libraryActiveId;
      return;
    }
    document.documentElement.dataset.libraryDragging = overlay.type;
    return () => {
      delete document.documentElement.dataset.libraryDragging;
      delete document.documentElement.dataset.libraryActiveId;
    };
  }, [overlay]);

  const clearExpandTimer = () => {
    window.clearTimeout(expandTimer.current);
    expandTimer.current = 0;
  };

  const updateDrop = useCallback((event: DragMoveEvent | DragEndEvent) => {
    const active = parseLibraryId(event.active.id);
    const over = parseLibraryId(event.over?.id);
    const activeType: LibraryItemType | null =
      active?.kind === "note" || active?.kind === "folder" ? active.kind : null;
    const overId = event.over ? String(event.over.id) : null;
    const mode =
      !activeType || !over
        ? null
        : dropModeFor({
            activeType,
            overKind: over.kind,
            overPath: over.kind === "folder" ? over.path : undefined,
            activePath: active?.kind === "folder" ? active.path : undefined,
            pointerY: pointerYFromDrag(event),
            overRect: event.over?.rect ?? null,
          });
    dropModeRef.current = mode ?? "into";
    setDropState({
      overId,
      activeId: String(event.active.id),
      mode,
      activeType,
    });

    clearExpandTimer();
    if (over?.kind !== "folder" || !over.path) return;
    if (active?.kind === "folder" && over.path === active.path) return;
    expandTimer.current = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("expand-folder", { detail: over.path }));
    }, 450);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const parsed = parseLibraryId(event.active.id);
    const data = event.active.data.current;
    const activeId = String(event.active.id);
    document.documentElement.dataset.libraryActiveId = activeId;
    const activeType: LibraryItemType | null =
      parsed?.kind === "note" || parsed?.kind === "folder" ? parsed.kind : null;
    setDropState({
      overId: null,
      activeId,
      mode: null,
      activeType,
    });

    if (parsed?.kind === "note") {
      const selected = selectedNoteIdsRef.current;
      const count = selected.has(parsed.id) && selected.size > 1 ? selected.size : 1;
      if (!selected.has(parsed.id)) {
        setSelectedNoteIds(new Set([parsed.id]));
      }
      setOverlay({
        type: "note",
        label: (data?.label as string) || leafName(parsed.id),
        preview: (data?.preview as string | undefined) || undefined,
        meta: (data?.meta as string | undefined) || undefined,
        count,
      });
    } else if (parsed?.kind === "folder") {
      setOverlay({
        type: "folder",
        label: (data?.label as string) || leafName(parsed.path),
        count: 1,
      });
    }
  }, []);

  const resetDrag = useCallback(() => {
    setOverlay(null);
    setDropState({ overId: null, activeId: null, mode: null, activeType: null });
    dropModeRef.current = "into";
    clearExpandTimer();
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const mode = dropModeRef.current;
      resetDrag();
      const active = parseLibraryId(event.active.id);
      const over = parseLibraryId(event.over?.id);
      if (!active || !over) return;
      if (active.kind === "note" && active.id.startsWith("journals/")) return;

      try {
        if (active.kind === "note") {
          if (over.kind === "note") {
            window.dispatchEvent(
              new CustomEvent(LIBRARY_NOTE_REORDER, {
                detail: { fromId: active.id, toId: over.id },
              }),
            );
            return;
          }

          const targetFolder = over.kind === "folder" ? over.path : "";
          const selected = selectedNoteIdsRef.current;
          const ids =
            selected.has(active.id) && selected.size > 1
              ? Array.from(selected)
              : [active.id];
          const moving = ids.filter(
            (id) => !id.startsWith("journals/") && noteParentFolder(id) !== targetFolder,
          );
          if (moving.length === 0) return;
          let failures = 0;
          for (const id of moving) {
            try {
              await moveNote(id, targetFolder);
            } catch {
              failures += 1;
            }
          }
          if (failures > 0) {
            toast.error(`Failed to move ${failures} note${failures === 1 ? "" : "s"}`);
          }
          setSelectedNoteIds(new Set());
          if (targetFolder) {
            window.dispatchEvent(new CustomEvent("expand-folder", { detail: targetFolder }));
          }
          return;
        }

        if (active.kind !== "folder") return;
        const targetFolder =
          over.kind === "folder"
            ? over.path
            : over.kind === "root"
              ? ""
              : noteParentFolder(over.id);
        if (
          over.kind === "folder" &&
          (mode === "before" || mode === "after") &&
          isTopLevelPair(active.path, over.path)
        ) {
          window.dispatchEvent(
            new CustomEvent(LIBRARY_FOLDER_REORDER, {
              detail: { from: active.path, to: over.path, mode },
            }),
          );
          return;
        }
        if (targetFolder === active.path || isInsideFolder(targetFolder, active.path)) return;
        if (folderParentPath(active.path) === targetFolder) return;
        await moveFolder(active.path, targetFolder);
        if (targetFolder) {
          window.dispatchEvent(new CustomEvent("expand-folder", { detail: targetFolder }));
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to move item");
      }
    },
    [moveFolder, moveNote, resetDrag],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={libraryCollision}
      onDragStart={handleDragStart}
      onDragMove={updateDrop}
      onDragEnd={handleDragEnd}
      onDragCancel={resetDrag}
    >
      <SelectionContext.Provider value={selection}>
        <DropContext.Provider value={dropState}>{children}</DropContext.Provider>
      </SelectionContext.Provider>
      <DragOverlay dropAnimation={null}>
        {overlay?.type === "note" ? (
          <div className="library-drag-note-row">
            <div className="note-row note-row-selected w-full rounded-[8px] px-3 py-[9px] text-left select-none">
              <div className="note-row-title-line">
                <span className="note-row-title">{overlay.label}</span>
              </div>
              {(overlay.meta || overlay.preview) && (
                <p className="note-row-meta-line">
                  {overlay.meta && <span className="note-row-date">{overlay.meta}</span>}
                  {overlay.preview && (
                    <span className="note-row-preview">{overlay.preview}</span>
                  )}
                </p>
              )}
            </div>
            {overlay.count > 1 && (
              <span className="library-drag-count">{overlay.count}</span>
            )}
          </div>
        ) : overlay?.type === "folder" ? (
          <div className="library-drag-overlay">
            <FolderGlyph className="size-4" />
            <span className="min-w-0 truncate">{overlay.label}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function isTopLevelPair(from: string, to: string) {
  return !from.includes("/") && !to.includes("/");
}

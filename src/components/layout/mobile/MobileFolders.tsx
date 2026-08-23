import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useNotes } from "../../../context/NotesContext";
import {
  buildFolderTree,
  countNotesInFolder,
} from "../../../lib/folderTree";
import { notesInScope } from "../../../lib/notesScope";
import { cleanTitle } from "../../../lib/utils";
import * as notesService from "../../../services/notes";
import type { FolderNode, NoteMetadata } from "../../../types/note";
import {
  folderItemId,
  loadSidebarLibrary,
  noteItemId,
  orderFolders,
  saveSidebarLibrary,
  toggleListValue,
  type SidebarLibrary,
} from "../../../lib/sidebarLibrary";
import { FolderGlyph } from "../../ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui";
import {
  BookIcon,
  NoteIcon,
  PinIcon,
  SettingsIcon,
} from "../../icons/velocity";
import { FolderNameDialog } from "../../notes/FolderNameDialog";
import {
  ComposeIcon,
  FolderPlusGlyph,
  MobileNavBar,
  MobileScreen,
  MobileScroll,
  MobileTintButton,
} from "./MobileChrome";

interface MobileFoldersProps {
  onOpenNote: () => void;
  onOpenJournal: () => void;
  onOpenSettings: () => void;
  onCompose: () => void;
}

type SheetTarget =
  | { kind: "folder"; path: string; name: string }
  | { kind: "note"; id: string; name: string };

function pinKey(target: SheetTarget) {
  return target.kind === "folder" ? folderItemId(target.path) : noteItemId(target.id);
}

function findFolder(folders: FolderNode[], path: string): FolderNode | undefined {
  for (const folder of folders) {
    if (folder.path === path) return folder;
    const nested = findFolder(folder.children, path);
    if (nested) return nested;
  }
}

function useLongPress(onOpen: () => void, onClick: () => void) {
  const timerRef = useRef(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const openedRef = useRef(false);

  const clear = () => {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
  };

  return {
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      openedRef.current = false;
      startRef.current = { x: event.clientX, y: event.clientY };
      clear();
      timerRef.current = window.setTimeout(() => {
        openedRef.current = true;
        onOpen();
      }, 420);
    },
    onPointerMove: (event: ReactPointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      if (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8) {
        clear();
        startRef.current = null;
      }
    },
    onPointerUp: () => {
      const start = startRef.current;
      startRef.current = null;
      clear();
      if (start && !openedRef.current) onClick();
    },
    onPointerCancel: () => {
      startRef.current = null;
      clear();
    },
    onContextMenu: (event: ReactMouseEvent) => {
      event.preventDefault();
    },
  };
}

function FolderBlock({
  folder,
  depth,
  expanded,
  pinnedNoteIds,
  pinnedFolderIds,
  onToggle,
  onOpenNote,
  onOpenSheet,
}: {
  folder: FolderNode;
  depth: number;
  expanded: Set<string>;
  pinnedNoteIds: Set<string>;
  pinnedFolderIds: Set<string>;
  onToggle: (path: string) => void;
  onOpenNote: (id: string) => void;
  onOpenSheet: (target: SheetTarget) => void;
}) {
  const open = expanded.has(folder.path);
  const press = useLongPress(
    () => onOpenSheet({ kind: "folder", path: folder.path, name: folder.name }),
    () => onToggle(folder.path),
  );

  return (
    <>
      <button
        type="button"
        className="mobile-folder-row"
        style={{ paddingLeft: `${16 + depth * 20}px` }}
        {...press}
      >
        <span className="mobile-folder-icon">
          <FolderGlyph open={open} />
        </span>
        <span className="mobile-folder-label">{folder.name}</span>
        {pinnedFolderIds.has(folderItemId(folder.path)) && (
          <PinIcon className="mobile-folder-pin" />
        )}
        <span className="mobile-folder-count">{countNotesInFolder(folder)}</span>
      </button>
      {open &&
        folder.children.map((child) => (
          <FolderBlock
            key={child.path}
            folder={child}
            depth={depth + 1}
            expanded={expanded}
            pinnedNoteIds={pinnedNoteIds}
            pinnedFolderIds={pinnedFolderIds}
            onToggle={onToggle}
            onOpenNote={onOpenNote}
            onOpenSheet={onOpenSheet}
          />
        ))}
      {open &&
        folder.notes.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            depth={depth + 1}
            pinned={pinnedNoteIds.has(note.id)}
            onOpenNote={onOpenNote}
            onOpenSheet={onOpenSheet}
          />
        ))}
    </>
  );
}

function NoteRow({
  note,
  depth,
  pinned,
  onOpenNote,
  onOpenSheet,
}: {
  note: NoteMetadata;
  depth: number;
  pinned: boolean;
  onOpenNote: (id: string) => void;
  onOpenSheet: (target: SheetTarget) => void;
}) {
  const press = useLongPress(
    () => onOpenSheet({ kind: "note", id: note.id, name: cleanTitle(note.title) }),
    () => onOpenNote(note.id),
  );

  return (
    <button
      type="button"
      className="mobile-folder-row"
      style={{ paddingLeft: `${16 + depth * 20}px` }}
      {...press}
    >
      <span className="mobile-folder-icon">
        <NoteIcon />
      </span>
      <span className="mobile-folder-label">{cleanTitle(note.title)}</span>
      {pinned && <PinIcon className="mobile-folder-pin" />}
    </button>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mobile-group">
      {title && <h2 className="mobile-group-title">{title}</h2>}
      <div className="mobile-group-card">{children}</div>
    </section>
  );
}

function ActionSheet({
  target,
  pinned,
  onClose,
  onPin,
  onNewNote,
  onNewFolder,
  onDelete,
}: {
  target: SheetTarget;
  pinned: boolean;
  onClose: () => void;
  onPin: () => void;
  onNewNote?: () => void;
  onNewFolder?: () => void;
  onDelete: () => void;
}) {
  return createPortal(
    <div className="mobile-action-layer" onClick={onClose} data-pager-ignore>
      <div
        className="mobile-action-sheet"
        role="dialog"
        aria-label={target.name}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="mobile-drawer-handle" aria-hidden />
        <p className="mobile-action-title">{target.name}</p>
        <button type="button" className="mobile-action-item" onClick={onPin}>
          {pinned ? "Unpin" : "Pin"}
        </button>
        {onNewNote && (
          <button type="button" className="mobile-action-item" onClick={onNewNote}>
            New Note
          </button>
        )}
        {onNewFolder && (
          <button type="button" className="mobile-action-item" onClick={onNewFolder}>
            New Folder
          </button>
        )}
        <button type="button" className="mobile-action-item is-danger" onClick={onDelete}>
          Delete
        </button>
        <button type="button" className="mobile-action-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function MobileFolders({
  onOpenNote,
  onOpenJournal,
  onOpenSettings,
  onCompose,
}: MobileFoldersProps) {
  const {
    notes,
    createFolder,
    createNoteInFolder,
    selectNote,
    pinNote,
    unpinNote,
    deleteNote,
    deleteFolder,
  } = useNotes();
  const [knownFolders, setKnownFolders] = useState<string[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [library, setLibrary] = useState<SidebarLibrary>(loadSidebarLibrary);
  const [pinnedNoteIds, setPinnedNoteIds] = useState<string[]>([]);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [deleting, setDeleting] = useState<SheetTarget | null>(null);

  const persistLibrary = useCallback((next: SidebarLibrary) => {
    setLibrary(next);
    saveSidebarLibrary(next);
  }, []);

  const refreshFolders = useCallback(() => {
    notesService
      .listFolders()
      .then(setKnownFolders)
      .catch(() => setKnownFolders([]));
  }, []);

  const refreshPins = useCallback(() => {
    notesService
      .getSettings()
      .then((settings) => setPinnedNoteIds(settings.pinnedNoteIds || []))
      .catch(() => setPinnedNoteIds([]));
  }, []);

  useEffect(() => {
    refreshFolders();
    refreshPins();
  }, [notes, refreshFolders, refreshPins]);

  const pinnedNoteSet = useMemo(() => new Set(pinnedNoteIds), [pinnedNoteIds]);
  const pinnedFolderIds = useMemo(() => new Set(library.pinned), [library.pinned]);

  const tree = useMemo(() => {
    const filteredNotes = notes.filter((note) => !note.id.startsWith("journals/"));
    const filteredFolders = knownFolders.filter((folder) => !folder.startsWith("journals"));
    const pinned = new Set([
      ...pinnedNoteIds,
      ...library.pinned.map((id) => id.replace(/^folder:/, "")),
    ]);
    return buildFolderTree(filteredNotes, pinned, filteredFolders);
  }, [knownFolders, library.pinned, notes, pinnedNoteIds]);

  const folders = tree.folders.filter((folder) => folder.path !== "journals");
  const journalCount = notesInScope(notes, { type: "journal" }).length;
  const expanded = useMemo(() => new Set(library.expandedFolders), [library.expandedFolders]);

  const pinOrder = useMemo(() => {
    const fallback = [
      ...library.pinned,
      ...pinnedNoteIds.map((id) => noteItemId(id)),
    ];
    return orderFolders(fallback, library.pinOrder);
  }, [library.pinOrder, library.pinned, pinnedNoteIds]);

  const pinnedItems = useMemo(() => {
    const notesById = new Map(notes.map((note) => [note.id, note]));
    const items: Array<
      { kind: "folder"; folder: FolderNode } | { kind: "note"; note: NoteMetadata }
    > = [];
    for (const key of pinOrder) {
      if (key.startsWith("folder:")) {
        const folder = findFolder(folders, key.slice("folder:".length));
        if (folder) items.push({ kind: "folder", folder });
        continue;
      }
      if (key.startsWith("note:")) {
        const note = notesById.get(key.slice("note:".length));
        if (note && !note.id.startsWith("journals/")) items.push({ kind: "note", note });
      }
    }
    return items;
  }, [folders, notes, pinOrder]);

  const restItems = useMemo(() => {
    const folderKeys = orderFolders(
      folders.map((folder) => folder.path),
      library.folderOrder,
    ).map((path) => folderItemId(path));
    const noteKeys = tree.rootNotes.map((note) => noteItemId(note.id));
    const keys = orderFolders([...folderKeys, ...noteKeys], library.itemOrder);
    const pinned = new Set(pinOrder);
    const byKey = new Map<string, { kind: "folder"; folder: FolderNode } | { kind: "note"; note: NoteMetadata }>();
    for (const folder of folders) byKey.set(folderItemId(folder.path), { kind: "folder", folder });
    for (const note of tree.rootNotes) byKey.set(noteItemId(note.id), { kind: "note", note });
    return keys.flatMap((key) => {
      if (pinned.has(key)) return [];
      const item = byKey.get(key);
      return item ? [item] : [];
    });
  }, [folders, library.folderOrder, library.itemOrder, pinOrder, tree.rootNotes]);

  const handleOpenNote = useCallback(
    (id: string) => {
      void selectNote(id);
      onOpenNote();
    },
    [onOpenNote, selectNote],
  );

  const toggle = useCallback(
    (path: string) => {
      persistLibrary({
        ...library,
        expandedFolders: toggleListValue(library.expandedFolders, path),
      });
    },
    [library, persistLibrary],
  );

  const handleCreateFolder = useCallback(
    async (name: string) => {
      const parent = creating ?? "";
      try {
        await createFolder(parent, name);
        if (parent) {
          persistLibrary({
            ...library,
            expandedFolders: library.expandedFolders.includes(parent)
              ? library.expandedFolders
              : [...library.expandedFolders, parent],
          });
        }
        setCreating(null);
        refreshFolders();
      } catch (error) {
        console.error(error);
        toast.error("Failed to create folder");
      }
    },
    [createFolder, creating, library, persistLibrary, refreshFolders],
  );

  const sheetPinned = Boolean(sheet && pinOrder.includes(pinKey(sheet)));

  const handlePin = useCallback(async () => {
    if (!sheet) return;
    const key = pinKey(sheet);
    const already = pinOrder.includes(key);
    try {
      if (sheet.kind === "folder") {
        persistLibrary({
          ...library,
          pinned: already
            ? library.pinned.filter((id) => id !== key)
            : [key, ...library.pinned.filter((id) => id !== key)],
          pinOrder: already
            ? library.pinOrder.filter((id) => id !== key)
            : [key, ...library.pinOrder.filter((id) => id !== key)],
        });
      } else if (already) {
        persistLibrary({
          ...library,
          pinOrder: library.pinOrder.filter((id) => id !== key),
        });
        await unpinNote(sheet.id);
        refreshPins();
      } else {
        persistLibrary({
          ...library,
          pinOrder: [key, ...library.pinOrder.filter((id) => id !== key)],
        });
        await pinNote(sheet.id);
        refreshPins();
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update pin");
    }
    setSheet(null);
  }, [library, persistLibrary, pinNote, pinOrder, refreshPins, sheet, unpinNote]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleting) return;
    try {
      if (deleting.kind === "folder") await deleteFolder(deleting.path);
      else await deleteNote(deleting.id);
      persistLibrary({
        ...library,
        pinned: library.pinned.filter((id) => id !== pinKey(deleting)),
        pinOrder: library.pinOrder.filter((id) => id !== pinKey(deleting)),
      });
      refreshFolders();
      refreshPins();
    } catch (error) {
      console.error(error);
      toast.error(deleting.kind === "folder" ? "Failed to delete folder" : "Failed to delete note");
    }
    setDeleting(null);
  }, [deleteFolder, deleteNote, deleting, library, persistLibrary, refreshFolders, refreshPins]);

  const renderItem = (
    item: { kind: "folder"; folder: FolderNode } | { kind: "note"; note: NoteMetadata },
  ) => {
    if (item.kind === "folder") {
      return (
        <FolderBlock
          key={item.folder.path}
          folder={item.folder}
          depth={0}
          expanded={expanded}
          pinnedNoteIds={pinnedNoteSet}
          pinnedFolderIds={pinnedFolderIds}
          onToggle={toggle}
          onOpenNote={handleOpenNote}
          onOpenSheet={setSheet}
        />
      );
    }
    return (
      <NoteRow
        key={item.note.id}
        note={item.note}
        depth={0}
        pinned={pinnedNoteSet.has(item.note.id)}
        onOpenNote={handleOpenNote}
        onOpenSheet={setSheet}
      />
    );
  };

  return (
    <MobileScreen className="mobile-folders">
      <MobileNavBar
        leading={
          <MobileTintButton title="Settings" onClick={onOpenSettings}>
            <SettingsIcon />
          </MobileTintButton>
        }
        trailing={
          <>
            <MobileTintButton title="New Folder" onClick={() => setCreating("")}>
              <FolderPlusGlyph />
            </MobileTintButton>
            <MobileTintButton title="New Note" onClick={onCompose}>
              <ComposeIcon />
            </MobileTintButton>
          </>
        }
      />
      <MobileScroll edgeEnd>
        {pinnedItems.length > 0 && (
          <Group>{pinnedItems.map((item) => renderItem(item))}</Group>
        )}
        <Group>
          <button type="button" className="mobile-folder-row" onClick={onOpenJournal}>
            <span className="mobile-folder-icon">
              <BookIcon />
            </span>
            <span className="mobile-folder-label">Journal</span>
            <span className="mobile-folder-count">{journalCount}</span>
          </button>
        </Group>
        {restItems.length > 0 && (
          <Group>{restItems.map((item) => renderItem(item))}</Group>
        )}
      </MobileScroll>
      <FolderNameDialog
        open={creating !== null}
        onOpenChange={(open) => {
          if (!open) setCreating(null);
        }}
        onConfirm={(name) => {
          void handleCreateFolder(name);
        }}
        title={creating ? "New Folder" : "Create New Folder"}
        description={creating ? `Inside “${creating.split("/").pop()}”` : "Enter a name for your new folder"}
      />
      {sheet && (
        <ActionSheet
          target={sheet}
          pinned={sheetPinned}
          onClose={() => setSheet(null)}
          onPin={() => {
            void handlePin();
          }}
          onNewNote={
            sheet.kind === "folder"
              ? () => {
                  const path = sheet.path;
                  setSheet(null);
                  void createNoteInFolder(path).then(() => onOpenNote());
                }
              : undefined
          }
          onNewFolder={
            sheet.kind === "folder"
              ? () => {
                  setCreating(sheet.path);
                  setSheet(null);
                }
              : undefined
          }
          onDelete={() => {
            setDeleting(sheet);
            setSheet(null);
          }}
        />
      )}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting?.kind === "folder" ? "Delete folder?" : "Delete note?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.kind === "folder"
                ? `“${deleting.name}” and all notes inside it will be deleted.`
                : `“${deleting?.name}” will be moved to trash.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteConfirm()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileScreen>
  );
}

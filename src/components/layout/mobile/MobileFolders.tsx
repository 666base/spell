import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useNotes } from "../../../context/NotesContext";
import {
  buildFolderTree,
  countNotesInFolder,
} from "../../../lib/folderTree";
import { notesInScope } from "../../../lib/notesScope";
import { cleanTitle, cn } from "../../../lib/utils";
import * as notesService from "../../../services/notes";
import type { FolderNode, NoteMetadata } from "../../../types/note";
import {
  folderItemId,
  loadSidebarLibrary,
  noteItemId,
  orderFolders,
  revealFolder,
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
  AddNoteIcon,
  BookIcon,
  CheckIcon,
  CheckSquareIcon,
  FolderPlusIcon,
  PinIcon,
  SettingsIcon,
  TrashIcon,
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
import { MobileJournalDrawer } from "./MobileJournalDrawer";
import { useLongPress } from "./useLongPress";

interface MobileFoldersProps {
  onOpenNote: () => void;
  onOpenJournal: () => void;
  onOpenSettings: () => void;
  onCompose: () => void;
}

type SheetTarget =
  | { kind: "folder"; path: string; name: string }
  | { kind: "note"; id: string; name: string };

type DeletingTarget = SheetTarget | { kind: "notes"; ids: string[] };

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

function collectNoteIds(folder: FolderNode): string[] {
  return [...folder.notes.map((note) => note.id), ...folder.children.flatMap(collectNoteIds)];
}

function collectFolderPaths(folder: FolderNode): string[] {
  return [folder.path, ...folder.children.flatMap(collectFolderPaths)];
}

function FolderBlock({
  folder,
  depth,
  collapsed,
  pinnedNoteIds,
  pinnedFolderIds,
  selecting,
  selectedNoteIds,
  onToggle,
  onOpenNote,
  onOpenSheet,
  onToggleSelect,
}: {
  folder: FolderNode;
  depth: number;
  collapsed: Set<string>;
  pinnedNoteIds: Set<string>;
  pinnedFolderIds: Set<string>;
  selecting: boolean;
  selectedNoteIds: Set<string>;
  onToggle: (path: string) => void;
  onOpenNote: (id: string) => void;
  onOpenSheet: (target: SheetTarget) => void;
  onToggleSelect: (id: string) => void;
}) {
  const open = !collapsed.has(folder.path);
  const press = useLongPress(
    () => {
      if (selecting) onToggle(folder.path);
      else onOpenSheet({ kind: "folder", path: folder.path, name: folder.name });
    },
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
            collapsed={collapsed}
            pinnedNoteIds={pinnedNoteIds}
            pinnedFolderIds={pinnedFolderIds}
            selecting={selecting}
            selectedNoteIds={selectedNoteIds}
            onToggle={onToggle}
            onOpenNote={onOpenNote}
            onOpenSheet={onOpenSheet}
            onToggleSelect={onToggleSelect}
          />
        ))}
      {open &&
        folder.notes.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            depth={depth + 1}
            pinned={pinnedNoteIds.has(note.id)}
            selecting={selecting}
            selected={selectedNoteIds.has(note.id)}
            onOpenNote={onOpenNote}
            onOpenSheet={onOpenSheet}
            onToggleSelect={onToggleSelect}
          />
        ))}
    </>
  );
}

function NoteRow({
  note,
  depth,
  pinned,
  selecting,
  selected,
  onOpenNote,
  onOpenSheet,
  onToggleSelect,
}: {
  note: NoteMetadata;
  depth: number;
  pinned: boolean;
  selecting: boolean;
  selected: boolean;
  onOpenNote: (id: string) => void;
  onOpenSheet: (target: SheetTarget) => void;
  onToggleSelect: (id: string) => void;
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
      aria-pressed={selecting ? selected : undefined}
      {...(selecting ? { onClick: () => onToggleSelect(note.id) } : press)}
    >
      {selecting && (
        <span className={cn("mobile-select-mark", selected && "is-on")} aria-hidden="true">
          {selected && <CheckIcon />}
        </span>
      )}
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
  onSelect,
  onSelectNotes,
  onNewNote,
  onNewFolder,
  onDelete,
}: {
  target: SheetTarget;
  pinned: boolean;
  onClose: () => void;
  onPin: () => void;
  onSelect?: () => void;
  onSelectNotes?: () => void;
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
        <p className="mobile-action-title">{target.name}</p>
        <button type="button" className="mobile-action-item" onClick={onPin}>
          <span>{pinned ? "Unpin" : "Pin"}</span>
          <PinIcon aria-hidden="true" />
        </button>
        {onSelect && (
          <button type="button" className="mobile-action-item" onClick={onSelect}>
            <span>Select</span>
            <CheckSquareIcon aria-hidden="true" />
          </button>
        )}
        {onSelectNotes && (
          <button type="button" className="mobile-action-item" onClick={onSelectNotes}>
            <span>Select Notes</span>
            <CheckSquareIcon aria-hidden="true" />
          </button>
        )}
        {onNewNote && (
          <button type="button" className="mobile-action-item" onClick={onNewNote}>
            <span>New Note</span>
            <AddNoteIcon aria-hidden="true" />
          </button>
        )}
        {onNewFolder && (
          <button type="button" className="mobile-action-item" onClick={onNewFolder}>
            <span>New Folder</span>
            <FolderPlusIcon aria-hidden="true" />
          </button>
        )}
        <button type="button" className="mobile-action-item is-danger" onClick={onDelete}>
          <span>Delete</span>
          <TrashIcon aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

export const MobileFolders = memo(function MobileFolders({
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
    deleteNotes,
    deleteFolder,
  } = useNotes();
  const [knownFolders, setKnownFolders] = useState<string[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [library, setLibrary] = useState<SidebarLibrary>(loadSidebarLibrary);
  const [pinnedNoteIds, setPinnedNoteIds] = useState<string[]>([]);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [deleting, setDeleting] = useState<DeletingTarget | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set());
  const [journalDrawerOpen, setJournalDrawerOpen] = useState(false);

  const persistLibrary = useCallback((next: SidebarLibrary) => {
    setLibrary(next);
    saveSidebarLibrary(next);
  }, []);

  useEffect(() => {
    const onExpandFolder = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (!path) return;
      setLibrary((current) => {
        const next = revealFolder(current, path);
        if (next === current) return current;
        saveSidebarLibrary(next);
        return next;
      });
    };
    window.addEventListener("expand-folder", onExpandFolder);
    return () => window.removeEventListener("expand-folder", onExpandFolder);
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
  const collapsed = useMemo(() => new Set(library.collapsedFolders), [library.collapsedFolders]);

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

  const toggleSelect = useCallback((id: string) => {
    setSelectedNoteIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const beginSelect = useCallback((ids: string[] = []) => {
    setSelecting(true);
    setSelectedNoteIds(new Set(ids));
    setSheet(null);
  }, []);

  const exitSelect = useCallback(() => {
    setSelecting(false);
    setSelectedNoteIds(new Set());
  }, []);

  const toggle = useCallback(
    (path: string) => {
      persistLibrary({
        ...library,
        collapsedFolders: toggleListValue(library.collapsedFolders, path),
      });
    },
    [library, persistLibrary],
  );

  const journalPress = useLongPress(
    () => setJournalDrawerOpen(true),
    () => {
      if (!selecting) onOpenJournal();
    },
  );

  const handleCreateFolder = useCallback(
    async (name: string) => {
      const parent = creating ?? "";
      try {
        await createFolder(parent, name);
        if (parent) {
          persistLibrary(revealFolder(library, parent));
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
      else if (deleting.kind === "notes") await deleteNotes(deleting.ids);
      else await deleteNote(deleting.id);
      const removedKeys =
        deleting.kind === "notes"
          ? deleting.ids.map((id) => noteItemId(id))
          : [pinKey(deleting)];
      const removed = new Set(removedKeys);
      persistLibrary({
        ...library,
        pinned: library.pinned.filter((id) => !removed.has(id)),
        pinOrder: library.pinOrder.filter((id) => !removed.has(id)),
      });
      refreshFolders();
      refreshPins();
      if (deleting.kind === "notes") exitSelect();
    } catch (error) {
      console.error(error);
      toast.error(
        deleting.kind === "folder"
          ? "Failed to delete folder"
          : deleting.kind === "notes"
            ? "Failed to delete notes"
            : "Failed to delete note",
      );
    }
    setDeleting(null);
  }, [
    deleteFolder,
    deleteNote,
    deleteNotes,
    deleting,
    exitSelect,
    library,
    persistLibrary,
    refreshFolders,
    refreshPins,
  ]);

  const renderItem = (
    item: { kind: "folder"; folder: FolderNode } | { kind: "note"; note: NoteMetadata },
  ) => {
    if (item.kind === "folder") {
      return (
        <FolderBlock
          key={item.folder.path}
          folder={item.folder}
          depth={0}
          collapsed={collapsed}
          pinnedNoteIds={pinnedNoteSet}
          pinnedFolderIds={pinnedFolderIds}
          selecting={selecting}
          selectedNoteIds={selectedNoteIds}
          onToggle={toggle}
          onOpenNote={handleOpenNote}
          onOpenSheet={setSheet}
          onToggleSelect={toggleSelect}
        />
      );
    }
    return (
      <NoteRow
        key={item.note.id}
        note={item.note}
        depth={0}
        pinned={pinnedNoteSet.has(item.note.id)}
        selecting={selecting}
        selected={selectedNoteIds.has(item.note.id)}
        onOpenNote={handleOpenNote}
        onOpenSheet={setSheet}
        onToggleSelect={toggleSelect}
      />
    );
  };

  return (
    <MobileScreen className="mobile-folders">
      <MobileNavBar
        leading={
          selecting ? (
            <button type="button" className="mobile-nav-action" onClick={exitSelect}>
              Cancel
            </button>
          ) : (
            <MobileTintButton title="Settings" onClick={onOpenSettings}>
              <SettingsIcon />
            </MobileTintButton>
          )
        }
        title={
          selecting
            ? selectedNoteIds.size === 0
              ? "Folders"
              : `${selectedNoteIds.size} Selected`
            : "Folders"
        }
        trailing={
          selecting ? (
            <button
              type="button"
              className="mobile-nav-action is-danger"
              disabled={selectedNoteIds.size === 0}
              onClick={() => setDeleting({ kind: "notes", ids: [...selectedNoteIds] })}
            >
              Delete
            </button>
          ) : (
            <>
              <MobileTintButton title="New Folder" onClick={() => setCreating("")}>
                <FolderPlusGlyph />
              </MobileTintButton>
              <MobileTintButton title="New Note" onClick={onCompose}>
                <ComposeIcon />
              </MobileTintButton>
            </>
          )
        }
      />
      <MobileScroll edgeEnd>
        {pinnedItems.length > 0 && (
          <Group>{pinnedItems.map((item) => renderItem(item))}</Group>
        )}
        <Group>
          <button
            type="button"
            className="mobile-folder-row"
            {...(selecting ? {} : journalPress)}
          >
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
      <MobileJournalDrawer
        open={journalDrawerOpen}
        onClose={() => setJournalDrawerOpen(false)}
        onOpenEntry={onOpenNote}
      />
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
          onSelect={
            sheet.kind === "note"
              ? () => beginSelect([sheet.id])
              : undefined
          }
          onSelectNotes={
            sheet.kind === "folder"
              ? () => {
                  const folder = findFolder(folders, sheet.path);
                  if (!folder) {
                    setSheet(null);
                    return;
                  }
                  const ids = collectNoteIds(folder);
                  if (ids.length === 0) {
                    setSheet(null);
                    return;
                  }
                  persistLibrary({
                    ...library,
                    collapsedFolders: library.collapsedFolders.filter(
                      (path) => !collectFolderPaths(folder).includes(path),
                    ),
                  });
                  beginSelect(ids);
                }
              : undefined
          }
          onNewNote={
            sheet.kind === "folder"
              ? () => {
                  const path = sheet.path;
                  setSheet(null);
                  void createNoteInFolder(path).then((note) => {
                    if (note) onOpenNote();
                  });
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
              {deleting?.kind === "folder"
                ? "Delete folder?"
                : deleting?.kind === "notes"
                  ? `Delete ${deleting.ids.length} ${deleting.ids.length === 1 ? "note" : "notes"}?`
                  : "Delete note?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.kind === "folder"
                ? `“${deleting.name}” and all notes inside it will be deleted.`
                : deleting?.kind === "notes"
                  ? `${deleting.ids.length} ${deleting.ids.length === 1 ? "note" : "notes"} will be moved to trash.`
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
});

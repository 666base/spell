import { useCallback, useMemo, memo, useEffect, useRef, useState, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useNotes } from "../../context/NotesContext";
import {
  ListItem,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui";
import { cleanTitle } from "../../lib/utils";
import * as notesService from "../../services/notes";
import { FolderTreeView } from "./FolderTreeView";
import {
  BookmarkIcon,
  PinIcon,
  CopyIcon,
  TrashIcon,
  MarkdownIcon,
} from "../icons/velocity";
import type { Settings } from "../../types/note";

const menuItemClass = "spell-menu-item cursor-pointer";

const menuSeparatorClass = "spell-menu-separator";

function NotesEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-text-muted select-none">
      <div className="grid place-items-center w-9 h-9 rounded-xl bg-bg-muted text-text-muted/70">
        <MarkdownIcon className="w-4.5 h-4.5 stroke-[1.5]" />
      </div>
      <span>{children}</span>
    </div>
  );
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);

  if (date >= startOfToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (date >= startOfYesterday) {
    return "Yesterday";
  }

  const daysAgo =
    Math.floor((startOfToday.getTime() - date.getTime()) / 86400000) + 1;
  if (daysAgo <= 6) {
    return `${daysAgo} days ago`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Memoized note item component (used in flat list)
interface NoteItemProps {
  id: string;
  title: string;
  preview?: string;
  modified: number;
  isSelected: boolean;
  isPinned: boolean;
  onSelect: (id: string) => void;
  depth?: number;
  showFolderPrefix?: boolean;
}

export const NoteItem = memo(function NoteItem({
  id,
  title,
  preview,
  modified,
  isSelected,
  isPinned,
  onSelect,
  depth,
  showFolderPrefix = true,
}: NoteItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const handleClick = useCallback(() => onSelect(id), [onSelect, id]);

  useEffect(() => {
    if (isSelected) {
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isSelected]);

  const folder =
    showFolderPrefix && id.includes("/")
      ? id.substring(0, id.lastIndexOf("/"))
      : null;
  const displayPreview = folder
    ? preview
      ? `${folder}/ · ${preview}`
      : `${folder}/`
    : preview;

  return (
    <div
      ref={ref}
      style={depth != null ? { paddingLeft: `${depth * 12}px` } : undefined}
    >
      <ListItem
        title={cleanTitle(title)}
        subtitle={displayPreview}
        meta={formatDate(modified)}
        isSelected={isSelected}
        isPinned={isPinned}
        onClick={handleClick}
      />
    </div>
  );
});

// Note item wrapped with Radix context menu
export interface NoteItemWithMenuProps {
  id: string;
  title: string;
  preview?: string;
  modified: number;
  isSelected: boolean;
  isPinned: boolean;
  isBookmarked: boolean;
  onSelect: (id: string) => void;
  onPin: (id: string) => Promise<void>;
  onUnpin: (id: string) => Promise<void>;
  onBookmark: (id: string) => Promise<void>;
  onRemoveBookmark: (id: string) => Promise<void>;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRefreshSettings: () => Promise<void> | void;
}

export const NoteItemWithMenu = memo(function NoteItemWithMenu({
  id,
  title,
  preview,
  modified,
  isSelected,
  isPinned,
  isBookmarked,
  onSelect,
  onPin,
  onUnpin,
  onBookmark,
  onRemoveBookmark,
  onDuplicate,
  onDelete,
  onRefreshSettings,
}: NoteItemWithMenuProps) {
  const handlePin = useCallback(async () => {
    try {
      await (isPinned ? onUnpin(id) : onPin(id));
      await onRefreshSettings();
    } catch (error) {
      console.error("Failed to pin/unpin note:", error);
    }
  }, [id, isPinned, onPin, onUnpin, onRefreshSettings]);

  const handleBookmark = useCallback(async () => {
    try {
      await (isBookmarked ? onRemoveBookmark(id) : onBookmark(id));
      await onRefreshSettings();
    } catch (error) {
      console.error("Failed to add/remove bookmark:", error);
    }
  }, [
    id,
    isBookmarked,
    onBookmark,
    onRemoveBookmark,
    onRefreshSettings,
  ]);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div data-spell-context-menu>
          <NoteItem
            id={id}
            title={title}
            preview={preview}
            modified={modified}
            isSelected={isSelected}
            isPinned={isPinned}
            onSelect={onSelect}
          />
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content data-spell-context-menu className="spell-menu z-50">
          <ContextMenu.Item className={menuItemClass} onSelect={handlePin}>
            <PinIcon className="w-4 h-4 stroke-[1.6]" />
            {isPinned ? "Unpin" : "Pin"}
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} onSelect={handleBookmark}>
            <BookmarkIcon className="w-4 h-4 stroke-[1.6]" />
            {isBookmarked ? "Remove Bookmark" : "Add Bookmark"}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => onDuplicate(id)}
          >
            <CopyIcon className="w-4 h-4 stroke-[1.6]" />
            Duplicate
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={
              menuItemClass + " spell-menu-item-danger"
            }
            onSelect={() => onDelete(id)}
          >
            <TrashIcon className="w-4 h-4 stroke-[1.6]" />
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

interface NoteListProps {
  filter?: "all" | "bookmarked" | "journal";
  multiSelectedNoteIds: Set<string>;
  setMultiSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  lastClickedNoteId: string | null;
  setLastClickedNoteId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function NoteList({
  filter = "all",
  multiSelectedNoteIds,
  setMultiSelectedNoteIds,
  lastClickedNoteId,
  setLastClickedNoteId,
}: NoteListProps) {
  const {
    notes,
    selectedNoteId,
    selectNote,
    deleteNote,
    duplicateNote,
    pinNote,
    unpinNote,
    bookmarkNote,
    removeBookmark,
    isLoading,
    searchQuery,
    searchResults,
  } = useNotes();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load settings when notes change
  useEffect(() => {
    notesService
      .getSettings()
      .then(setSettings)
      .catch((error) => {
        console.error("Failed to load settings:", error);
      });
  }, [notes]);

  // Calculate pinned IDs set for efficient lookup
  const pinnedIds = useMemo(
    () => new Set(settings?.pinnedNoteIds || []),
    [settings]
  );
  const bookmarkedIds = useMemo(
    () => new Set(settings?.bookmarkedNoteIds || []),
    [settings],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (noteToDelete) {
      try {
        await deleteNote(noteToDelete);
        setNoteToDelete(null);
        setDeleteDialogOpen(false);
      } catch (error) {
        console.error("Failed to delete note:", error);
      }
    }
  }, [noteToDelete, deleteNote]);

  const openDeleteDialogForNote = useCallback((noteId: string) => {
    setNoteToDelete(noteId);
    setDeleteDialogOpen(true);
  }, []);

  const refreshSettings = useCallback(() => {
    notesService.getSettings().then(setSettings);
  }, []);

  // Memoize display items to prevent recalculation on every render
  const displayItems = useMemo(() => {
    let items = searchQuery.trim()
      ? searchResults.map((r) => ({
        id: r.id,
        title: r.title,
        preview: r.preview,
        modified: r.modified,
      }))
      : notes;

    if (filter === "journal") {
      return items.filter(n => n.id.startsWith("journals/"));
    }

    // Hide journals from all other views
    items = items.filter(n => !n.id.startsWith("journals/"));

    if (filter !== "bookmarked") return items;

    const itemsById = new Map(items.map((item) => [item.id, item]));
    return (settings?.bookmarkedNoteIds || []).flatMap((id) => {
      const item = itemsById.get(id);
      return item ? [item] : [];
    });
  }, [filter, settings?.bookmarkedNoteIds, searchQuery, searchResults, notes]);

  // Listen for focus request from editor (when Escape is pressed)
  useEffect(() => {
    const handleFocusNoteList = () => {
      containerRef.current?.focus();
    };

    window.addEventListener("focus-note-list", handleFocusNoteList);
    return () =>
      window.removeEventListener("focus-note-list", handleFocusNoteList);
  }, []);

  useEffect(() => {
    const handleRequestDelete = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (!customEvent.detail) return;
      openDeleteDialogForNote(customEvent.detail);
    };

    window.addEventListener("request-delete-note", handleRequestDelete);
    return () =>
      window.removeEventListener("request-delete-note", handleRequestDelete);
  }, [openDeleteDialogForNote]);

  const foldersEnabled = settings?.foldersEnabled === true;
  const isSearching = searchQuery.trim().length > 0;

  if (isLoading && notes.length === 0) {
    return (
      <div className="p-4 text-center text-text-muted select-none">
        Loading...
      </div>
    );
  }

  if (isSearching && displayItems.length === 0) {
    return <NotesEmptyState>No results found</NotesEmptyState>;
  }

  if (displayItems.length === 0) {
    return <NotesEmptyState>{filter === "bookmarked" ? "No bookmarks yet" : "No notes yet"}</NotesEmptyState>;
  }

  // Show folder tree view when folders enabled and not searching
  if (filter === "all" && foldersEnabled && !isSearching) {
    return (
      <>
        <FolderTreeView
          pinnedIds={pinnedIds}
          settings={settings}
          multiSelectedNoteIds={multiSelectedNoteIds}
          setMultiSelectedNoteIds={setMultiSelectedNoteIds}
          lastClickedNoteId={lastClickedNoteId}
          setLastClickedNoteId={setLastClickedNoteId}
          onRefreshSettings={refreshSettings}
        />

        {/* Delete confirmation dialog */}
        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete note?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the note and all its content. This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={0}
        data-note-list
        className="group/notelist flex flex-col gap-1 p-1.5 outline-none"
      >
        {displayItems.map((item) => (
          <NoteItemWithMenu
            key={item.id}
            id={item.id}
            title={item.title}
            preview={item.preview}
            modified={item.modified}
            isSelected={selectedNoteId === item.id}
            isPinned={pinnedIds.has(item.id)}
            isBookmarked={bookmarkedIds.has(item.id)}
            onSelect={selectNote}
            onPin={pinNote}
            onUnpin={unpinNote}
            onBookmark={bookmarkNote}
            onRemoveBookmark={removeBookmark}
            onDuplicate={duplicateNote}
            onDelete={openDeleteDialogForNote}
            onRefreshSettings={refreshSettings}
          />
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the note and all its content. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

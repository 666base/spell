import { useCallback, useMemo, memo, useEffect, useRef, useState } from "react";
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
import { notesInScope } from "../../lib/notesScope";
import { VirtualizedNoteList } from "./VirtualizedNoteList";
import { NoNotesEmpty } from "./NoNotesEmpty";
import type { NoteMetadata, Settings } from "../../types/note";
import { useOpenJournal } from "../journal/useOpenJournal";
import {
  journalIdForDate,
  journalTitleForDate,
  parseJournalDate,
  sortJournalNotes,
  startOfLocalDay,
} from "../../lib/journal";

const menuItemClass = "spell-menu-item cursor-pointer";

const menuSeparatorClass = "spell-menu-separator";

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
    return date.toLocaleDateString([], { weekday: "long" });
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
  isMultiSelected?: boolean;
  isPinned: boolean;
  onSelect: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  depth?: number;
  showFolderPrefix?: boolean;
  metaLabel?: string;
}

export const NoteItem = memo(function NoteItem({
  id,
  title,
  preview,
  modified,
  isSelected,
  isMultiSelected = false,
  isPinned,
  onSelect,
  depth,
  showFolderPrefix = true,
  metaLabel,
}: NoteItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => onSelect(id, event),
    [onSelect, id],
  );

  useEffect(() => {
    if (isSelected) {
      ref.current?.scrollIntoView({ block: "nearest" });
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
        meta={metaLabel ?? formatDate(modified)}
        isSelected={isSelected}
        isMultiSelected={isMultiSelected}
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
  isMultiSelected?: boolean;
  isPinned: boolean;
  onSelect: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onPin: (id: string) => Promise<void>;
  onUnpin: (id: string) => Promise<void>;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRefreshSettings: () => Promise<void> | void;
  showFolderPrefix?: boolean;
  metaLabel?: string;
}

export const NoteItemWithMenu = memo(function NoteItemWithMenu({
  id,
  title,
  preview,
  modified,
  isSelected,
  isMultiSelected = false,
  isPinned,
  onSelect,
  onPin,
  onUnpin,
  onDuplicate,
  onDelete,
  onRefreshSettings,
  showFolderPrefix = true,
  metaLabel,
}: NoteItemWithMenuProps) {
  const handlePin = useCallback(async () => {
    try {
      await (isPinned ? onUnpin(id) : onPin(id));
      await onRefreshSettings();
    } catch (error) {
      console.error("Failed to pin/unpin note:", error);
    }
  }, [id, isPinned, onPin, onUnpin, onRefreshSettings]);

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
            isMultiSelected={isMultiSelected}
            isPinned={isPinned}
            onSelect={onSelect}
            showFolderPrefix={showFolderPrefix}
            metaLabel={metaLabel}
          />
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content data-spell-context-menu className="spell-menu z-50">
          <ContextMenu.Item className={menuItemClass} onSelect={handlePin}>
            {isPinned ? "Unpin" : "Pin"}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => onDuplicate(id)}
          >
            Duplicate
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={
              menuItemClass + " spell-menu-item-danger"
            }
            onSelect={() => onDelete(id)}
          >
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

type JournalListItem = NoteMetadata & { isPlaceholder?: boolean };

function journalListItems(notes: NoteMetadata[]): JournalListItem[] {
  const today = startOfLocalDay();
  const todayId = journalIdForDate(today);
  const sorted = sortJournalNotes(notes);
  const todayNote = sorted.find((note) => note.id === todayId);
  const rest = sorted.filter((note) => note.id !== todayId);

  if (todayNote) {
    return [todayNote, ...rest];
  }

  return [
    {
      id: todayId,
      title: journalTitleForDate(today),
      preview: "",
      modified: Math.floor(today.getTime() / 1000),
      isPlaceholder: true,
    },
    ...rest,
  ];
}

interface NoteListProps {
  filter?: "all" | "journal";
  folderPath?: string | null;
  query?: string;
  emptyLabel?: string;
  showEmptyCanvas?: boolean;
  onOpenNote?: () => void;
  multiSelectedNoteIds: Set<string>;
  setMultiSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  lastClickedNoteId: string | null;
  setLastClickedNoteId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function NoteList({
  filter = "all",
  folderPath = null,
  query = "",
  emptyLabel,
  showEmptyCanvas = false,
  onOpenNote,
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
    isLoading,
  } = useNotes();

  const openJournal = useOpenJournal();
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
    const scope =
      filter === "journal"
        ? { type: "journal" as const }
        : folderPath != null
          ? { type: "folder" as const, path: folderPath }
          : { type: "all" as const };
    const scoped = notesInScope(notes, scope);
    const items = filter === "journal" ? journalListItems(scoped) : scoped;
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const title = item.title.toLowerCase();
      const preview = (item.preview ?? "").toLowerCase();
      return title.includes(needle) || preview.includes(needle);
    });
  }, [filter, folderPath, notes, query]);

  const placeholderIds = useMemo(
    () =>
      new Set(
        displayItems
          .filter((item): item is JournalListItem => "isPlaceholder" in item && item.isPlaceholder === true)
          .map((item) => item.id),
      ),
    [displayItems],
  );

  const handleNoteSelect = useCallback(
    (noteId: string, event: React.MouseEvent<HTMLButtonElement>) => {
      const isPlaceholder = placeholderIds.has(noteId);
      const isToggle = event.metaKey || event.ctrlKey;

      if (isPlaceholder) {
        setMultiSelectedNoteIds(new Set([noteId]));
        setLastClickedNoteId(noteId);
        const date = parseJournalDate(noteId);
        if (date) void openJournal(date);
        onOpenNote?.();
        return;
      }

      if (event.shiftKey) {
        const anchor = lastClickedNoteId ?? selectedNoteId;
        const anchorIndex = anchor ? displayItems.findIndex((item) => item.id === anchor) : -1;
        const targetIndex = displayItems.findIndex((item) => item.id === noteId);
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const start = Math.min(anchorIndex, targetIndex);
          const end = Math.max(anchorIndex, targetIndex);
          setMultiSelectedNoteIds(new Set(displayItems.slice(start, end + 1).map((item) => item.id)));
        }
        return;
      }

      if (isToggle) {
        setMultiSelectedNoteIds((previous) => {
          const next = new Set(previous);
          if (selectedNoteId) next.add(selectedNoteId);
          if (next.has(noteId)) next.delete(noteId);
          else next.add(noteId);
          return next;
        });
        setLastClickedNoteId(noteId);
        return;
      }

      setMultiSelectedNoteIds(new Set([noteId]));
      setLastClickedNoteId(noteId);
      void selectNote(noteId);
      onOpenNote?.();
    },
    [
      displayItems,
      lastClickedNoteId,
      onOpenNote,
      openJournal,
      placeholderIds,
      selectedNoteId,
      selectNote,
      setLastClickedNoteId,
      setMultiSelectedNoteIds,
    ],
  );

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

  if (isLoading && notes.length === 0) {
    return (
      <div className="p-4 text-center text-text-muted select-none">
        Loading...
      </div>
    );
  }

  if (displayItems.length === 0) {
    if (showEmptyCanvas) {
      return (
        <div className="h-full">
          <NoNotesEmpty />
        </div>
      );
    }
    if (query.trim() || emptyLabel) {
      return (
        <div
          ref={containerRef}
          className="flex h-full items-center justify-center px-8 text-center text-[17px] text-text-muted"
          tabIndex={-1}
        >
          {query.trim() ? "No Results" : emptyLabel}
        </div>
      );
    }
    return <div ref={containerRef} className="h-full" tabIndex={-1} />;
  }

  return (
    <>
      <VirtualizedNoteList
        count={displayItems.length}
        scrollRef={containerRef}
        renderRow={(index) => {
          const item = displayItems[index] as JournalListItem;
          const isJournal = filter === "journal";
          const isPlaceholder = item.isPlaceholder === true;
          const journalDate = parseJournalDate(item.id);
          const isTodayJournal =
            isJournal &&
            journalDate != null &&
            journalDate.getTime() === startOfLocalDay().getTime();
          const isSelected =
            selectedNoteId === item.id ||
            (isPlaceholder &&
              (!selectedNoteId || !selectedNoteId.startsWith("journals/")));

          if (isPlaceholder) {
            return (
              <NoteItem
                id={item.id}
                title={item.title}
                preview=""
                modified={item.modified}
                isSelected={isSelected}
                isPinned={false}
                onSelect={handleNoteSelect}
                showFolderPrefix={false}
                metaLabel="Today"
              />
            );
          }

          return (
            <NoteItemWithMenu
              key={item.id}
              id={item.id}
              title={item.title}
              preview={item.preview}
              modified={item.modified}
              isSelected={isSelected}
              isMultiSelected={multiSelectedNoteIds.has(item.id)}
              isPinned={pinnedIds.has(item.id)}
              onSelect={handleNoteSelect}
              onPin={pinNote}
              onUnpin={unpinNote}
              onDuplicate={duplicateNote}
              onDelete={openDeleteDialogForNote}
              onRefreshSettings={refreshSettings}
              showFolderPrefix={!isJournal}
              metaLabel={isTodayJournal ? "Today" : undefined}
            />
          );
        }}
      />

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

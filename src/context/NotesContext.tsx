import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import type { Note, NoteMetadata } from "../types/note";
import * as notesService from "../services/notes";
import { lastWriteWins } from "../lib/editorSave";
import { applySavedNoteToList, holdOpenNotePosition, remapNoteIds } from "../lib/noteListOrder";
import {
  queueCloudDelete,
  queueCloudUpsert,
} from "../services/cloudSync";
import {
  movePublishedNoteQuietly,
  unpublishNoteQuietly,
} from "../services/notePublish";
import type { SearchResult } from "../services/notes";

// Separate contexts to prevent unnecessary re-renders
// Data context: changes frequently, only subscribed by components that need the data
interface NotesDataContextValue {
  notes: NoteMetadata[];
  selectedNoteId: string | null;
  currentNote: Note | null;
  notesFolder: string | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  hasExternalChanges: boolean;
  reloadVersion: number;
  isCreatingNote: boolean;
}

// Actions context: stable references, rarely causes re-renders
interface NotesActionsContextValue {
  selectNote: (id: string) => Promise<void>;
  clearSelection: () => void;
  createNote: () => Promise<Note | undefined>;
  consumePendingNewNote: (id: string) => boolean;
  saveNote: (content: string, noteId?: string) => Promise<Note | undefined>;
  deleteNote: (id: string) => Promise<void>;
  deleteNotes: (ids: string[]) => Promise<void>;
  duplicateNote: (id: string) => Promise<void>;
  refreshNotes: () => Promise<void>;
  reloadCurrentNote: () => Promise<void>;
  setNotesFolder: (path: string) => Promise<void>;
  syncNotesFolder: (path: string) => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  pinNote: (id: string) => Promise<void>;
  unpinNote: (id: string) => Promise<void>;
  reorderNotes: (pinnedNoteIds: string[], noteOrder: string[]) => Promise<void>;
  createNoteInFolder: (folderPath: string) => Promise<Note | undefined>;
  createNoteWithContent: (content: string, folderPath?: string) => Promise<Note | undefined>;
  importNotePaths: (paths: string[], folderPath?: string) => Promise<{ imported: number; skipped: number }>;
  createFolder: (parentPath: string, name: string) => Promise<void>;
  deleteFolder: (path: string) => Promise<void>;
  renameFolder: (oldPath: string, newName: string) => Promise<void>;
  moveNote: (id: string, targetFolder: string) => Promise<void>;
  moveFolder: (path: string, targetParent: string) => Promise<void>;
}

const NotesDataContext = createContext<NotesDataContextValue | null>(null);
const NotesActionsContext = createContext<NotesActionsContextValue | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [notesFolder, setNotesFolderState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasExternalChanges, setHasExternalChanges] = useState(false);
  // Increments when user manually refreshes, so Editor knows to reload content
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isCreatingNote, setIsCreatingNote] = useState(false);

  // Track recently saved note IDs to ignore file-change events from our own saves
  const recentlySavedRef = useRef<Set<string>>(new Set());
  const savesInFlightRef = useRef(0);
  // Ref to access selectedNoteId in file watcher without re-registering listener
  const selectedNoteIdRef = useRef<string | null>(null);
  // Ref to access notes in search callback without re-creating it on every notes change
  const notesRef = useRef<NoteMetadata[]>([]);
  // Monotonic counter to ignore stale async note selection responses.
  const selectRequestIdRef = useRef(0);
  // Monotonic counter to ignore stale async search responses
  const searchRequestIdRef = useRef(0);
  // Tracks the ID of a newly created note so Editor can focus its title.
  const pendingNewNoteIdRef = useRef<string | null>(null);
  const creatingNoteRef = useRef(false);
  const pendingSavesRef = useRef<Array<{ noteId: string; content: string }>>([]);
  const saveWaitersRef = useRef<
    Array<{
      noteId: string;
      resolve: (note: Note) => void;
      reject: (reason: unknown) => void;
    }>
  >([]);
  const saveFlushScheduledRef = useRef(false);
  const flushSavesRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    selectedNoteIdRef.current = selectedNoteId;
  }, [selectedNoteId]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const refreshNotes = useCallback(async () => {
    if (!notesFolder) return;
    try {
      const notesList = await notesService.listNotes();
      setNotes((prev) => holdOpenNotePosition(prev, notesList, selectedNoteIdRef.current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
    }
  }, [notesFolder]);

  const selectNote = useCallback(async (id: string) => {
    const requestId = ++selectRequestIdRef.current;
    try {
      if (pendingNewNoteIdRef.current !== id) {
        pendingNewNoteIdRef.current = null;
      }
      // Set selected ID immediately for responsive UI
      selectedNoteIdRef.current = id;
      setSelectedNoteId(id);
      setHasExternalChanges(false);
      // Expand parent folders so the note is visible in the tree
      const lastSlash = id.lastIndexOf("/");
      if (lastSlash > 0) {
        window.dispatchEvent(
          new CustomEvent("expand-folder", {
            detail: id.substring(0, lastSlash),
          }),
        );
      }
      const note = await notesService.readNote(id);
      if (requestId !== selectRequestIdRef.current) return;
      setCurrentNote(note);
    } catch (err) {
      if (requestId !== selectRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load note");
    }
  }, []);

  const clearSelection = useCallback(() => {
    selectRequestIdRef.current += 1;
    pendingNewNoteIdRef.current = null;
    selectedNoteIdRef.current = null;
    setSelectedNoteId(null);
    setCurrentNote(null);
    setHasExternalChanges(false);
  }, []);

  const reloadCurrentNote = useCallback(async () => {
    if (!selectedNoteIdRef.current) return;
    try {
      const note = await notesService.readNote(selectedNoteIdRef.current);
      setCurrentNote(note);
      setHasExternalChanges(false);
      setReloadVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reload note");
    }
  }, []);

  const openCreatedNote = useCallback(
    async (note: Note) => {
      selectRequestIdRef.current += 1;
      pendingNewNoteIdRef.current = note.id;
      recentlySavedRef.current.add(note.id);
      selectedNoteIdRef.current = note.id;
      await refreshNotes();
      setCurrentNote(note);
      setSelectedNoteId(note.id);
      queueCloudUpsert(note);
      setSearchQuery("");
      setSearchResults([]);
      window.dispatchEvent(new CustomEvent("spell-note-created", { detail: note.id }));
      setTimeout(() => {
        recentlySavedRef.current.delete(note.id);
      }, 1000);
    },
    [refreshNotes],
  );

  const withCreatingNote = useCallback(
    async (work: () => Promise<Note>) => {
      if (creatingNoteRef.current) return;
      creatingNoteRef.current = true;
      setIsCreatingNote(true);
      try {
        const note = await work();
        await openCreatedNote(note);
        return note;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create note";
        setError(message);
        toast.error(message);
      } finally {
        creatingNoteRef.current = false;
        setIsCreatingNote(false);
      }
    },
    [openCreatedNote],
  );

  const createNote = useCallback(
    () => withCreatingNote(() => notesService.createNote()),
    [withCreatingNote],
  );

  const consumePendingNewNote = useCallback((id: string) => {
    if (pendingNewNoteIdRef.current !== id) {
      pendingNewNoteIdRef.current = null;
      return false;
    }
    pendingNewNoteIdRef.current = null;
    return true;
  }, []);

  const persistSavedNote = useCallback(async (savingNoteId: string, content: string) => {
    let updatedId: string | null = null;
    savesInFlightRef.current += 1;
    recentlySavedRef.current.add(savingNoteId);
    try {
      const updated = await notesService.saveNote(savingNoteId, content);
      updatedId = updated.id;

      if (updated.id !== savingNoteId) {
        queueCloudDelete(savingNoteId);
        movePublishedNoteQuietly(savingNoteId, updated.id);
      }
      queueCloudUpsert(updated);

      if (updated.id !== savingNoteId) {
        recentlySavedRef.current.add(updated.id);

        const currentSettings = await notesService.getSettings();
        const pinnedIds = remapNoteIds(
          currentSettings.pinnedNoteIds,
          savingNoteId,
          updated.id,
        );
        const noteOrder = remapNoteIds(
          currentSettings.noteOrder,
          savingNoteId,
          updated.id,
        );
        if (
          pinnedIds !== currentSettings.pinnedNoteIds ||
          noteOrder !== currentSettings.noteOrder
        ) {
          await notesService.updateSettings({
            ...currentSettings,
            pinnedNoteIds: pinnedIds,
            noteOrder,
          });
        }
      }

      setNotes((prev) => applySavedNoteToList(prev, savingNoteId, updated));
      setHasExternalChanges(false);

      if (
        selectedNoteIdRef.current === savingNoteId ||
        selectedNoteIdRef.current === updated.id
      ) {
        selectedNoteIdRef.current = updated.id;
        setSelectedNoteId(updated.id);
        setCurrentNote((prev) => {
          if (!prev) return updated;
          if (prev.id === updated.id) {
            return prev.title === updated.title
              ? prev
              : { ...prev, title: updated.title };
          }
          return {
            ...prev,
            id: updated.id,
            title: updated.title,
            path: updated.path,
          };
        });
      }

      setTimeout(() => {
        recentlySavedRef.current.delete(savingNoteId);
        if (updatedId) recentlySavedRef.current.delete(updatedId);
      }, 1000);

      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save note";
      setError(message);
      toast.error(message);
      recentlySavedRef.current.delete(savingNoteId);
      if (updatedId) recentlySavedRef.current.delete(updatedId);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      savesInFlightRef.current = Math.max(0, savesInFlightRef.current - 1);
    }
  }, []);

  flushSavesRef.current = async () => {
    saveFlushScheduledRef.current = false;
    const batch = lastWriteWins(pendingSavesRef.current);
    pendingSavesRef.current = [];
    const waiters = saveWaitersRef.current;
    saveWaitersRef.current = [];

    await Promise.all(
      batch.map(async (item) => {
        const itemWaiters = waiters.filter((waiter) => waiter.noteId === item.noteId);
        try {
          const updated = await persistSavedNote(item.noteId, item.content);
          itemWaiters.forEach((waiter) => waiter.resolve(updated));
        } catch (err) {
          itemWaiters.forEach((waiter) => waiter.reject(err));
        }
      }),
    );

    if (pendingSavesRef.current.length > 0 && !saveFlushScheduledRef.current) {
      saveFlushScheduledRef.current = true;
      queueMicrotask(() => {
        void flushSavesRef.current();
      });
    }
  };

  const saveNote = useCallback(
    (content: string, noteId?: string): Promise<Note | undefined> => {
      const savingNoteId = noteId || selectedNoteIdRef.current;
      if (!savingNoteId) return Promise.resolve(undefined);

      pendingSavesRef.current.push({ noteId: savingNoteId, content });
      return new Promise<Note>((resolve, reject) => {
        saveWaitersRef.current.push({ noteId: savingNoteId, resolve, reject });
        if (saveFlushScheduledRef.current) return;
        saveFlushScheduledRef.current = true;
        queueMicrotask(() => {
          void flushSavesRef.current();
        });
      });
    },
    [],
  );

  const deleteNotes = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      try {
        const uniqueIds = [...new Set(ids)];
        for (const id of uniqueIds) {
          await notesService.deleteNote(id);
          queueCloudDelete(id);
          unpublishNoteQuietly(id);
        }

        const currentSettings = await notesService.getSettings();
        const pinnedIds = currentSettings.pinnedNoteIds || [];
        const removed = new Set(uniqueIds);
        const nextPinned = pinnedIds.filter((pinId) => !removed.has(pinId));
        const nextOrder = (currentSettings.noteOrder || []).filter((noteId) => !removed.has(noteId));
        if (
          nextPinned.length !== pinnedIds.length ||
          nextOrder.length !== (currentSettings.noteOrder || []).length
        ) {
          await notesService.updateSettings({
            ...currentSettings,
            pinnedNoteIds: nextPinned,
            noteOrder: nextOrder,
          });
        }

        if (selectedNoteIdRef.current && removed.has(selectedNoteIdRef.current)) {
          selectedNoteIdRef.current = null;
          setCurrentNote(null);
          setSelectedNoteId(null);
        }
        await refreshNotes();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete notes");
        throw err;
      }
    },
    [refreshNotes]
  );

  const deleteNote = useCallback(
    async (id: string) => {
      await deleteNotes([id]);
    },
    [deleteNotes]
  );

  const duplicateNote = useCallback(
    async (id: string) => {
      try {
        const newNote = await notesService.duplicateNote(id);
        selectRequestIdRef.current += 1;
        recentlySavedRef.current.add(newNote.id);
        selectedNoteIdRef.current = newNote.id;
        await refreshNotes();
        setCurrentNote(newNote);
        setSelectedNoteId(newNote.id);
        queueCloudUpsert(newNote);
        window.dispatchEvent(new CustomEvent("spell-note-created", { detail: newNote.id }));
        setTimeout(() => {
          recentlySavedRef.current.delete(newNote.id);
        }, 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to duplicate note");
      }
    },
    [refreshNotes]
  );

  const pinNote = useCallback(
    async (id: string) => {
      try {
        const currentSettings = await notesService.getSettings();
        const pinnedIds = currentSettings.pinnedNoteIds || [];

        if (!pinnedIds.includes(id)) {
          const updatedSettings = {
            ...currentSettings,
            pinnedNoteIds: [id, ...pinnedIds],
            noteOrder: (currentSettings.noteOrder || []).filter((noteId) => noteId !== id),
          };
          await notesService.updateSettings(updatedSettings);
          await refreshNotes();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to pin note");
      }
    },
    [refreshNotes]
  );

  const unpinNote = useCallback(
    async (id: string) => {
      try {
        const currentSettings = await notesService.getSettings();
        const pinnedIds = currentSettings.pinnedNoteIds || [];

        const updatedSettings = {
          ...currentSettings,
          pinnedNoteIds: pinnedIds.filter((pinId) => pinId !== id),
        };
        await notesService.updateSettings(updatedSettings);
        await refreshNotes();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to unpin note");
      }
    },
    [refreshNotes]
  );

  const reorderNotes = useCallback(async (pinnedNoteIds: string[], noteOrder: string[]) => {
    try {
      const currentSettings = await notesService.getSettings();
      await notesService.updateSettings({
        ...currentSettings,
        pinnedNoteIds,
        noteOrder,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder notes");
    }
  }, []);

  const createNoteInFolder = useCallback(
    (folderPath: string) => withCreatingNote(() => notesService.createNote(folderPath)),
    [withCreatingNote],
  );

  const createNoteWithContent = useCallback(
    (content: string, folderPath?: string) =>
      withCreatingNote(() => notesService.createNote(folderPath, content)),
    [withCreatingNote],
  );

  const importNotePaths = useCallback(
    async (paths: string[], folderPath?: string) => {
      const report = await notesService.importNotes(paths, folderPath);
      await refreshNotes();
      if (report.lastId) {
        await selectNote(report.lastId);
      }
      return { imported: report.imported, skipped: report.skipped };
    },
    [refreshNotes, selectNote],
  );

  const createFolderAction = useCallback(
    async (parentPath: string, name: string) => {
      try {
        const fullPath = parentPath ? `${parentPath}/${name}` : name;
        await notesService.createFolder(fullPath);
        await refreshNotes();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create folder"
        );
      }
    },
    [refreshNotes]
  );

  const deleteFolderAction = useCallback(
    async (path: string) => {
      try {
        const deletedNoteIds = notesRef.current
          .filter((note) => note.id.startsWith(path + "/"))
          .map((note) => note.id);
        await notesService.deleteFolder(path);
        deletedNoteIds.forEach(queueCloudDelete);
        deletedNoteIds.forEach(unpublishNoteQuietly);
        // If the selected note was inside the deleted folder, clear selection
        if (selectedNoteIdRef.current?.startsWith(path + "/")) {
          setCurrentNote(null);
          setSelectedNoteId(null);
        }
        await refreshNotes();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete folder";
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [refreshNotes]
  );

  const renameFolderAction = useCallback(
    async (oldPath: string, newName: string) => {
      try {
        const affectedIds = notesRef.current
          .filter((note) => note.id.startsWith(oldPath + "/"))
          .map((note) => note.id);
        await notesService.renameFolder(oldPath, newName);

        // Compute new folder path
        const lastSlash = oldPath.lastIndexOf("/");
        const newPath =
          lastSlash >= 0
            ? `${oldPath.substring(0, lastSlash)}/${newName}`
            : newName;
        const oldPrefix = oldPath + "/";
        const newPrefix = newPath + "/";

        for (const oldId of affectedIds) {
          const newId = newPrefix + oldId.substring(oldPrefix.length);
          queueCloudDelete(oldId);
          queueCloudUpsert(await notesService.readNote(newId));
          movePublishedNoteQuietly(oldId, newId);
        }

        // Update selectedNoteId if it was inside the renamed folder
        setSelectedNoteId((prevId) => {
          if (prevId && prevId.startsWith(oldPrefix)) {
            const newId = newPrefix + prevId.substring(oldPrefix.length);
            notesService.readNote(newId).then((note) => {
              setCurrentNote(note);
            }).catch((err) => {
              setError(err instanceof Error ? err.message : "Failed to read renamed note");
            });
            return newId;
          }
          return prevId;
        });

        await refreshNotes();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to rename folder";
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [refreshNotes]
  );

  const moveNoteAction = useCallback(
    async (id: string, targetFolder: string) => {
      try {
        const newId = await notesService.moveNote(id, targetFolder);
        queueCloudDelete(id);
        queueCloudUpsert(await notesService.readNote(newId));
        movePublishedNoteQuietly(id, newId);
        // Update selection if we moved the selected note
        setSelectedNoteId((prevId) => {
          if (prevId === id) {
            notesService.readNote(newId).then((note) => {
              setCurrentNote(note);
            }).catch((err) => {
              setError(err instanceof Error ? err.message : "Failed to read moved note");
            });
            return newId;
          }
          return prevId;
        });
        await refreshNotes();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move note");
        throw err;
      }
    },
    [refreshNotes]
  );

  const moveFolderAction = useCallback(
    async (path: string, targetParent: string) => {
      try {
        const affectedIds = notesRef.current
          .filter((note) => note.id.startsWith(path + "/"))
          .map((note) => note.id);
        await notesService.moveFolder(path, targetParent);

        // Compute new folder path
        const folderName = path.includes("/")
          ? path.substring(path.lastIndexOf("/") + 1)
          : path;
        const newPath = targetParent
          ? `${targetParent}/${folderName}`
          : folderName;
        const oldPrefix = path + "/";
        const newPrefix = newPath + "/";

        for (const oldId of affectedIds) {
          const newId = newPrefix + oldId.substring(oldPrefix.length);
          queueCloudDelete(oldId);
          queueCloudUpsert(await notesService.readNote(newId));
          movePublishedNoteQuietly(oldId, newId);
        }

        // Update selectedNoteId if it was inside the moved folder
        setSelectedNoteId((prevId) => {
          if (prevId && prevId.startsWith(oldPrefix)) {
            const newId = newPrefix + prevId.substring(oldPrefix.length);
            notesService.readNote(newId).then((note) => {
              setCurrentNote(note);
            }).catch((err) => {
              setError(err instanceof Error ? err.message : "Failed to read moved note");
            });
            return newId;
          }
          return prevId;
        });

        await refreshNotes();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move folder");
        throw err;
      }
    },
    [refreshNotes]
  );

  const setNotesFolder = useCallback(async (path: string) => {
    try {
      await notesService.setNotesFolder(path);
      setNotesFolderState(path);
      // Start file watcher after setting folder
      await notesService.startFileWatcher();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to set notes folder"
      );
    }
  }, []);

  // Update local state only (backend already initialized the folder).
  // Used when the CLI sets the notes folder and emits an event.
  const syncNotesFolder = useCallback(async (path: string) => {
    try {
      setNotesFolderState(path);
      setSelectedNoteId(null);
      setCurrentNote(null);
      const notesList = await notesService.listNotes();
      setNotes(notesList);
      await notesService.startFileWatcher();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to sync notes folder"
      );
    }
  }, []);

  const search = useCallback(async (query: string) => {
    const requestId = ++searchRequestIdRef.current;
    setSearchQuery(query);

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const queryLower = trimmedQuery.toLowerCase();
    // Instant local results for responsive UX while full-text search runs.
    const instantResults: SearchResult[] = notesRef.current
      .filter(
        (note) =>
          note.title.toLowerCase().includes(queryLower) ||
          note.preview.toLowerCase().includes(queryLower),
      )
      .slice(0, 20)
      .map((note) => ({
        id: note.id,
        title: note.title,
        preview: note.preview,
        modified: note.modified,
        score: 0,
      }));

    // Show instant local matches immediately; clear stale results if none match.
    setSearchResults(instantResults);

    setIsSearching(true);
    try {
      const results = await notesService.searchNotes(trimmedQuery);
      if (requestId !== searchRequestIdRef.current) return;
      if (results.length === 0) {
        // If neither backend nor instant matches found, clear results only now
        // (after async search settles) to avoid transient empty states.
        setSearchResults(instantResults);
      } else {
        // Merge backend + instant results, deduping by note id.
        const merged = [...results];
        const seen = new Set(results.map((result) => result.id));
        for (const result of instantResults) {
          if (!seen.has(result.id)) {
            merged.push(result);
          }
        }
        setSearchResults(merged);
      }
    } catch (err) {
      console.error("Search failed:", err);
    }
    if (requestId !== searchRequestIdRef.current) return;
    setIsSearching(false);
  }, []);

  const clearSearch = useCallback(() => {
    searchRequestIdRef.current += 1;
    setSearchQuery("");
    setSearchResults([]);
    setIsSearching(false);
  }, []);

  // Load initial state
  useEffect(() => {
    async function init() {
      try {
        const folder = await notesService.getNotesFolder();
        setNotesFolderState(folder);
        if (folder) {
          const notesList = await notesService.listNotes();
          setNotes(notesList);
          // Start file watcher
          await notesService.startFileWatcher();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialize");
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  // Listen for file change events and notify if current note changed externally
  useEffect(() => {
    let isCancelled = false;
    let unlisten: (() => void) | undefined;

    listen<{ changed_ids: string[] }>("file-change", (event) => {
      if (isCancelled) return;
      if (savesInFlightRef.current > 0) return;

      const changedIds = event.payload.changed_ids || [];

      const externalChanges = changedIds.filter(
        (id) => !recentlySavedRef.current.has(id)
      );

      if (externalChanges.length > 0) {
        refreshNotes();

        const currentId = selectedNoteIdRef.current;
        if (currentId && externalChanges.includes(currentId)) {
          setHasExternalChanges(true);
        }
      }
    }).then((fn) => {
      if (isCancelled) {
        // Effect was cleaned up before listener registered, clean up immediately
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      isCancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [refreshNotes]);

  // Listen for "select-note" events from the backend (CLI, drag-drop, Open With, import from preview)
  useEffect(() => {
    const unlisten = listen<string>("select-note", (event) => {
      // Refresh the notes list so the sidebar shows the new note immediately
      refreshNotes();
      selectNote(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [selectNote, refreshNotes]);

  // Refresh notes when folder changes
  useEffect(() => {
    if (notesFolder) {
      refreshNotes();
    }
  }, [notesFolder, refreshNotes]);

  // Memoize data context value to prevent unnecessary re-renders
  const dataValue = useMemo<NotesDataContextValue>(
    () => ({
      notes,
      selectedNoteId,
      currentNote,
      notesFolder,
      isLoading,
      error,
      searchQuery,
      searchResults,
      isSearching,
      hasExternalChanges,
      reloadVersion,
      isCreatingNote,
    }),
    [
      notes,
      selectedNoteId,
      currentNote,
      notesFolder,
      isLoading,
      error,
      searchQuery,
      searchResults,
      isSearching,
      hasExternalChanges,
      reloadVersion,
      isCreatingNote,
    ]
  );

  // Memoize actions context value - these are stable callbacks
  const actionsValue = useMemo<NotesActionsContextValue>(
    () => ({
      selectNote,
      clearSelection,
      createNote,
      consumePendingNewNote,
      saveNote,
      deleteNote,
      deleteNotes,
      duplicateNote,
      refreshNotes,
      reloadCurrentNote,
      setNotesFolder,
      syncNotesFolder,
      search,
      clearSearch,
      pinNote,
      unpinNote,
      reorderNotes,
      createNoteInFolder,
      createNoteWithContent,
      importNotePaths,
      createFolder: createFolderAction,
      deleteFolder: deleteFolderAction,
      renameFolder: renameFolderAction,
      moveNote: moveNoteAction,
      moveFolder: moveFolderAction,
    }),
    [
      selectNote,
      clearSelection,
      createNote,
      consumePendingNewNote,
      saveNote,
      deleteNote,
      deleteNotes,
      duplicateNote,
      refreshNotes,
      reloadCurrentNote,
      setNotesFolder,
      syncNotesFolder,
      search,
      clearSearch,
      pinNote,
      unpinNote,
      reorderNotes,
      createNoteInFolder,
      createNoteWithContent,
      importNotePaths,
      createFolderAction,
      deleteFolderAction,
      renameFolderAction,
      moveNoteAction,
      moveFolderAction,
    ]
  );

  return (
    <NotesActionsContext.Provider value={actionsValue}>
      <NotesDataContext.Provider value={dataValue}>
        {children}
      </NotesDataContext.Provider>
    </NotesActionsContext.Provider>
  );
}

// Hook to get notes data (subscribes to data changes)
export function useNotesData() {
  const context = useContext(NotesDataContext);
  if (!context) {
    throw new Error("useNotesData must be used within a NotesProvider");
  }
  return context;
}

// Hook to get notes actions (stable references, rarely causes re-renders)
export function useNotesActions() {
  const context = useContext(NotesActionsContext);
  if (!context) {
    throw new Error("useNotesActions must be used within a NotesProvider");
  }
  return context;
}

// Combined hook for convenience (backward compatible)
export function useNotes() {
  const data = useNotesData();
  const actions = useNotesActions();
  return { ...data, ...actions };
}

// Optional hook that returns null when outside a NotesProvider (for preview mode)
export function useOptionalNotes() {
  const data = useContext(NotesDataContext);
  const actions = useContext(NotesActionsContext);
  if (!data || !actions) return null;
  return { ...data, ...actions };
}

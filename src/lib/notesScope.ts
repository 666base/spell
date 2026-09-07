import type { NoteMetadata } from "../types/note";

export type NotesScope =
  | { type: "home" }
  | { type: "all" }
  | { type: "journal" }
  | { type: "folder"; path: string }
  | { type: "projects" }
  | { type: "project"; id: string }
  | { type: "money" }
  | { type: "moneyMonth"; month: string }
  | { type: "subscriptions" };

export const ALL_NOTES_SCOPE: NotesScope = { type: "all" };

export function isHomeTab(scope: NotesScope) {
  return scope.type === "home";
}

export function isWorkspaceScope(scope: NotesScope) {
  return scope.type === "projects" || scope.type === "project";
}

export function isProjectsTab(scope: NotesScope) {
  return scope.type === "projects" || scope.type === "project";
}

export function isMoneyTab(scope: NotesScope) {
  return scope.type === "money" || scope.type === "moneyMonth" || scope.type === "subscriptions";
}

export function hidesNotesList(scope: NotesScope) {
  return isHomeTab(scope) || isMoneyTab(scope);
}

export function notesScopeKey(scope: NotesScope) {
  if (scope.type === "folder") return `folder:${scope.path}`;
  if (scope.type === "project") return `project:${scope.id}`;
  if (scope.type === "moneyMonth") return `moneyMonth:${scope.month}`;
  return scope.type;
}

export function noteParentPath(noteId: string): string {
  const slash = noteId.lastIndexOf("/");
  return slash === -1 ? "" : noteId.substring(0, slash);
}

export function isInternalNoteId(id: string): boolean {
  return id.startsWith("journals/") || id.startsWith("_spell/");
}

export type NoteMoveDestination = { path: string; label: string };

function isHiddenMoveFolder(path: string) {
  return path === "journals" || path.startsWith("journals/") || path.startsWith("_spell");
}

/** Folders a note can move into, excluding its current parent. */
export function noteMoveDestinations(
  noteId: string,
  folders: readonly string[],
): NoteMoveDestination[] {
  if (isInternalNoteId(noteId)) return [];
  const current = noteParentPath(noteId);
  const seen = new Set<string>();
  const dest: NoteMoveDestination[] = [];
  const add = (path: string) => {
    if (path === current || isHiddenMoveFolder(path) || seen.has(path)) return;
    seen.add(path);
    dest.push({ path, label: path === "" ? "Notes" : path });
  };
  add("");
  for (const folder of folders) add(folder);
  dest.sort((a, b) => {
    if (a.path === "") return -1;
    if (b.path === "") return 1;
    return a.path.localeCompare(b.path);
  });
  return dest;
}

/** True when the vault has daily journals but no regular notes or folders. */
export function isJournalOnlyLibrary(noteIds: readonly string[]): boolean {
  return (
    noteIds.some((id) => id.startsWith("journals/")) &&
    noteIds.every((id) => isInternalNoteId(id))
  );
}

export const SPELL_FOLDERS_NOTE_ID = "_spell/folders";

export function parseCloudFolderIndex(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed.filter(
          (item): item is string =>
            typeof item === "string" &&
            item.length > 0 &&
            item !== "journals" &&
            !item.startsWith("journals/"),
        ),
      ),
    ].sort();
  } catch {
    return [];
  }
}

export function serializeCloudFolderIndex(folders: readonly string[]): string {
  return JSON.stringify(
    [
      ...new Set(
        folders.filter(
          (folder) =>
            folder.length > 0 && folder !== "journals" && !folder.startsWith("journals/"),
        ),
      ),
    ].sort(),
  );
}

/** Notes shown for the current Apple Notes-style folder/list scope. */
export function notesInScope(notes: NoteMetadata[], scope: NotesScope): NoteMetadata[] {
  if (scope.type === "journal") {
    return notes.filter((note) => note.id.startsWith("journals/"));
  }
  if (scope.type === "folder") {
    return notes.filter((note) => noteParentPath(note.id) === scope.path);
  }
  if (scope.type === "all") {
    return notes.filter((note) => !isInternalNoteId(note.id));
  }
  return [];
}

export function scopeForNote(noteId: string): NotesScope {
  if (noteId.startsWith("journals/")) return { type: "journal" };
  const parent = noteParentPath(noteId);
  return parent ? { type: "folder", path: parent } : { type: "all" };
}

export type SelectionDecision =
  | { type: "keep" }
  | { type: "select"; id: string }
  | { type: "clear" };

/**
 * After the notes list refreshes (save, create, watcher), never replace a
 * selected note just because it is missing from the current folder snapshot.
 * Title saves rename the file; stealing selection is what made new notes
 * appear not to open and dropped in-flight body edits.
 */
export function selectionAfterNotesChange(args: {
  selectedNoteId: string | null;
  noteIds: string[];
  scopedIds: string[];
  /** First hydrate after launch. Do not steal an empty selection toward row 0. */
  hydrating?: boolean;
}): SelectionDecision {
  const { selectedNoteId, noteIds, scopedIds, hydrating = false } = args;
  if (selectedNoteId && noteIds.includes(selectedNoteId)) return { type: "keep" };
  if (selectedNoteId) {
    // A title save renames the file. For a beat the old id is missing.
    // Jumping to the first row is the "redirect" users feel while typing.
    return { type: "keep" };
  }
  if (hydrating) return { type: "keep" };
  if (scopedIds.length > 0) return { type: "select", id: scopedIds[0] };
  return { type: "keep" };
}

/** User clicked a folder/list: open a note that belongs there. */
export function selectionAfterScopeChange(args: {
  selectedNoteId: string | null;
  scopedIds: string[];
}): SelectionDecision {
  const { selectedNoteId, scopedIds } = args;
  if (selectedNoteId && scopedIds.includes(selectedNoteId)) return { type: "keep" };
  if (scopedIds.length > 0) return { type: "select", id: scopedIds[0] };
  return selectedNoteId ? { type: "clear" } : { type: "keep" };
}

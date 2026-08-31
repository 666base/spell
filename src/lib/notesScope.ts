import type { NoteMetadata } from "../types/note";

export type NotesScope =
  | { type: "all" }
  | { type: "journal" }
  | { type: "folder"; path: string }
  | { type: "projects" }
  | { type: "project"; id: string }
  | { type: "money" }
  | { type: "moneyMonth"; month: string }
  | { type: "subscriptions" };

export const ALL_NOTES_SCOPE: NotesScope = { type: "all" };

export function isWorkspaceScope(scope: NotesScope) {
  return scope.type === "projects" || scope.type === "project";
}

export function isProjectsTab(scope: NotesScope) {
  return scope.type === "projects" || scope.type === "project";
}

export function isMoneyTab(scope: NotesScope) {
  return scope.type === "money" || scope.type === "moneyMonth" || scope.type === "subscriptions";
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

/** Notes shown for the current Apple Notes-style folder/list scope. */
export function notesInScope(notes: NoteMetadata[], scope: NotesScope): NoteMetadata[] {
  if (scope.type === "journal") {
    return notes.filter((note) => note.id.startsWith("journals/"));
  }
  if (scope.type === "folder") {
    return notes.filter((note) => noteParentPath(note.id) === scope.path);
  }
  if (scope.type === "all") {
    return notes.filter((note) => !note.id.startsWith("journals/"));
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
}): SelectionDecision {
  const { selectedNoteId, noteIds, scopedIds } = args;
  if (selectedNoteId && noteIds.includes(selectedNoteId)) return { type: "keep" };
  if (selectedNoteId) {
    // A title save renames the file. For a beat the old id is missing.
    // Jumping to the first row is the "redirect" users feel while typing.
    return { type: "keep" };
  }
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

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

/** Capture a save against the note actually loaded in the editor, not whatever is selected. */
export function capturePendingEditorSave(args: {
  needsSave: boolean;
  noteId: string | null;
  markdown: string;
}): { noteId: string; content: string } | null {
  if (!args.needsSave || !args.noteId) return null;
  return { noteId: args.noteId, content: args.markdown };
}

/** Rapid edits to the same note should persist only the latest snapshot. */
export function lastWriteWins(
  pending: Array<{ noteId: string; content: string }>,
): { noteId: string; content: string }[] {
  const latest = new Map<string, string>();
  for (const item of pending) {
    latest.set(item.noteId, item.content);
  }
  return [...latest].map(([noteId, content]) => ({ noteId, content }));
}

/**
 * A title save renames the file. That is the same open note, not a navigation.
 *
 * `lastSavedResultId` is the id the save actually wrote. A rename is only when
 * the editor is still on the old file and `currentNote` moved to that result.
 * Matching the loaded id to "whatever we last saved" is not enough: creating or
 * picking another note after an autosave looks the same.
 */
export function isEditorRename(args: {
  loadedNoteId: string | null;
  nextNoteId: string;
  lastSavedNoteId: string | null;
  lastSavedResultId: string | null;
}): boolean {
  if (!args.loadedNoteId || args.nextNoteId === args.loadedNoteId) return false;
  if (args.lastSavedNoteId !== args.loadedNoteId) return false;
  if (!args.lastSavedResultId || args.lastSavedResultId === args.loadedNoteId) {
    return false;
  }
  return args.nextNoteId === args.lastSavedResultId;
}

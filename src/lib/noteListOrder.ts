import type { NoteMetadata } from "../types/note";

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Pinned notes first (in pin order), then custom order, then newest modified. */
export function sortNotesForList<T extends Pick<NoteMetadata, "id" | "modified">>(
  notes: T[],
  pinnedIds: string[],
  noteOrder: string[] = [],
): T[] {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const remaining = new Set(notes.map((note) => note.id));
  const pinned: T[] = [];
  for (const id of pinnedIds) {
    const note = byId.get(id);
    if (!note) continue;
    pinned.push(note);
    remaining.delete(id);
  }
  const ordered: T[] = [];
  for (const id of noteOrder) {
    if (!remaining.has(id)) continue;
    ordered.push(byId.get(id)!);
    remaining.delete(id);
  }
  const rest = [...remaining]
    .map((id) => byId.get(id)!)
    .sort((a, b) => b.modified - a.modified);
  return [...pinned, ...ordered, ...rest];
}

export function applyNoteListDrag({
  visibleIds,
  fromId,
  toId,
  pinnedIds,
  noteOrder,
}: {
  visibleIds: string[];
  fromId: string;
  toId: string;
  pinnedIds: string[];
  noteOrder: string[];
}): { pinnedNoteIds: string[]; noteOrder: string[] } {
  const from = visibleIds.indexOf(fromId);
  const to = visibleIds.indexOf(toId);
  if (from < 0 || to < 0 || from === to) {
    return { pinnedNoteIds: pinnedIds, noteOrder };
  }

  const visibleSet = new Set(visibleIds);
  const pinnedSet = new Set(pinnedIds);
  const pinnedCount = visibleIds.filter((id) => pinnedSet.has(id)).length;
  const fromPinned = from < pinnedCount;
  let nextPinnedCount = pinnedCount;
  if (fromPinned && to >= pinnedCount) nextPinnedCount = pinnedCount - 1;
  else if (!fromPinned && to < pinnedCount) nextPinnedCount = pinnedCount + 1;

  const nextVisible = moveItem(visibleIds, from, to);
  const nextVisiblePinned = nextVisible.slice(0, nextPinnedCount);
  const nextVisibleUnpinned = nextVisible.slice(nextPinnedCount);

  const oldVisiblePinned = pinnedIds.filter((id) => visibleSet.has(id));
  const pinsChanged =
    nextVisiblePinned.length !== oldVisiblePinned.length ||
    nextVisiblePinned.some((id, index) => id !== oldVisiblePinned[index]);

  const oldVisibleUnpinned = visibleIds.filter((id) => !pinnedSet.has(id));
  const unpinnedChanged =
    nextVisibleUnpinned.length !== oldVisibleUnpinned.length ||
    nextVisibleUnpinned.some((id, index) => id !== oldVisibleUnpinned[index]);

  return {
    pinnedNoteIds: pinsChanged
      ? [...nextVisiblePinned, ...pinnedIds.filter((id) => !visibleSet.has(id))]
      : pinnedIds,
    noteOrder: unpinnedChanged
      ? [...nextVisibleUnpinned, ...noteOrder.filter((id) => !visibleSet.has(id))]
      : noteOrder,
  };
}

export function remapNoteIds(
  ids: string[] | undefined,
  from: string,
  to: string,
): string[] | undefined {
  if (!ids?.includes(from)) return ids;
  return ids.map((id) => (id === from ? to : id));
}

/** Keep the sidebar in sync when a save renames the file, without leaping to the top. */
export function applySavedNoteToList<T extends Pick<NoteMetadata, "id" | "title" | "modified">>(
  notes: T[],
  previousId: string,
  updated: Pick<NoteMetadata, "id" | "title" | "modified">,
): T[] {
  let found = false;
  const next = notes.map((note) => {
    if (note.id !== previousId && note.id !== updated.id) return note;
    found = true;
    return { ...note, id: updated.id, title: updated.title };
  });
  return found ? next : notes;
}

/**
 * A disk refresh must not move the open note. Apple Notes / Affine keep the
 * row still while you type; recency applies the next time the list is opened.
 */
export function holdOpenNotePosition<T extends Pick<NoteMetadata, "id" | "modified">>(
  previous: T[],
  incoming: T[],
  openNoteId: string | null,
): T[] {
  if (!openNoteId) return incoming;
  const previousOpen = previous.find((note) => note.id === openNoteId);
  if (!previousOpen) return incoming;
  return incoming.map((note) =>
    note.id === openNoteId ? { ...note, modified: previousOpen.modified } : note,
  );
}

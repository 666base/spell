/** The notes list reports that this scope has nothing in it. */
export const NOTE_LIST_EMPTY = "Empty";
export const NOTE_LIST_NO_RESULTS = "No Results";

/** The editor canvas invites writing. Must stay distinct from the list label. */
export const NOTE_CANVAS_EMPTY = "Start a note";

export function noteListEmptyLabel(
  query: string,
  emptyLabel: string = NOTE_LIST_EMPTY,
): string {
  return query.trim() ? NOTE_LIST_NO_RESULTS : emptyLabel;
}

/** Folder source-list width. Labeled destination rows, not icon tabs. */
export const FOLDER_SIDEBAR_PX = 224;
/** Notes list default width in Apple Notes (≈280pt). */
export const SIDEBAR_DEFAULT_PX = 280;
/** Minimum allowed notes-list width in pixels. */
export const SIDEBAR_MIN_PX = 220;
/** Maximum allowed notes-list width in pixels. */
export const SIDEBAR_MAX_PX = 560;

const UUID_LEAF =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sidebar brand: vault folder name, never a cloud UUID path leaf. */
export function libraryDisplayName(notesFolder: string | null | undefined): string {
  if (!notesFolder) return "Library";
  const leaf = notesFolder.split(/[/\\]/).filter(Boolean).pop();
  if (!leaf || UUID_LEAF.test(leaf)) return "Library";
  return leaf;
}

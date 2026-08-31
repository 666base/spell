import {
  pointerWithin,
  type CollisionDetection,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { folderItemId, noteItemId } from "./sidebarLibrary";

export { folderItemId, noteItemId };

export const DROP_ROOT_ID = "drop-root";
export const DROP_ALL_ID = "drop-all";
export const LIBRARY_NOTE_REORDER = "library-note-reorder";
export const LIBRARY_FOLDER_REORDER = "library-folder-reorder";

export type LibraryItemType = "note" | "folder";
export type DropMode = "into" | "before" | "after";

export type ParsedLibraryId =
  | { kind: "note"; id: string }
  | { kind: "folder"; path: string }
  | { kind: "root" };

export function parseLibraryId(id: UniqueIdentifier | undefined | null): ParsedLibraryId | null {
  if (id == null) return null;
  const value = String(id);
  if (value === DROP_ROOT_ID || value === DROP_ALL_ID) return { kind: "root" };
  if (value.startsWith("note:")) return { kind: "note", id: value.slice("note:".length) };
  if (value.startsWith("folder:")) return { kind: "folder", path: value.slice("folder:".length) };
  return null;
}

export function noteParentFolder(noteId: string): string {
  const index = noteId.lastIndexOf("/");
  return index > 0 ? noteId.slice(0, index) : "";
}

export function folderParentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : "";
}

export function isTopLevelFolder(path: string): boolean {
  return path.length > 0 && !path.includes("/");
}

export function isInsideFolder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

export function leafName(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(index + 1) : path;
}

export function pointerYFromDrag(event: {
  activatorEvent: Event;
  delta: { y: number };
}): number | null {
  const start = event.activatorEvent;
  if (!("clientY" in start)) return null;
  return (start as PointerEvent).clientY + event.delta.y;
}

export function dropModeFor(input: {
  activeType: LibraryItemType;
  overKind: ParsedLibraryId["kind"];
  overPath?: string;
  activePath?: string;
  pointerY: number | null;
  overRect: { top: number; height: number } | null;
}): DropMode {
  if (input.activeType === "note" || input.overKind !== "folder") return "into";
  const overPath = input.overPath ?? "";
  const activeTop = input.activePath != null && isTopLevelFolder(input.activePath);
  const overTop = isTopLevelFolder(overPath);
  if (!activeTop || !overTop || input.pointerY == null || !input.overRect) return "into";
  const t = (input.pointerY - input.overRect.top) / Math.max(input.overRect.height, 1);
  if (t < 0.28) return "before";
  if (t > 0.72) return "after";
  return "into";
}

export const libraryCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length === 0) return [];
  const rank = (id: UniqueIdentifier) => {
    const value = String(id);
    if (value.startsWith("note:")) return 0;
    if (value.startsWith("folder:")) return 1;
    if (value === DROP_ALL_ID) return 2;
    return 3;
  };
  return [...hits].sort((a, b) => rank(a.id) - rank(b.id));
};

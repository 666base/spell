import { SIDEBAR_MAX_PX, SIDEBAR_MIN_PX } from "./sidebar";
import type { NotesScope } from "./notesScope";

/** Keep these strings identical in `public/startup-theme.js`. */
export const INTERFACE_ZOOM_KEY = "spell-interface-zoom";
export const SIDEBAR_WIDTH_KEY = "spell-sidebar-width";
export const EDITOR_MAX_WIDTH_KEY = "spell-editor-max-width";
export const SESSION_KEY = "spell-session";

export type SessionSurface = {
  noteId: string | null;
  scope: NotesScope;
};

function appStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function writeStorage(
  key: string,
  value: string | null,
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined,
): void {
  try {
    if (!storage) return;
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Private mode must not block first paint.
  }
}

export function parseStoredZoom(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0.7 || value > 1.5) return null;
  return Math.round(value * 20) / 20;
}

export function parseStoredSidebarWidth(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < SIDEBAR_MIN_PX || value > SIDEBAR_MAX_PX) {
    return null;
  }
  return value;
}

export function parseStoredEditorMaxWidth(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  return /^\d+(?:\.\d+)?(px|rem|%)$/.test(raw) ? raw : null;
}

export function rememberInterfaceZoom(
  zoom: number,
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined = appStorage(),
): void {
  const parsed = parseStoredZoom(String(zoom));
  writeStorage(INTERFACE_ZOOM_KEY, parsed == null ? null : String(parsed), storage);
}

export function rememberSidebarWidth(
  px: number | null,
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined = appStorage(),
): void {
  if (px == null) {
    writeStorage(SIDEBAR_WIDTH_KEY, null, storage);
    return;
  }
  const parsed = parseStoredSidebarWidth(String(Math.round(px)));
  writeStorage(SIDEBAR_WIDTH_KEY, parsed == null ? null : String(parsed), storage);
}

export function rememberEditorMaxWidth(
  value: string,
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined = appStorage(),
): void {
  writeStorage(EDITOR_MAX_WIDTH_KEY, parseStoredEditorMaxWidth(value), storage);
}

export function readCachedInterfaceZoom(
  storage: Pick<Storage, "getItem"> | null | undefined = appStorage(),
): number | null {
  try {
    return parseStoredZoom(storage?.getItem(INTERFACE_ZOOM_KEY));
  } catch {
    return null;
  }
}

export function readCachedSidebarWidth(
  storage: Pick<Storage, "getItem"> | null | undefined = appStorage(),
): number | null {
  try {
    return parseStoredSidebarWidth(storage?.getItem(SIDEBAR_WIDTH_KEY));
  } catch {
    return null;
  }
}

export function applyStartupLayout(
  root: HTMLElement,
  stored: {
    zoom?: string | null;
    sidebarWidth?: string | null;
    editorMaxWidth?: string | null;
  },
): void {
  const zoom = parseStoredZoom(stored.zoom);
  if (zoom != null) root.style.zoom = String(zoom);
  const sidebar = parseStoredSidebarWidth(stored.sidebarWidth);
  if (sidebar != null) root.style.setProperty("--sidebar-width", `${sidebar}px`);
  const editorMax = parseStoredEditorMaxWidth(stored.editorMaxWidth);
  if (editorMax) root.style.setProperty("--editor-max-width", editorMax);
}

export function parseNotesScope(value: unknown): NotesScope | null {
  if (!value || typeof value !== "object") return null;
  const type = (value as { type?: unknown }).type;
  if (type === "home" || type === "all" || type === "journal" || type === "projects" || type === "money" || type === "subscriptions") {
    return { type };
  }
  if (type === "folder") {
    const path = (value as { path?: unknown }).path;
    return typeof path === "string" && path.length > 0 ? { type: "folder", path } : null;
  }
  if (type === "project") {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" && id.length > 0 ? { type: "project", id } : null;
  }
  if (type === "moneyMonth") {
    const month = (value as { month?: unknown }).month;
    return typeof month === "string" && month.length > 0 ? { type: "moneyMonth", month } : null;
  }
  return null;
}

export function parseSession(raw: unknown): SessionSurface | null {
  if (!raw || typeof raw !== "object") return null;
  const noteId = (raw as { noteId?: unknown }).noteId;
  if (noteId !== null && typeof noteId !== "string") return null;
  if (typeof noteId === "string" && noteId.length === 0) return null;
  const scope = parseNotesScope((raw as { scope?: unknown }).scope);
  if (!scope) return null;
  return { noteId, scope };
}

export function readSession(
  storage: Pick<Storage, "getItem"> | null | undefined = appStorage(),
): SessionSurface | null {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    if (!raw) return null;
    return parseSession(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function rememberSession(
  patch: Partial<SessionSurface>,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined = appStorage(),
): SessionSurface | null {
  const current = readSession(storage) ?? { noteId: null, scope: { type: "all" } };
  const next: SessionSurface = {
    noteId: patch.noteId === undefined ? current.noteId : patch.noteId,
    scope: patch.scope ?? current.scope,
  };
  try {
    storage?.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    return next;
  }
  return next;
}

export function panelForScope(scope: NotesScope): "notes" | "journal" {
  return scope.type === "journal" ? "journal" : "notes";
}

/** Folder picker only after we know there is no vault. */
export function shouldShowFolderPicker(
  isLoading: boolean,
  notesFolder: string | null,
): boolean {
  return !isLoading && !notesFolder;
}

/** Chrome stays mounted while notes load so first paint is not an empty window. */
export function shouldPaintAppChrome(
  isLoading: boolean,
  notesFolder: string | null,
): boolean {
  return isLoading || Boolean(notesFolder);
}

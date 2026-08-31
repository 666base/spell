export type LibrarySectionId = "projects" | "folders" | "money";

export interface SidebarLibrary {
  pinned: string[];
  pinOrder: string[];
  hidden: string[];
  folderOrder: string[];
  itemOrder: string[];
  collapsedFolders: string[];
  collapsed: LibrarySectionId[];
  showHidden: LibrarySectionId[];
}

const STORAGE_KEY = "spell:sidebar-library";
const LEGACY_COLLAPSED_KEY = "scratch:collapsedFolders";

const EMPTY: SidebarLibrary = {
  pinned: [],
  pinOrder: [],
  hidden: [],
  folderOrder: [],
  itemOrder: [],
  collapsedFolders: [],
  collapsed: [],
  showHidden: [],
};

export function projectItemId(id: string) {
  return `project:${id}`;
}

export function folderItemId(path: string) {
  return `folder:${path}`;
}

export function noteItemId(id: string) {
  return `note:${id}`;
}

export const MONEY_ITEM_ID = "money";

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

function loadLegacyCollapsedFolders(): string[] {
  try {
    const saved = window.localStorage.getItem(LEGACY_COLLAPSED_KEY);
    return saved ? stringList(JSON.parse(saved)) : [];
  } catch {
    return [];
  }
}

export function loadSidebarLibrary(): SidebarLibrary {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return { ...EMPTY, collapsedFolders: loadLegacyCollapsedFolders() };
    }
    const parsed = JSON.parse(saved) as Partial<SidebarLibrary>;
    return {
      pinned: stringList(parsed.pinned),
      pinOrder: stringList(parsed.pinOrder),
      hidden: stringList(parsed.hidden),
      folderOrder: stringList(parsed.folderOrder),
      itemOrder: stringList(parsed.itemOrder),
      collapsedFolders: Array.isArray(parsed.collapsedFolders)
        ? stringList(parsed.collapsedFolders)
        : loadLegacyCollapsedFolders(),
      collapsed: Array.isArray(parsed.collapsed)
        ? parsed.collapsed.filter((id): id is LibrarySectionId =>
            id === "projects" || id === "folders" || id === "money",
          )
        : [],
      showHidden: Array.isArray(parsed.showHidden)
        ? parsed.showHidden.filter((id): id is LibrarySectionId =>
            id === "projects" || id === "folders" || id === "money",
          )
        : [],
    };
  } catch {
    return EMPTY;
  }
}

export function saveSidebarLibrary(library: SidebarLibrary) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  } catch {
    // Sidebar chrome still works for this session.
  }
}

export function toggleListValue<T extends string>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function revealFolder(library: SidebarLibrary, path: string): SidebarLibrary {
  if (!path) return library;
  const parts = path.split("/").filter(Boolean);
  const chain = new Set(parts.map((_, index) => parts.slice(0, index + 1).join("/")));
  const collapsedFolders = library.collapsedFolders.filter((item) => !chain.has(item));
  if (collapsedFolders.length === library.collapsedFolders.length) return library;
  return { ...library, collapsedFolders };
}

export function orderFolders(paths: string[], order: string[]) {
  const remaining = new Set(paths);
  const sorted: string[] = [];
  for (const path of order) {
    if (remaining.has(path)) {
      sorted.push(path);
      remaining.delete(path);
    }
  }
  for (const path of paths) {
    if (remaining.has(path)) sorted.push(path);
  }
  return sorted;
}

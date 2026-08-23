export type LibrarySectionId = "projects" | "folders" | "money";

export interface SidebarLibrary {
  pinned: string[];
  pinOrder: string[];
  hidden: string[];
  folderOrder: string[];
  itemOrder: string[];
  expandedFolders: string[];
  collapsed: LibrarySectionId[];
  showHidden: LibrarySectionId[];
}

const STORAGE_KEY = "spell:sidebar-library";

const EMPTY: SidebarLibrary = {
  pinned: [],
  pinOrder: [],
  hidden: [],
  folderOrder: [],
  itemOrder: [],
  expandedFolders: [],
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

export function loadSidebarLibrary(): SidebarLibrary {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return EMPTY;
    const parsed = JSON.parse(saved) as Partial<SidebarLibrary>;
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned.filter((id) => typeof id === "string") : [],
      pinOrder: Array.isArray(parsed.pinOrder)
        ? parsed.pinOrder.filter((id) => typeof id === "string")
        : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((id) => typeof id === "string") : [],
      folderOrder: Array.isArray(parsed.folderOrder)
        ? parsed.folderOrder.filter((id) => typeof id === "string")
        : [],
      itemOrder: Array.isArray(parsed.itemOrder)
        ? parsed.itemOrder.filter((id) => typeof id === "string")
        : [],
      expandedFolders: Array.isArray(parsed.expandedFolders)
        ? parsed.expandedFolders.filter((id) => typeof id === "string")
        : [],
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

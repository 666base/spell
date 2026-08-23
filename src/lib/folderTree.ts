import type { NoteMetadata, FolderNode } from "../types/note";

export interface FolderTreeData {
  rootNotes: NoteMetadata[];
  folders: FolderNode[];
}

export function buildFolderTree(
  notes: NoteMetadata[],
  pinnedIds: Set<string>,
  knownFolders?: string[],
): FolderTreeData {
  const rootNotes: NoteMetadata[] = [];
  const folderMap = new Map<string, FolderNode>();

  function ensureFolder(path: string): FolderNode {
    const existing = folderMap.get(path);
    if (existing) return existing;

    const parts = path.split("/");
    const name = parts[parts.length - 1];
    const node: FolderNode = { name, path, children: [], notes: [] };
    folderMap.set(path, node);

    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = ensureFolder(parentPath);
      if (!parent.children.some((c) => c.path === path)) {
        parent.children.push(node);
      }
    }

    return node;
  }

  // Ensure all known disk folders exist in the tree (even if empty)
  if (knownFolders) {
    for (const folderPath of knownFolders) {
      ensureFolder(folderPath);
    }
  }

  for (const note of notes) {
    const lastSlash = note.id.lastIndexOf("/");
    if (lastSlash === -1) {
      rootNotes.push(note);
    } else {
      const folderPath = note.id.substring(0, lastSlash);
      const folder = ensureFolder(folderPath);
      folder.notes.push(note);
    }
  }

  function sortNode(node: FolderNode) {
    node.children.sort((a, b) => {
      const ap = pinnedIds.has(a.path);
      const bp = pinnedIds.has(b.path);
      if (ap !== bp) return ap ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.notes.sort((a, b) => {
      const ap = pinnedIds.has(a.id);
      const bp = pinnedIds.has(b.id);
      if (ap !== bp) return ap ? -1 : 1;
      return b.modified - a.modified;
    });
    node.children.forEach(sortNode);
  }

  const topLevelFolders = Array.from(folderMap.values()).filter(
    (f) => !f.path.includes("/"),
  );
  topLevelFolders.sort((a, b) => {
    const ap = pinnedIds.has(a.path);
    const bp = pinnedIds.has(b.path);
    if (ap !== bp) return ap ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  topLevelFolders.forEach(sortNode);

  // Sort root notes: pinned first, then by modified desc
  rootNotes.sort((a, b) => {
    const ap = pinnedIds.has(a.id);
    const bp = pinnedIds.has(b.id);
    if (ap !== bp) return ap ? -1 : 1;
    return b.modified - a.modified;
  });

  return { rootNotes, folders: topLevelFolders };
}

export type TreeItem =
  | { type: "note"; id: string }
  | { type: "folder"; path: string };

/** Build a flat list of visible tree items in DFS order (for keyboard navigation). */
export function getVisibleItems(
  tree: FolderTreeData,
  collapsedFolders: Set<string>,
): TreeItem[] {
  const items: TreeItem[] = [];

  // Folders (recursive DFS)
  function walkFolder(folder: FolderNode) {
    items.push({ type: "folder", path: folder.path });
    if (!collapsedFolders.has(folder.path)) {
      for (const child of folder.children) {
        walkFolder(child);
      }
      for (const note of folder.notes) {
        items.push({ type: "note", id: note.id });
      }
    }
  }
  for (const folder of tree.folders) {
    walkFolder(folder);
  }

  // Root notes follow the folder block in the same order as the sidebar.
  for (const note of tree.rootNotes) {
    items.push({ type: "note", id: note.id });
  }

  return items;
}

export function ancestorFolderPaths(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

export function countNotesInFolder(folder: FolderNode): number {
  let count = folder.notes.length;
  for (const child of folder.children) {
    count += countNotesInFolder(child);
  }
  return count;
}

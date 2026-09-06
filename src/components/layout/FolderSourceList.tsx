import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { cleanTitle, cn } from "../../lib/utils";
import { windowDragRegionProps } from "../../lib/windowDrag";
import { isMac } from "../../lib/platform";
import { useNotes } from "../../context/NotesContext";
import {
  ancestorFolderPaths,
  buildFolderTree,
  countNotesInFolder,
  filterFolderTree,
  filterNotesByTitle,
  findFolderNode,
} from "../../lib/folderTree";
import type { FolderNode } from "../../types/note";
import { isHomeTab, isMoneyTab, isProjectsTab, type NotesScope } from "../../lib/notesScope";
import * as notesService from "../../services/notes";
import {
  folderItemId,
  loadSidebarLibrary,
  noteItemId,
  orderFolders,
  revealFolder,
  saveSidebarLibrary,
  toggleListValue,
  togglePinned,
  type SidebarLibrary,
} from "../../lib/sidebarLibrary";
import {
  DROP_ALL_ID,
  DROP_ROOT_ID,
  LIBRARY_FOLDER_REORDER,
  type DropMode,
} from "../../lib/libraryDnd";
import { useLibraryDropState } from "./LibraryDnd";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  FolderGlyph,
  HomeGlyph,
  JournalGlyph,
  MoneyGlyph,
  ProjectsGlyph,
  GlideMenu,
  IconButton,
  InlineNameInput,
} from "../ui";
import {
  FolderPlusIcon,
  FinanceIcon,
  KanbanIcon,
  NoteIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "../icons/velocity";

interface FolderSourceListProps {
  scope: NotesScope;
  onSelectScope: (scope: NotesScope) => void;
  onNewFolder?: () => void;
}

const menuItemClass = "spell-menu-item cursor-pointer";
const menuSeparatorClass = "spell-menu-separator";
const sourceListLucide = { size: 20, strokeWidth: 1.75 } as const;

const WORKSPACE_ROWS: {
  key: "journal" | "projects" | "money";
  label: string;
  icon: typeof JournalGlyph;
  selected: (scope: NotesScope) => boolean;
  scope: NotesScope;
}[] = [
  {
    key: "journal",
    label: "Journal",
    icon: JournalGlyph,
    selected: (scope) => scope.type === "journal",
    scope: { type: "journal" },
  },
  {
    key: "projects",
    label: "Projects",
    icon: ProjectsGlyph,
    selected: isProjectsTab,
    scope: { type: "projects" },
  },
  {
    key: "money",
    label: "Money",
    icon: MoneyGlyph,
    selected: isMoneyTab,
    scope: { type: "money" },
  },
];

type MenuEntry =
  | { type?: "item"; label: string; danger?: boolean; onSelect: () => void }
  | { type: "separator" };

function pruneLibraryForFolder(library: SidebarLibrary, path: string): SidebarLibrary {
  const id = folderItemId(path);
  const nested = `${id}/`;
  const keep = (key: string) => key !== id && !key.startsWith(nested);
  const keepPath = (folderPath: string) => folderPath !== path && !folderPath.startsWith(`${path}/`);
  return {
    ...library,
    pinned: library.pinned.filter(keep),
    pinOrder: library.pinOrder.filter(keep),
    hidden: library.hidden.filter(keep),
    folderOrder: library.folderOrder.filter(keepPath),
    itemOrder: library.itemOrder.filter(keep),
    collapsedFolders: library.collapsedFolders.filter(keepPath),
  };
}

function CreateMenu({ onNewFolder }: { onNewFolder: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton size="md" title="New" className="folder-search-create">
          <PlusIcon className="create-plus-icon" />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="spell-menu z-50 min-w-40" align="end" sideOffset={6}>
          <DropdownMenu.Item
            className={menuItemClass}
            onSelect={() => onNewFolder()}
          >
            <FolderPlusIcon className="size-4" />
            Folder
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menuItemClass}
            onSelect={() => window.dispatchEvent(new CustomEvent("create-new-project"))}
          >
            <KanbanIcon className="size-4" />
            Project
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menuItemClass}
            onSelect={() => window.dispatchEvent(new CustomEvent("open-add-month"))}
          >
            <FinanceIcon className="size-4" />
            Month
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SourceRow({
  icon,
  label,
  count,
  selected,
  pinned = false,
  depth = 0,
  lineIcon = false,
  onClick,
  onToggleExpand,
  expanded = false,
  editing = false,
  editLabel = "Folder name",
  editInitialValue = "",
  onEditConfirm,
  onEditCancel,
}: {
  icon?: ReactNode;
  label: string;
  count?: number;
  selected: boolean;
  pinned?: boolean;
  depth?: number;
  lineIcon?: boolean;
  onClick: () => void;
  onToggleExpand?: () => void;
  expanded?: boolean;
  editing?: boolean;
  editLabel?: string;
  editInitialValue?: string;
  onEditConfirm?: (name: string) => void | Promise<void>;
  onEditCancel?: () => void;
}) {
  const countBadge = count != null && count > 0 && (
    <span className="source-list-count">{count}</span>
  );

  return (
    <div
      data-row
      data-selected={selected ? "true" : "false"}
      data-editing={editing ? "true" : undefined}
      data-line-icon={lineIcon ? "true" : undefined}
      className="source-list-row"
      style={{ "--source-depth": depth } as CSSProperties}
    >
      {onToggleExpand ? (
        <button
          type="button"
          className="source-list-icon source-list-folder-toggle"
          aria-label={`Toggle ${label}`}
          aria-expanded={expanded}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleExpand();
          }}
        >
          {icon}
        </button>
      ) : icon ? (
        <span className="source-list-icon">{icon}</span>
      ) : null}
      {editing && onEditConfirm && onEditCancel ? (
        <InlineNameInput
          label={editLabel}
          placeholder="Folder name"
          initialValue={editInitialValue}
          onConfirm={onEditConfirm}
          onCancel={onEditCancel}
          className="min-w-0 flex-1"
        />
      ) : (
        <button type="button" className="source-list-main" onClick={onClick}>
          <span className="source-list-label">{label}</span>
          {pinned && <PinIcon aria-hidden="true" className="source-list-pin" />}
          {countBadge}
        </button>
      )}
    </div>
  );
}

function FolderHit({
  path,
  name,
  disabled,
  children,
}: {
  path: string;
  name: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = folderItemId(path);
  const data = { type: "folder" as const, path, label: name };
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id,
    data,
    disabled,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id, data });
  const drop = useLibraryDropState();
  const setRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };
  const over = drop.overId === id && drop.activeId !== id;
  return (
    <div
      ref={setRef}
      className={cn("library-hit", isDragging && "is-dragging")}
      data-drop={over && drop.mode === "into" ? "true" : undefined}
      data-drop-line={over && drop.mode !== "into" ? drop.mode : undefined}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function NoteHit({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const itemId = noteItemId(id);
  const data = { type: "note" as const, id, label: cleanTitle(title) };
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: itemId,
    data,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: itemId, data });
  const drop = useLibraryDropState();
  const setRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };
  const over = drop.overId === itemId && drop.activeId !== itemId;
  return (
    <div
      ref={setRef}
      className={cn("library-hit", isDragging && "is-dragging")}
      data-drop={over ? "true" : undefined}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function AllNotesDrop({ children, className }: { children: ReactNode; className?: string }) {
  const { setNodeRef } = useDroppable({
    id: DROP_ALL_ID,
    data: { type: "folder", path: "", label: "Home" },
  });
  const drop = useLibraryDropState();
  return (
    <div
      ref={setNodeRef}
      className={cn("rounded-md", className)}
      data-drop={drop.overId === DROP_ALL_ID ? "true" : undefined}
    >
      {children}
    </div>
  );
}

function RootDrop({ children }: { children: ReactNode }) {
  const { setNodeRef } = useDroppable({
    id: DROP_ROOT_ID,
    data: { type: "folder", path: "", label: "Folders" },
  });
  const drop = useLibraryDropState();
  return (
    <nav
      ref={setNodeRef}
      className="source-list min-h-0 flex-1 overflow-y-auto"
      data-drop-root={drop.overId === DROP_ROOT_ID ? "true" : undefined}
    >
      {children}
    </nav>
  );
}

function ItemMenu({
  children,
  items,
}: {
  children: ReactNode;
  items: MenuEntry[];
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div data-spell-context-menu>{children}</div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          data-spell-context-menu
          className="spell-menu z-50 min-w-40"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {items.map((item, index) =>
            item.type === "separator" ? (
              <ContextMenu.Separator key={`sep-${index}`} className={menuSeparatorClass} />
            ) : (
              <ContextMenu.Item
                key={`${item.label}-${index}`}
                className={cn(menuItemClass, item.danger && "spell-menu-item-danger")}
                onSelect={item.onSelect}
              >
                {item.label}
              </ContextMenu.Item>
            ),
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function FolderNameRow({
  depth = 0,
  initialValue = "",
  onConfirm,
  onCancel,
}: {
  depth?: number;
  initialValue?: string;
  onConfirm: (name: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <SourceRow
      icon={<FolderGlyph />}
      label=""
      selected={false}
      depth={depth}
      editing
      editInitialValue={initialValue}
      onEditConfirm={onConfirm}
      onEditCancel={onCancel}
      onClick={() => {}}
    />
  );
}

function FolderNoteRow({
  id,
  title,
  depth,
  selected,
  onSelect,
}: {
  id: string;
  title: string;
  depth?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <NoteHit id={id} title={title}>
      <SourceRow
        icon={<NoteIcon {...sourceListLucide} />}
        label={cleanTitle(title)}
        selected={selected}
        depth={depth}
        lineIcon
        onClick={onSelect}
      />
    </NoteHit>
  );
}

function FolderRows({
  folders,
  depth,
  scope,
  onSelectScope,
  library,
  searching = false,
  onPin,
  onHide,
  onToggleExpand,
  onNewSubfolder,
  onRename,
  onRenameConfirm,
  onRenameCancel,
  renamingPath,
  creatingSubfolderPath,
  onCreateSubfolderConfirm,
  onCreateSubfolderCancel,
  onDelete,
}: {
  folders: FolderNode[];
  depth: number;
  scope: NotesScope;
  onSelectScope: (scope: NotesScope) => void;
  library: SidebarLibrary;
  searching?: boolean;
  onPin: (id: string) => void;
  onHide: (id: string) => void;
  onToggleExpand: (path: string) => void;
  onNewSubfolder: (folder: FolderNode) => void;
  onRename: (folder: FolderNode) => void;
  onRenameConfirm: (folder: FolderNode, name: string) => void | Promise<void>;
  onRenameCancel: () => void;
  renamingPath: string | null;
  creatingSubfolderPath: string | null;
  onCreateSubfolderConfirm: (name: string) => void | Promise<void>;
  onCreateSubfolderCancel: () => void;
  onDelete: (folder: FolderNode) => void;
}) {
  return (
    <>
      {folders.map((folder) => {
        if (folder.path === "journals" || folder.path.startsWith("journals/")) {
          return null;
        }
        const id = folderItemId(folder.path);
        if (library.pinned.includes(id)) return null;
        const visibleChildren = folder.children.filter(
          (child) => !library.pinned.includes(folderItemId(child.path)),
        );
        const hasChildren = visibleChildren.length > 0;
        const creatingHere = creatingSubfolderPath === folder.path;
        const renamingHere = renamingPath === folder.path;
        const open =
          Boolean(searching) ||
          (hasChildren && !library.collapsedFolders.includes(folder.path)) ||
          creatingHere;
        const row = (
          <ItemMenu
            items={[
              { label: library.pinned.includes(id) ? "Unpin" : "Pin", onSelect: () => onPin(id) },
              { label: library.hidden.includes(id) ? "Show" : "Hide", onSelect: () => onHide(id) },
              { type: "separator" },
              { label: "New Subfolder", onSelect: () => onNewSubfolder(folder) },
              { label: "Rename", onSelect: () => onRename(folder) },
              { type: "separator" },
              { label: "Delete Folder", danger: true, onSelect: () => onDelete(folder) },
            ]}
          >
            <SourceRow
              icon={<FolderGlyph />}
              label={folder.name}
              count={countNotesInFolder(folder)}
              pinned={library.pinned.includes(id)}
              selected={scope.type === "folder" && scope.path === folder.path}
              depth={depth}
              onClick={() => onSelectScope({ type: "folder", path: folder.path })}
              onToggleExpand={
                hasChildren || creatingHere ? () => onToggleExpand(folder.path) : undefined
              }
              expanded={open}
              editing={renamingHere}
              editInitialValue={folder.name}
              onEditConfirm={(name) => onRenameConfirm(folder, name)}
              onEditCancel={onRenameCancel}
            />
          </ItemMenu>
        );
        return (
          <div key={folder.path}>
            <FolderHit path={folder.path} name={folder.name} disabled={renamingHere}>
              {row}
            </FolderHit>
            {(hasChildren || creatingHere) && (
              <div className="source-list-children" data-open={open ? "true" : "false"}>
                <div className="source-list-children-inner">
                  {creatingHere && (
                    <FolderNameRow
                      depth={depth + 1}
                      onConfirm={onCreateSubfolderConfirm}
                      onCancel={onCreateSubfolderCancel}
                    />
                  )}
                  <FolderRows
                    folders={visibleChildren}
                    depth={depth + 1}
                    scope={scope}
                    onSelectScope={onSelectScope}
                    library={library}
                    searching={searching}
                    onPin={onPin}
                    onHide={onHide}
                    onToggleExpand={onToggleExpand}
                    onNewSubfolder={onNewSubfolder}
                    onRename={onRename}
                    onRenameConfirm={onRenameConfirm}
                    onRenameCancel={onRenameCancel}
                    renamingPath={renamingPath}
                    creatingSubfolderPath={creatingSubfolderPath}
                    onCreateSubfolderConfirm={onCreateSubfolderConfirm}
                    onCreateSubfolderCancel={onCreateSubfolderCancel}
                    onDelete={onDelete}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function FolderSourceList({
  scope,
  onSelectScope,
  onNewFolder,
}: FolderSourceListProps) {
  const { notes, selectedNoteId, selectNote, createFolder, deleteFolder, renameFolder } =
    useNotes();
  const [knownFolders, setKnownFolders] = useState<string[]>([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingSubfolder, setCreatingSubfolder] = useState<{
    path: string;
    name: string;
  } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ path: string; name: string } | null>(null);
  const [library, setLibrary] = useState<SidebarLibrary>(loadSidebarLibrary);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const persistLibrary = useCallback((next: SidebarLibrary) => {
    setLibrary(next);
    saveSidebarLibrary(next);
  }, []);

  const refreshFolders = useCallback(() => {
    notesService
      .listFolders()
      .then(setKnownFolders)
      .catch(() => setKnownFolders([]));
  }, []);

  useEffect(() => {
    refreshFolders();
  }, [notes, refreshFolders]);

  useEffect(() => {
    const startCreate = () => setCreatingFolder(true);
    window.addEventListener("create-new-folder", startCreate);
    return () => window.removeEventListener("create-new-folder", startCreate);
  }, []);

  useEffect(() => {
    const expand = (path: string) => {
      setLibrary((current) => {
        const next = revealFolder(current, path);
        if (next === current) return current;
        saveSidebarLibrary(next);
        return next;
      });
    };
    const onExpandFolder = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (path) expand(path);
    };
    window.addEventListener("expand-folder", onExpandFolder);
    return () => window.removeEventListener("expand-folder", onExpandFolder);
  }, []);

  useEffect(() => {
    if (scope.type !== "folder") return;
    const ancestors = ancestorFolderPaths(scope.path);
    if (ancestors.length === 0) return;
    setLibrary((current) => {
      const extra = ancestors.filter((path) => current.collapsedFolders.includes(path));
      if (extra.length === 0) return current;
      const skip = new Set(ancestors);
      const next = {
        ...current,
        collapsedFolders: current.collapsedFolders.filter((path) => !skip.has(path)),
      };
      saveSidebarLibrary(next);
      return next;
    });
  }, [scope]);

  const tree = useMemo(() => {
    const filteredNotes = notes.filter((n) => !n.id.startsWith("journals/") && !n.id.startsWith("_spell/"));
    const filteredFolders = knownFolders.filter((f) => !f.startsWith("journals") && !f.startsWith("_spell"));
    return buildFolderTree(filteredNotes, new Set(), filteredFolders);
  }, [notes, knownFolders]);

  const topFolders = useMemo(() => {
    const ordered = orderFolders(
      tree.folders.map((folder) => folder.path),
      library.folderOrder,
    );
    const byPath = new Map(tree.folders.map((folder) => [folder.path, folder]));
    return ordered
      .map((path) => byPath.get(path))
      .filter((folder): folder is FolderNode => Boolean(folder));
  }, [tree.folders, library.folderOrder]);

  const visibleFolders = topFolders.filter((folder) => {
    const id = folderItemId(folder.path);
    if (library.pinned.includes(id)) return false;
    return library.showHidden.includes("folders") || !library.hidden.includes(id);
  });

  const pinnedFolders = library.pinned.flatMap((id) => {
    if (!id.startsWith("folder:") || library.hidden.includes(id)) return [];
    const path = id.slice("folder:".length);
    const folder = findFolderNode(tree.folders, path);
    return folder
      ? [{ id, path, label: folder.name, count: countNotesInFolder(folder) }]
      : [];
  });

  const searching = query.trim().length > 0;
  const visiblePinnedFolders = searching
    ? pinnedFolders.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()))
    : pinnedFolders;
  const searchedFolders = useMemo(
    () => filterFolderTree(visibleFolders, query),
    [visibleFolders, query],
  );
  const searchedRootNotes = useMemo(
    () => filterNotesByTitle(tree.rootNotes, query),
    [tree.rootNotes, query],
  );
  const visibleWorkspaceRows = WORKSPACE_ROWS.filter(
    (row) => !searching || row.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const noSearchHits =
    searching &&
    visiblePinnedFolders.length === 0 &&
    searchedFolders.length === 0 &&
    searchedRootNotes.length === 0 &&
    visibleWorkspaceRows.length === 0 &&
    !creatingFolder;

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
  }, []);

  const togglePin = (id: string) => {
    persistLibrary(togglePinned(library, id));
  };
  const toggleHide = (id: string) => {
    persistLibrary({ ...library, hidden: toggleListValue(library.hidden, id) });
  };
  const toggleExpand = (path: string) => {
    persistLibrary({
      ...library,
      collapsedFolders: toggleListValue(library.collapsedFolders, path),
    });
  };

  const startCreateFolder = useCallback(() => {
    setRenaming(null);
    setCreatingSubfolder(null);
    setCreatingFolder(true);
    onNewFolder?.();
  }, [onNewFolder]);

  const startCreateSubfolder = useCallback((folder: FolderNode) => {
    setRenaming(null);
    setCreatingFolder(false);
    persistLibrary(revealFolder(library, folder.path));
    window.setTimeout(() => {
      setCreatingSubfolder({ path: folder.path, name: folder.name });
    }, 10);
  }, [library, persistLibrary]);

  const createNamedFolder = useCallback(
    async (parent: string, name: string) => {
      if (name.includes("/") || name.includes("\\")) {
        throw new Error("Folder name cannot contain slashes");
      }
      const path = parent ? `${parent}/${name}` : name;
      await createFolder(parent, name);
      setKnownFolders((current) =>
        current.includes(path) ? current : [...current, path],
      );
      if (parent) {
        persistLibrary(revealFolder(library, parent));
      }
      onSelectScope({ type: "folder", path });
      refreshFolders();
    },
    [createFolder, library, onSelectScope, persistLibrary, refreshFolders],
  );

  const handleRenameFolder = useCallback((folder: FolderNode) => {
    setCreatingFolder(false);
    setCreatingSubfolder(null);
    window.setTimeout(() => {
      setRenaming({ path: folder.path, name: folder.name });
    }, 10);
  }, []);

  const handleRenameConfirm = useCallback(
    async (path: string, currentName: string, name: string) => {
      if (name === currentName) {
        setRenaming(null);
        return;
      }
      if (name.includes("/") || name.includes("\\")) {
        toast.error("Folder name cannot contain slashes");
        throw new Error("Folder name cannot contain slashes");
      }
      try {
        await renameFolder(path, name);
        setRenaming(null);
        refreshFolders();
      } catch (error) {
        console.error(error);
        toast.error("Failed to rename folder");
        throw error;
      }
    },
    [refreshFolders, renameFolder],
  );

  const handleDeleteFolder = useCallback((folder: FolderNode) => {
    setDeleting({ path: folder.path, name: folder.name });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleting) return;
    const { path } = deleting;
    try {
      await deleteFolder(path);
      persistLibrary(pruneLibraryForFolder(library, path));
      if (
        scope.type === "folder" &&
        (scope.path === path || scope.path.startsWith(`${path}/`))
      ) {
        const parent = path.includes("/")
          ? path.slice(0, path.lastIndexOf("/"))
          : "";
        onSelectScope(parent ? { type: "folder", path: parent } : { type: "all" });
      }
      setDeleting(null);
      refreshFolders();
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete folder");
    }
  }, [deleteFolder, deleting, library, onSelectScope, persistLibrary, refreshFolders, scope]);

  const handleCreateFolder = useCallback(
    async (name: string) => {
      try {
        await createNamedFolder("", name);
        setCreatingFolder(false);
      } catch (error) {
        console.error("Failed to create folder:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to create folder",
        );
        throw error;
      }
    },
    [createNamedFolder],
  );

  const handleCreateSubfolder = useCallback(
    async (name: string) => {
      if (!creatingSubfolder) return;
      try {
        await createNamedFolder(creatingSubfolder.path, name);
        setCreatingSubfolder(null);
      } catch (error) {
        console.error("Failed to create folder:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to create folder",
        );
        throw error;
      }
    },
    [createNamedFolder, creatingSubfolder],
  );

  useEffect(() => {
    const onReorder = (event: Event) => {
      const detail = (event as CustomEvent<{ from: string; to: string; mode: DropMode }>).detail;
      if (!detail) return;
      const ordered = orderFolders(
        topFolders.map((folder) => folder.path),
        library.folderOrder,
      );
      const fromIndex = ordered.indexOf(detail.from);
      let toIndex = ordered.indexOf(detail.to);
      if (fromIndex < 0 || toIndex < 0) return;
      if (detail.mode === "after") toIndex += 1;
      if (fromIndex < toIndex) toIndex -= 1;
      persistLibrary({ ...library, folderOrder: arrayMove(ordered, fromIndex, toIndex) });
    };
    window.addEventListener(LIBRARY_FOLDER_REORDER, onReorder);
    return () => window.removeEventListener(LIBRARY_FOLDER_REORDER, onReorder);
  }, [library, persistLibrary, topFolders]);

  return (
    <div
      className="app-sidebar-surface relative flex h-full w-full select-none flex-col"
      data-folder-nav
    >
      {isMac && (
        <div
          className="app-titlebar folder-titlebar"
          {...windowDragRegionProps}
        />
      )}

      <div className="folder-search" data-open={searchOpen ? "true" : "false"}>
        <AllNotesDrop className="folder-home-wrap">
          <button
            type="button"
            className="folder-home"
            aria-label="Home"
            data-selected={isHomeTab(scope) ? "true" : "false"}
            onClick={() => onSelectScope({ type: "home" })}
          >
            <HomeGlyph />
            Home
          </button>
        </AllNotesDrop>
        <div className="folder-search-actions">
          <CreateMenu onNewFolder={startCreateFolder} />
          <button
            type="button"
            className="folder-search-trigger"
            aria-label="Search folders"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon className="icon-search-nudge size-4" />
          </button>
        </div>
        <div className="folder-search-field">
          <span className="ml-2 flex shrink-0 items-center justify-center">
            <SearchIcon className="size-3.5" />
          </span>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeSearch();
            }}
            placeholder="Search folders"
            aria-label="Search folders"
          />
          <button
            type="button"
            className="folder-search-close"
            aria-label="Close folder search"
            onClick={closeSearch}
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </div>

      <RootDrop>
          <GlideMenu activeSelector='[data-selected="true"]'>
          {visiblePinnedFolders.map((item) => (
              <div key={item.id}>
                <FolderHit path={item.path} name={item.label} disabled={renaming?.path === item.path}>
                <ItemMenu
                  items={[
                    { label: "Unpin", onSelect: () => togglePin(item.id) },
                    { label: "Hide", onSelect: () => toggleHide(item.id) },
                    { type: "separator" },
                    {
                      label: "New Subfolder",
                      onSelect: () => {
                        setRenaming(null);
                        setCreatingFolder(false);
                        window.setTimeout(() => {
                          setCreatingSubfolder({ path: item.path, name: item.label });
                        }, 10);
                      },
                    },
                    {
                      label: "Rename",
                      onSelect: () => {
                        setCreatingFolder(false);
                        setCreatingSubfolder(null);
                        window.setTimeout(() => {
                          setRenaming({ path: item.path, name: item.label });
                        }, 10);
                      },
                    },
                    { type: "separator" },
                    {
                      label: "Delete Folder",
                      danger: true,
                      onSelect: () => setDeleting({ path: item.path, name: item.label }),
                    },
                  ]}
                >
                  <SourceRow
                    icon={<FolderGlyph />}
                    label={item.label}
                    count={item.count}
                    pinned
                    selected={scope.type === "folder" && scope.path === item.path}
                    onClick={() => onSelectScope({ type: "folder", path: item.path })}
                    editing={renaming?.path === item.path}
                    editInitialValue={item.label}
                    onEditConfirm={(name) => handleRenameConfirm(item.path, item.label, name)}
                    onEditCancel={() => setRenaming(null)}
                  />
                </ItemMenu>
                </FolderHit>
                {creatingSubfolder?.path === item.path && (
                  <FolderNameRow
                    depth={1}
                    onConfirm={handleCreateSubfolder}
                    onCancel={() => setCreatingSubfolder(null)}
                  />
                )}
              </div>
            ))}
          <FolderRows
            folders={searchedFolders}
            depth={0}
            scope={scope}
            onSelectScope={onSelectScope}
            library={library}
            searching={searching}
            onPin={togglePin}
            onHide={toggleHide}
            onToggleExpand={toggleExpand}
            onNewSubfolder={startCreateSubfolder}
            onRename={handleRenameFolder}
            onRenameConfirm={(folder, name) => handleRenameConfirm(folder.path, folder.name, name)}
            onRenameCancel={() => setRenaming(null)}
            renamingPath={renaming?.path ?? null}
            creatingSubfolderPath={creatingSubfolder?.path ?? null}
            onCreateSubfolderConfirm={handleCreateSubfolder}
            onCreateSubfolderCancel={() => setCreatingSubfolder(null)}
            onDelete={handleDeleteFolder}
          />
          {creatingFolder && (
            <FolderNameRow
              onConfirm={handleCreateFolder}
              onCancel={() => setCreatingFolder(false)}
            />
          )}
          {searchedRootNotes.map((note) => (
            <FolderNoteRow
              key={note.id}
              id={note.id}
              title={note.title}
              selected={selectedNoteId === note.id}
              onSelect={() => {
                onSelectScope({ type: "all" });
                void selectNote(note.id);
              }}
            />
          ))}
          {visibleWorkspaceRows.map((row) => {
            const Icon = row.icon;
            return (
              <SourceRow
                key={row.key}
                icon={<Icon />}
                label={row.label}
                selected={row.selected(scope)}
                onClick={() => onSelectScope(row.scope)}
              />
            );
          })}
          {noSearchHits && <div className="folder-nav-empty">No folders found</div>}
          </GlideMenu>
      </RootDrop>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.name}” and all notes inside it will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteConfirm();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

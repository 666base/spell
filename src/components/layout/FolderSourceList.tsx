import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "../../lib/utils";
import { isMac } from "../../lib/platform";
import { useNotes } from "../../context/NotesContext";
import {
  ancestorFolderPaths,
  buildFolderTree,
  countNotesInFolder,
} from "../../lib/folderTree";
import type { FolderNode } from "../../types/note";
import { isMoneyTab, isProjectsTab, type NotesScope } from "../../lib/notesScope";
import * as notesService from "../../services/notes";
import {
  folderItemId,
  loadSidebarLibrary,
  orderFolders,
  saveSidebarLibrary,
  toggleListValue,
  type SidebarLibrary,
} from "../../lib/sidebarLibrary";
import { FolderGlyph, IconButton, InlineNameInput, PanelToggleIcon } from "../ui";
import {
  AllNotesIcon,
  BookIcon,
  FolderPlusIcon,
  FinanceIcon,
  KanbanIcon,
  PinIcon,
  SettingsIcon,
} from "../icons/velocity";

interface FolderSourceListProps {
  scope: NotesScope;
  onSelectScope: (scope: NotesScope) => void;
  onToggle?: () => void;
  onNewFolder?: () => void;
  onOpenSettings?: () => void;
}

const menuItemClass = "spell-menu-item cursor-pointer";

function SourceRow({
  icon,
  label,
  count,
  selected,
  pinned = false,
  depth = 0,
  onClick,
  onToggleExpand,
  expanded = false,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  selected: boolean;
  pinned?: boolean;
  depth?: number;
  onClick: () => void;
  onToggleExpand?: () => void;
  expanded?: boolean;
}) {
  const countBadge = count != null && count > 0 && (
    <span className="source-list-count">{count}</span>
  );

  return (
    <div
      data-selected={selected ? "true" : "false"}
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
      ) : (
        <span className="source-list-icon">{icon}</span>
      )}
      <button type="button" className="source-list-main" onClick={onClick}>
        <span className="source-list-label">{label}</span>
        {pinned && <PinIcon aria-hidden="true" className="source-list-pin" />}
        {countBadge}
      </button>
    </div>
  );
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function ItemMenu({
  children,
  items,
}: {
  children: ReactNode;
  items: { label: string; danger?: boolean; onSelect: () => void }[];
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div data-spell-context-menu>{children}</div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content data-spell-context-menu className="spell-menu z-50 min-w-40">
          {items.map((item, index) => (
            <ContextMenu.Item
              key={`${item.label}-${index}`}
              className={cn(menuItemClass, item.danger && "spell-menu-item-danger")}
              onSelect={item.onSelect}
            >
              {item.label}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function FolderRows({
  folders,
  depth,
  scope,
  onSelectScope,
  library,
  onPin,
  onHide,
  onToggleExpand,
}: {
  folders: FolderNode[];
  depth: number;
  scope: NotesScope;
  onSelectScope: (scope: NotesScope) => void;
  library: SidebarLibrary;
  onPin: (id: string) => void;
  onHide: (id: string) => void;
  onToggleExpand: (path: string) => void;
}) {
  return (
    <>
      {folders.map((folder) => {
        if (folder.path === "journals" || folder.path.startsWith("journals/")) {
          return null;
        }
        const id = folderItemId(folder.path);
        const hasChildren = folder.children.length > 0;
        const open = hasChildren && library.expandedFolders.includes(folder.path);
        const row = (
          <ItemMenu
            items={[
              { label: library.pinned.includes(id) ? "Unpin" : "Pin", onSelect: () => onPin(id) },
              { label: library.hidden.includes(id) ? "Show" : "Hide", onSelect: () => onHide(id) },
            ]}
          >
            <SourceRow
              icon={<FolderGlyph open={open} />}
              label={folder.name}
              count={countNotesInFolder(folder)}
              pinned={library.pinned.includes(id)}
              selected={scope.type === "folder" && scope.path === folder.path}
              depth={depth}
              onClick={() => onSelectScope({ type: "folder", path: folder.path })}
              onToggleExpand={
                hasChildren ? () => onToggleExpand(folder.path) : undefined
              }
              expanded={open}
            />
          </ItemMenu>
        );
        return (
          <div key={folder.path}>
            {depth === 0 ? <SortableRow id={id}>{row}</SortableRow> : row}
            {hasChildren && (
              <div className="source-list-children" data-open={open ? "true" : "false"}>
                <div className="source-list-children-inner">
                  <FolderRows
                    folders={folder.children}
                    depth={depth + 1}
                    scope={scope}
                    onSelectScope={onSelectScope}
                    library={library}
                    onPin={onPin}
                    onHide={onHide}
                    onToggleExpand={onToggleExpand}
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
  onToggle,
  onNewFolder,
  onOpenSettings,
}: FolderSourceListProps) {
  const { notes, createFolder } = useNotes();
  const [knownFolders, setKnownFolders] = useState<string[]>([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [library, setLibrary] = useState<SidebarLibrary>(loadSidebarLibrary);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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
    if (scope.type !== "folder") return;
    const ancestors = ancestorFolderPaths(scope.path);
    if (ancestors.length === 0) return;
    setLibrary((current) => {
      const missing = ancestors.filter((path) => !current.expandedFolders.includes(path));
      if (missing.length === 0) return current;
      const next = { ...current, expandedFolders: [...current.expandedFolders, ...missing] };
      saveSidebarLibrary(next);
      return next;
    });
  }, [scope]);

  const tree = useMemo(() => {
    const filteredNotes = notes.filter((n) => !n.id.startsWith("journals/"));
    const filteredFolders = knownFolders.filter((f) => !f.startsWith("journals"));
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
    const folder = topFolders.find((item) => item.path === path);
    return folder
      ? [{ id, path, label: folder.name, count: countNotesInFolder(folder) }]
      : [];
  });

  const togglePin = (id: string) => {
    persistLibrary({ ...library, pinned: toggleListValue(library.pinned, id) });
  };
  const toggleHide = (id: string) => {
    persistLibrary({ ...library, hidden: toggleListValue(library.hidden, id) });
  };
  const toggleExpand = (path: string) => {
    persistLibrary({ ...library, expandedFolders: toggleListValue(library.expandedFolders, path) });
  };

  const startCreateFolder = useCallback(() => {
    setCreatingFolder(true);
    onNewFolder?.();
  }, [onNewFolder]);

  const handleCreateFolder = useCallback(
    async (name: string) => {
      const parent = scope.type === "folder" ? scope.path : "";
      const path = parent ? `${parent}/${name}` : name;
      try {
        await createFolder(parent, name);
        setKnownFolders((current) =>
          current.includes(path) ? current : [...current, path],
        );
        if (parent) {
          persistLibrary({
            ...library,
            expandedFolders: library.expandedFolders.includes(parent)
              ? library.expandedFolders
              : [...library.expandedFolders, parent],
          });
        }
        setCreatingFolder(false);
        onSelectScope({ type: "folder", path });
        refreshFolders();
      } catch (error) {
        console.error("Failed to create folder:", error);
        toast.error("Failed to create folder");
        throw error;
      }
    },
    [createFolder, library, onSelectScope, persistLibrary, refreshFolders, scope],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const overId = event.over?.id ? String(event.over.id) : null;
      const activeId = String(event.active.id);
      if (!overId || activeId === overId) return;
      if (!activeId.startsWith("folder:") || !overId.startsWith("folder:")) return;
      const from = activeId.slice("folder:".length);
      const to = overId.slice("folder:".length);
      const ordered = orderFolders(
        topFolders.map((folder) => folder.path),
        library.folderOrder,
      );
      const oldIndex = ordered.indexOf(from);
      const newIndex = ordered.indexOf(to);
      if (oldIndex < 0 || newIndex < 0) return;
      persistLibrary({ ...library, folderOrder: arrayMove(ordered, oldIndex, newIndex) });
    },
    [library, persistLibrary, topFolders],
  );

  const folderIds = visibleFolders.map((folder) => folderItemId(folder.path));

  return (
    <div className="relative flex h-full w-full select-none flex-col bg-bg-secondary">
      <div
        className={cn(
          "app-titlebar flex h-11 shrink-0 items-center gap-1 px-2",
          isMac && "pl-20",
        )}
        data-tauri-drag-region
      >
        <div className="titlebar-no-drag flex items-center gap-px" data-tauri-drag-region="false">
          {onToggle && (
            <IconButton size="sm" title="Hide folders" onClick={onToggle} aria-expanded>
              <PanelToggleIcon side="left" open />
            </IconButton>
          )}
          <IconButton
            size="sm"
            title="All Notes"
            pressed={scope.type === "all"}
            onClick={() => onSelectScope({ type: "all" })}
          >
            <AllNotesIcon />
          </IconButton>
          <IconButton
            size="sm"
            title="Journal"
            pressed={scope.type === "journal"}
            onClick={() => onSelectScope({ type: "journal" })}
          >
            <BookIcon />
          </IconButton>
          <IconButton
            size="sm"
            title="Projects"
            pressed={isProjectsTab(scope)}
            onClick={() => onSelectScope({ type: "projects" })}
          >
            <KanbanIcon />
          </IconButton>
          <IconButton
            size="sm"
            title="Money"
            pressed={isMoneyTab(scope)}
            onClick={() => onSelectScope({ type: "money" })}
          >
            <FinanceIcon />
          </IconButton>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <nav className="source-list min-h-0 flex-1 overflow-y-auto">
          {pinnedFolders.length > 0 &&
            pinnedFolders.map((item) => (
              <ItemMenu
                key={item.id}
                items={[
                  { label: "Unpin", onSelect: () => togglePin(item.id) },
                  { label: "Hide", onSelect: () => toggleHide(item.id) },
                ]}
              >
                <SourceRow
                  icon={
                    <FolderGlyph
                      open={scope.type === "folder" && scope.path === item.path}
                    />
                  }
                  label={item.label}
                  count={item.count}
                  pinned
                  selected={scope.type === "folder" && scope.path === item.path}
                  onClick={() => onSelectScope({ type: "folder", path: item.path })}
                />
              </ItemMenu>
            ))}
          <SortableContext items={folderIds} strategy={verticalListSortingStrategy}>
            <FolderRows
              folders={visibleFolders}
              depth={0}
              scope={scope}
              onSelectScope={onSelectScope}
              library={library}
              onPin={togglePin}
              onHide={toggleHide}
              onToggleExpand={toggleExpand}
            />
            {creatingFolder && (
              <div className="source-list-row">
                <span className="source-list-icon">
                  <FolderGlyph />
                </span>
                <InlineNameInput
                  label="Folder name"
                  placeholder="Folder name"
                  onConfirm={handleCreateFolder}
                  onCancel={() => setCreatingFolder(false)}
                  className="min-w-0 flex-1"
                />
              </div>
            )}
          </SortableContext>
        </nav>
      </DndContext>

      <div className="titlebar-no-drag flex items-center gap-px border-t border-border px-2 py-1">
        <IconButton size="sm" title="New folder" onClick={startCreateFolder}>
          <FolderPlusIcon />
        </IconButton>
        <div className="flex-1" />
        {onOpenSettings && (
          <IconButton size="sm" title="Settings" onClick={onOpenSettings}>
            <SettingsIcon />
          </IconButton>
        )}
      </div>
    </div>
  );
}

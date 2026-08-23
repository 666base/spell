import { memo, useCallback, useEffect, useMemo, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { cn } from "../../lib/utils";
import { useKanbanWorkspace } from "../../context/KanbanWorkspaceContext";
import { overviewSubtitle, projectListSubtitle } from "../../lib/kanban";
import {
  loadSidebarLibrary,
  projectItemId,
  saveSidebarLibrary,
  toggleListValue,
  type SidebarLibrary,
} from "../../lib/sidebarLibrary";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  InlineNameInput,
} from "../ui";
import { KanbanIcon, PinIcon, PlusIcon } from "../icons/velocity";
import type { KanbanProject } from "../../types/note";

const menuItemClass = "spell-menu-item cursor-pointer";

interface ProjectListProps {
  selectedId: string | null;
  overviewSelected?: boolean;
  onSelect: (id: string) => void;
  onSelectOverview?: () => void;
  onCreated: (id: string) => void;
  onDeletedSelected: () => void;
}

export function ProjectList({
  selectedId,
  overviewSelected = false,
  onSelect,
  onSelectOverview,
  onCreated,
  onDeletedSelected,
}: ProjectListProps) {
  const { workspace, createProject, updateProject, deleteProject } = useKanbanWorkspace();
  const [library, setLibrary] = useState<SidebarLibrary>(loadSidebarLibrary);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const persistLibrary = useCallback((next: SidebarLibrary) => {
    setLibrary(next);
    saveSidebarLibrary(next);
  }, []);

  const createAndRename = useCallback(() => {
    const project = createProject({ name: "Untitled", template: "blank" });
    onCreated(project.id);
    setRenamingId(project.id);
  }, [createProject, onCreated]);

  useEffect(() => {
    const onCreate = () => createAndRename();
    window.addEventListener("create-new-project", onCreate);
    return () => window.removeEventListener("create-new-project", onCreate);
  }, [createAndRename]);

  const ordered = useMemo(() => {
    const pinned: KanbanProject[] = [];
    const rest: KanbanProject[] = [];
    for (const project of workspace.projects) {
      if (library.pinned.includes(projectItemId(project.id))) pinned.push(project);
      else rest.push(project);
    }
    return [...pinned, ...rest];
  }, [library.pinned, workspace.projects]);

  const deleting = workspace.projects.find((project) => project.id === deleteId) ?? null;

  return (
    <div className="flex h-full flex-col bg-bg-secondary">
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pt-2.5 pb-2">
        {onSelectOverview && (
          <div className="px-1.5 pb-1">
            <OverviewRow
              subtitle={overviewSubtitle(workspace)}
              selected={overviewSelected}
              onSelect={onSelectOverview}
            />
          </div>
        )}
        {ordered.length === 0 ? (
          !onSelectOverview && (
            <p className="px-3 py-10 text-center text-[13px] text-text-muted">No projects yet</p>
          )
        ) : (
          ordered.map((project) => {
            const itemId = projectItemId(project.id);
            const pinned = library.pinned.includes(itemId);
            return (
              <div key={project.id} className="px-1.5 pb-1">
                <ProjectRow
                  project={project}
                  selected={selectedId === project.id}
                  pinned={pinned}
                  renaming={renamingId === project.id}
                  onSelect={() => onSelect(project.id)}
                  onCreate={createAndRename}
                  onPin={() => persistLibrary({ ...library, pinned: toggleListValue(library.pinned, itemId) })}
                  onRename={() => setRenamingId(project.id)}
                  onRenameConfirm={(name) => {
                    updateProject({ ...project, name });
                    setRenamingId(null);
                  }}
                  onRenameCancel={() => setRenamingId(null)}
                  onDelete={() => setDeleteId(project.id)}
                />
              </div>
            );
          })
        )}
      </div>

      <div className="titlebar-no-drag shrink-0 border-t border-border px-2 py-1">
        <button
          type="button"
          onClick={createAndRename}
          className="motion-interactive flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-text-muted hover:bg-bg-hover hover:text-text"
        >
          <PlusIcon className="size-4 shrink-0" />
          New Project
        </button>
      </div>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This project and its tasks will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteId) return;
                const wasSelected = selectedId === deleteId;
                deleteProject(deleteId);
                setDeleteId(null);
                if (wasSelected) onDeletedSelected();
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

const OverviewRow = memo(function OverviewRow({
  subtitle,
  selected,
  onSelect,
}: {
  subtitle: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-selected={selected ? "true" : "false"}
      className={cn("note-row flex w-full items-start gap-2 rounded-[8px] px-3 py-[9px] text-left", selected && "note-row-selected")}
    >
      <KanbanIcon className="mt-0.5 size-4 shrink-0 text-text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block min-w-0 truncate text-[13px] font-semibold leading-[18px] tracking-[-0.01em] text-text">
          Overview
        </span>
        <span className="mt-0.5 block truncate text-[12px] leading-4 text-text-muted">
          {subtitle}
        </span>
      </span>
    </button>
  );
});

const ProjectRow = memo(function ProjectRow({
  project,
  selected,
  pinned,
  renaming,
  onSelect,
  onCreate,
  onPin,
  onRename,
  onRenameConfirm,
  onRenameCancel,
  onDelete,
}: {
  project: KanbanProject;
  selected: boolean;
  pinned: boolean;
  renaming: boolean;
  onSelect: () => void;
  onCreate: () => void;
  onPin: () => void;
  onRename: () => void;
  onRenameConfirm: (name: string) => void;
  onRenameCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div data-spell-context-menu>
          {renaming ? (
            <div className="flex items-center rounded-[8px] px-3 py-[9px]">
              <InlineNameInput
                label="Project name"
                placeholder="Project name"
                initialValue={project.name === "Untitled" ? "" : project.name}
                onConfirm={onRenameConfirm}
                onCancel={onRenameCancel}
                className="min-w-0 flex-1"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={onSelect}
              data-selected={selected ? "true" : "false"}
              className={cn("note-row flex w-full items-start rounded-[8px] px-3 py-[9px] text-left", selected && "note-row-selected")}
            >
              <span className="min-w-0 flex-1">
                <span className="note-row-title-line">
                  <span className="note-row-title">{project.name}</span>
                  {pinned && <PinIcon aria-hidden="true" className="source-list-pin" />}
                </span>
                <span className="mt-0.5 block truncate text-[12px] leading-4 text-text-muted">
                  {projectListSubtitle(project)}
                </span>
              </span>
            </button>
          )}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content data-spell-context-menu className="spell-menu z-50 min-w-40">
          <ContextMenu.Item className={menuItemClass} onSelect={onCreate}>
            New Project
          </ContextMenu.Item>
          <ContextMenu.Separator className="spell-menu-separator" />
          <ContextMenu.Item className={menuItemClass} onSelect={onPin}>
            {pinned ? "Unpin" : "Pin"}
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} onSelect={onRename}>
            Rename
          </ContextMenu.Item>
          <ContextMenu.Separator className="spell-menu-separator" />
          <ContextMenu.Item className={cn(menuItemClass, "spell-menu-item-danger")} onSelect={onDelete}>
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

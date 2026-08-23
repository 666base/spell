import { useCallback, useMemo } from "react";
import { useKanbanWorkspace } from "../../context/KanbanWorkspaceContext";
import {
  dueTasks,
  formatDueDate,
  recentTasks,
  type ProjectTaskItem,
} from "../../lib/kanban";
import { playCheckAnimation } from "../../lib/checkAnimation";
import { cn } from "../../lib/utils";
import type { KanbanProject } from "../../types/note";
import { NoteTitlebar } from "../layout/NoteTitlebar";
import { CheckmarkIcon } from "../ui/StateIcon";

interface ProjectsHubProps {
  sidebarVisible?: boolean;
  focusMode?: boolean;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  showWindowControls?: boolean;
  hideTitleBar?: boolean;
  onOpenProject?: (projectId: string, cardId: string) => void;
}

export function ProjectsHub({
  sidebarVisible = true,
  focusMode = false,
  onToggleSidebar,
  onNewNote,
  showWindowControls = false,
  hideTitleBar = false,
  onOpenProject,
}: ProjectsHubProps) {
  const { workspace, isLoading, updateProject } = useKanbanWorkspace();
  const dues = useMemo(() => dueTasks(workspace), [workspace]);
  const recent = useMemo(() => recentTasks(workspace), [workspace]);
  const empty = dues.length === 0 && recent.length === 0;

  const openTask = useCallback((item: ProjectTaskItem) => {
    onOpenProject?.(item.projectId, item.card.id);
  }, [onOpenProject]);

  const toggleDone = useCallback((item: ProjectTaskItem) => {
    const project = workspace.projects.find((current) => current.id === item.projectId);
    if (!project) return;
    updateProject(setCardCompleted(project, item.card.id, item.card.completed !== true));
  }, [updateProject, workspace.projects]);

  const titlebar = (
    <NoteTitlebar
      sidebarVisible={sidebarVisible}
      focusMode={focusMode}
      onToggleSidebar={onToggleSidebar}
      onNewNote={onNewNote}
      showWindowControls={showWindowControls}
      showTools={false}
      center={<span className="titlebar-title">Projects</span>}
    />
  );

  if (isLoading) {
    return (
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg">
        {!hideTitleBar && titlebar}
        <div className="flex-1 bg-bg" />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg">
      {!hideTitleBar && titlebar}
      <div className="relative min-h-0 flex-1">
        {hideTitleBar ? (
          <div className="mobile-money">
            {empty && workspace.projects.length === 0 && (
              <section className="mobile-group">
                <div className="mobile-group-card">
                  <button
                    type="button"
                    className="mobile-folder-row"
                    onClick={() => window.dispatchEvent(new CustomEvent("create-new-project"))}
                  >
                    <span className="mobile-folder-label">New Project</span>
                  </button>
                </div>
              </section>
            )}
            {dues.length > 0 && (
              <section className="mobile-group">
                <h2 className="mobile-group-title">Due</h2>
                <div className="mobile-group-card">
                  {dues.map((item) => (
                    <OverviewTaskRow
                      key={`${item.projectId}:${item.card.id}`}
                      item={item}
                      onOpen={() => openTask(item)}
                      onToggleDone={() => toggleDone(item)}
                    />
                  ))}
                </div>
              </section>
            )}
            {recent.length > 0 && (
              <section className="mobile-group">
                <h2 className="mobile-group-title">Recent</h2>
                <div className="mobile-group-card">
                  {recent.map((item) => (
                    <OverviewTaskRow
                      key={`${item.projectId}:${item.card.id}`}
                      item={item}
                      onOpen={() => openTask(item)}
                      onToggleDone={() => toggleDone(item)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <div
              className="prose mx-auto w-full px-6 pt-3 pb-24"
              style={{ maxWidth: "var(--editor-max-width, 48rem)" }}
            >
              {empty && (
                <div className="not-prose mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)] text-text-muted">
                  {workspace.projects.length === 0 ? (
                    <button
                      type="button"
                      className="hover:text-text"
                      onClick={() => window.dispatchEvent(new CustomEvent("create-new-project"))}
                    >
                      New Project
                    </button>
                  ) : (
                    <span>Caught up</span>
                  )}
                </div>
              )}
              {dues.map((item) => (
                <OverviewTaskRow
                  key={`${item.projectId}:${item.card.id}`}
                  item={item}
                  onOpen={() => openTask(item)}
                  onToggleDone={() => toggleDone(item)}
                />
              ))}
              {recent.map((item) => (
                <OverviewTaskRow
                  key={`${item.projectId}:${item.card.id}`}
                  item={item}
                  onOpen={() => openTask(item)}
                  onToggleDone={() => toggleDone(item)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function setCardCompleted(project: KanbanProject, cardId: string, completed: boolean): KanbanProject {
  return {
    ...project,
    board: {
      ...project.board,
      cards: project.board.cards.map((card) => (
        card.id === cardId ? { ...card, completed, updatedAt: Date.now() } : card
      )),
    },
  };
}

function OverviewTaskRow({
  item,
  onOpen,
  onToggleDone,
}: {
  item: ProjectTaskItem;
  onOpen: () => void;
  onToggleDone: () => void;
}) {
  const due = formatDueDate(item.card.dueDate);
  const done = item.card.completed === true;

  return (
    <div className="not-prose flex w-full items-start gap-2 py-1.5 text-left text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)]">
      <button
        type="button"
        aria-label={done ? `Mark ${item.card.title} not done` : `Mark ${item.card.title} done`}
        aria-pressed={done}
        onClick={(event) => {
          event.stopPropagation();
          if (!done) playCheckAnimation(event.currentTarget).catch(() => {});
          onToggleDone();
        }}
        className={cn("kanban-done-toggle mt-1 size-[18px]", done && "is-checked")}
      >
        <CheckmarkIcon checked={done} className="size-2.5" />
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-text">{item.card.title || "Untitled"}</span>
        <span className="block truncate text-[12px] leading-4 text-text-muted">
          {item.projectName}
          {item.columnTitle ? ` · ${item.columnTitle}` : ""}
          {due ? " · " : ""}
          {due && (
            <span className={due.tone === "overdue" ? "text-[var(--color-menu-danger)]" : undefined}>
              {due.label}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

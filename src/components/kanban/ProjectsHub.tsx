import { useCallback, useMemo, type ReactNode } from "react";
import { useKanbanWorkspace } from "../../context/KanbanWorkspaceContext";
import {
  dueTasks,
  formatDueDate,
  openTaskCount,
  overviewDueCount,
  overviewOpenCount,
  projectListSubtitle,
  recentTasks,
  withCardCompleted,
  withCardInColumn,
  type ProjectTaskItem,
} from "../../lib/kanban";
import type { ColumnColorId } from "../../types/note";
import { cn } from "../../lib/utils";
import { NoteTitlebar } from "../layout/NoteTitlebar";
import { CheckmarkIcon } from "../ui/StateIcon";
import { StatusPicker, checkStatusColor } from "./StatusChip";

interface ProjectsHubProps {
  sidebarVisible?: boolean;
  focusMode?: boolean;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  showWindowControls?: boolean;
  hideTitleBar?: boolean;
  onOpenProject?: (projectId: string, cardId?: string) => void;
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
  const openCount = overviewOpenCount(workspace);
  const dueCount = overviewDueCount(workspace);
  const emptyInbox = dues.length === 0 && recent.length === 0;

  const openTask = useCallback((item: ProjectTaskItem) => {
    onOpenProject?.(item.projectId, item.card.id);
  }, [onOpenProject]);

  const toggleDone = useCallback((item: ProjectTaskItem) => {
    const project = workspace.projects.find((current) => current.id === item.projectId);
    if (!project) return;
    updateProject({
      ...project,
      board: withCardCompleted(project.board, item.card.id, item.card.completed !== true),
    });
  }, [updateProject, workspace.projects]);

  const moveTask = useCallback((item: ProjectTaskItem, columnId: string) => {
    const project = workspace.projects.find((current) => current.id === item.projectId);
    if (!project) return;
    updateProject({
      ...project,
      board: withCardInColumn(project.board, item.card.id, columnId),
    });
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

  const content = (
    <>
      <header className="money-hero">
        <p className="money-hero-label">Open</p>
        <p className="money-hero-value">{openCount}</p>
        <p className="money-hero-split">
          <span>
            Due <strong>{dueCount}</strong>
          </span>
          <span>
            Projects <strong>{workspace.projects.length}</strong>
          </span>
        </p>
      </header>

      {workspace.projects.length === 0 && (
        <InboxGroup>
          <button
            type="button"
            className="money-row"
            onClick={() => window.dispatchEvent(new CustomEvent("create-new-project"))}
          >
            <span className="money-row-title">New Project</span>
          </button>
        </InboxGroup>
      )}

      {dues.length > 0 && (
        <InboxGroup title="Due">
          {dues.map((item) => (
            <OverviewTaskRow
              key={`${item.projectId}:${item.card.id}`}
              item={item}
              columns={workspace.projects.find((project) => project.id === item.projectId)?.board.columns ?? []}
              onOpen={() => openTask(item)}
              onToggleDone={() => toggleDone(item)}
              onMove={(columnId) => moveTask(item, columnId)}
            />
          ))}
        </InboxGroup>
      )}

      {recent.length > 0 && (
        <InboxGroup>
          {recent.map((item) => (
            <OverviewTaskRow
              key={`${item.projectId}:${item.card.id}`}
              item={item}
              columns={workspace.projects.find((project) => project.id === item.projectId)?.board.columns ?? []}
              onOpen={() => openTask(item)}
              onToggleDone={() => toggleDone(item)}
              onMove={(columnId) => moveTask(item, columnId)}
            />
          ))}
        </InboxGroup>
      )}

      {emptyInbox && workspace.projects.length > 0 && (
        <InboxGroup>
          {workspace.projects.map((project) => {
            const open = openTaskCount(project);
            return (
              <button
                key={project.id}
                type="button"
                className="money-row"
                onClick={() => onOpenProject?.(project.id)}
              >
                <span className="money-row-main">
                  <span className="money-row-title">{project.name || "Untitled"}</span>
                  <span className="money-row-meta">{projectListSubtitle(project)}</span>
                </span>
                {open > 0 && (
                  <span className="money-row-amount is-muted">{open}</span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            className="money-row"
            onClick={() => window.dispatchEvent(new CustomEvent("create-new-project"))}
          >
            <span className="money-row-title">New Project</span>
          </button>
        </InboxGroup>
      )}
    </>
  );

  if (isLoading) {
    return (
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg-secondary">
        {!hideTitleBar && titlebar}
        <div className="flex-1 bg-bg-secondary" />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-secondary">
      {!hideTitleBar && titlebar}
      <div className="relative min-h-0 flex-1">
        {hideTitleBar ? (
          <div className="mobile-money">{content}</div>
        ) : (
          <div className="money-page">
            <div className="money-page-inner">{content}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function InboxGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="money-group">
      {title && <h2 className="money-group-title">{title}</h2>}
      <div className="money-group-card">{children}</div>
    </section>
  );
}

function OverviewTaskRow({
  item,
  columns,
  onOpen,
  onToggleDone,
  onMove,
}: {
  item: ProjectTaskItem;
  columns: { id: string; title: string; color?: ColumnColorId }[];
  onOpen: () => void;
  onToggleDone: () => void;
  onMove: (columnId: string) => void;
}) {
  const due = formatDueDate(item.card.dueDate);
  const done = item.card.completed === true;
  const meta = [item.projectName, due?.label].filter(Boolean).join(" · ");

  return (
    <div className="money-row">
      <button
        type="button"
        aria-label={done ? `Mark ${item.card.title} not done` : `Mark ${item.card.title} done`}
        aria-pressed={done}
        data-color={checkStatusColor(item.columnTitle, item.columnColor)}
        data-pager-ignore
        onClick={(event) => {
          event.stopPropagation();
          onToggleDone();
        }}
        className={cn("money-row-check kanban-check", done && "is-checked")}
      >
        <CheckmarkIcon checked={done} className="size-2.5" />
      </button>
      <button type="button" onClick={onOpen} className="money-row-main">
        <span className={cn("money-row-title", done && "is-done")}>
          {item.card.title || "Untitled"}
        </span>
        <span className={cn("money-row-meta", due?.tone === "overdue" && "is-overdue")}>
          {meta}
        </span>
      </button>
      <StatusPicker
        title={item.columnTitle}
        color={item.columnColor}
        value={item.columnId}
        columns={columns}
        onChange={onMove}
        size="sm"
        className="shrink-0"
      />
    </div>
  );
}

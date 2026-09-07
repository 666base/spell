import { useCallback, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { useKanbanWorkspace } from "../../context/KanbanWorkspaceContext";
import {
  dueDateKeys,
  dueProjectIds,
  dueTasks,
  formatDueDate,
  matchesActivity,
  openTaskCount,
  overviewDueCount,
  overviewOpenCount,
  projectClient,
  projectListSubtitle,
  projectsForClient,
  recentTasks,
  sameClient,
  tasksOnDate,
  withCardCompleted,
  withCardInColumn,
  workspaceClients,
  type ProjectActivityFilter,
  type ProjectTaskItem,
  type WorkspaceClient,
} from "../../lib/kanban";
import { isSameLocalDay, startOfLocalDay } from "../../lib/journal";
import type { ColumnColorId } from "../../types/note";
import { cn } from "../../lib/utils";
import { NoteTitlebar } from "../layout/NoteTitlebar";
import { IconButton, SegmentedControl, Select } from "../ui";
import { CheckmarkIcon } from "../ui/StateIcon";
import { StatusPicker, checkStatusColor } from "./StatusChip";
import { CalendarIcon } from "../icons/velocity";
import { JournalCalendar, type JournalCalendarMode } from "../journal/JournalCalendar";

const ALL_CLIENTS = "all";
const NO_CLIENT = "none";
const ACTIVITY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "due", label: "Due" },
] as const;

interface ProjectsHubProps {
  sidebarVisible?: boolean;
  foldersVisible?: boolean;
  focusMode?: boolean;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  showWindowControls?: boolean;
  hideTitleBar?: boolean;
  onOpenProject?: (projectId: string, cardId?: string) => void;
}

export function ProjectsHub({
  sidebarVisible = true,
  foldersVisible,
  focusMode = false,
  onToggleSidebar,
  onNewNote,
  showWindowControls = false,
  hideTitleBar = false,
  onOpenProject,
}: ProjectsHubProps) {
  const { workspace, isLoading, patchProjectBoard } = useKanbanWorkspace();
  const [clientFilter, setClientFilter] = useState(ALL_CLIENTS);
  const [activity, setActivity] = useState<ProjectActivityFilter>("all");
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay());
  const [calendarMode, setCalendarMode] = useState<JournalCalendarMode>("week");
  const today = useMemo(() => startOfLocalDay(), []);
  const selectedClient = clientFilter === ALL_CLIENTS ? null : clientFilter;
  const clients = useMemo(() => workspaceClients(workspace), [workspace]);
  const unassigned = useMemo(
    () => workspace.projects.filter((project) => !projectClient(project)),
    [workspace],
  );
  const dueIds = useMemo(() => dueProjectIds(workspace), [workspace]);
  const clientRows = useMemo(() => {
    const rows: Array<WorkspaceClient & { id: string }> = clients.map((client) => ({
      ...client,
      id: client.name,
    }));
    if (unassigned.length === 0) return rows;
    rows.push({
      id: NO_CLIENT,
      name: "No client",
      projectCount: unassigned.length,
      openCount: unassigned.reduce((total, project) => total + openTaskCount(project), 0),
      updatedAt: Math.max(...unassigned.map((project) => project.updatedAt)),
    });
    return rows;
  }, [clients, unassigned]);
  const visibleClients = useMemo(
    () => clientRows.filter((client) => {
      const hasDue = client.id === NO_CLIENT
        ? unassigned.some((project) => dueIds.has(project.id))
        : projectsForClient(workspace, client.name).some((project) => dueIds.has(project.id));
      return matchesActivity(activity, client.openCount, hasDue);
    }),
    [activity, clientRows, dueIds, unassigned, workspace],
  );
  const clientProjects = useMemo(() => {
    if (clientFilter === ALL_CLIENTS) return [];
    const source = clientFilter === NO_CLIENT
      ? unassigned
      : projectsForClient(workspace, clientFilter);
    return source.filter((project) => (
      matchesActivity(activity, openTaskCount(project), dueIds.has(project.id))
    ));
  }, [activity, clientFilter, dueIds, unassigned, workspace]);
  const clientIds = useMemo(() => {
    if (clientFilter === ALL_CLIENTS) return null;
    const ids = clientFilter === NO_CLIENT
      ? unassigned.map((project) => project.id)
      : projectsForClient(workspace, clientFilter).map((project) => project.id);
    return new Set(ids);
  }, [clientFilter, unassigned, workspace]);
  const dueKeys = useMemo(() => dueDateKeys(workspace, clientIds), [clientIds, workspace]);
  const dayKey = format(selectedDate, "yyyy-MM-dd");
  const dayTasks = useMemo(
    () => tasksOnDate(workspace, dayKey, clientIds),
    [clientIds, dayKey, workspace],
  );
  const viewingDay = dayTasks.length > 0;
  const dues = useMemo(
    () => dueTasks(workspace).filter((item) => (
      (!clientIds || clientIds.has(item.projectId)) &&
      (activity !== "open" || item.card.completed !== true) &&
      (!viewingDay || item.card.dueDate === dayKey)
    )),
    [activity, clientIds, dayKey, viewingDay, workspace],
  );
  const recent = useMemo(
    () => recentTasks(workspace).filter((item) => (
      (!clientIds || clientIds.has(item.projectId)) &&
      activity !== "due" &&
      !viewingDay
    )),
    [activity, clientIds, viewingDay, workspace],
  );
  const focus = selectedClient && selectedClient !== NO_CLIENT
    ? clients.find((client) => sameClient(client.name, selectedClient))
    : null;
  const openCount = focus ? focus.openCount : overviewOpenCount(workspace);
  const dueCount = selectedClient
    ? dues.filter((item) => item.card.completed !== true).length
    : overviewDueCount(workspace);
  const projectCount = focus
    ? focus.projectCount
    : clientFilter === NO_CLIENT
      ? unassigned.length
      : workspace.projects.length;
  const emptyInbox = !viewingDay && dues.length === 0 && recent.length === 0;
  const showingProjects = clientFilter !== ALL_CLIENTS;
  const tableCount = showingProjects ? clientProjects.length : visibleClients.length;
  const showToday = !isSameLocalDay(selectedDate, today);
  const dateTitle = format(selectedDate, "MMMM d");

  const selectDate = useCallback((date: Date) => {
    setSelectedDate(startOfLocalDay(date));
  }, []);

  const openTask = useCallback((item: ProjectTaskItem) => {
    onOpenProject?.(item.projectId, item.card.id);
  }, [onOpenProject]);

  const toggleDone = useCallback((item: ProjectTaskItem) => {
    patchProjectBoard(item.projectId, (board) => (
      withCardCompleted(board, item.card.id, item.card.completed !== true)
    ));
  }, [patchProjectBoard]);

  const moveTask = useCallback((item: ProjectTaskItem, columnId: string) => {
    patchProjectBoard(item.projectId, (board) => withCardInColumn(board, item.card.id, columnId));
  }, [patchProjectBoard]);

  const calendarToggle = !focusMode ? (
    <IconButton
      size="sm"
      title={calendarMode === "month" ? "Collapse calendar" : "Expand calendar"}
      pressed={calendarMode === "month"}
      aria-expanded={calendarMode === "month"}
      onClick={() => setCalendarMode((current) => current === "week" ? "month" : "week")}
    >
      <CalendarIcon />
    </IconButton>
  ) : null;

  const titlebar = (
    <NoteTitlebar
      sidebarVisible={sidebarVisible}
      foldersVisible={foldersVisible}
      focusMode={focusMode}
      onToggleSidebar={onToggleSidebar}
      onNewNote={onNewNote}
      showWindowControls={showWindowControls}
      leading={calendarToggle}
      center={<span className="journal-titlebar-date">{dateTitle}</span>}
      trailing={
        showToday ? (
          <button
            type="button"
            className="journal-titlebar-today"
            onClick={() => selectDate(today)}
          >
            Today
          </button>
        ) : null
      }
    />
  );

  const calendar = !focusMode ? (
    <div className="journal-note-calendar">
      <JournalCalendar
        selected={selectedDate}
        journalDates={dueKeys}
        onSelectDate={selectDate}
        mode={calendarMode}
        onModeChange={setCalendarMode}
        ariaLabel="Project due dates"
      />
    </div>
  ) : null;

  const content = (
    <>
      {calendar}
      <div className="project-hub-body">
        {hideTitleBar && (
          <div className="project-hub-heading">
            <h1 className="journal-empty-title">{dateTitle}</h1>
            <div className="project-hub-heading-actions">
              {calendarToggle}
              {showToday && (
                <button
                  type="button"
                  className="journal-titlebar-today"
                  onClick={() => selectDate(today)}
                >
                  Today
                </button>
              )}
            </div>
          </div>
        )}
        <div className="project-hub-meta">
          <p>
            {openCount} open
            {dueCount > 0 ? ` · ${dueCount} due` : ""}
            {` · ${projectCount} ${projectCount === 1 ? "project" : "projects"}`}
          </p>
          <div className="project-hub-filters">
            <SegmentedControl
              ariaLabel="Activity"
              value={activity}
              options={ACTIVITY_OPTIONS}
              onChange={setActivity}
            />
            {(clients.length > 0 || unassigned.length > 0) && (
              <Select
                aria-label="All clients"
                value={clientFilter}
                onValueChange={setClientFilter}
                className="project-hub-select"
              >
                <option value={ALL_CLIENTS}>All clients</option>
                {clients.map((client) => (
                  <option key={client.name} value={client.name}>{client.name}</option>
                ))}
                {unassigned.length > 0 && (
                  <option value={NO_CLIENT}>No client</option>
                )}
              </Select>
            )}
          </div>
        </div>

        {workspace.projects.length === 0 && (
          <InboxGroup>
            <button
              type="button"
              className="kanban-list-add project-hub-add"
              onClick={() => window.dispatchEvent(new CustomEvent("create-new-project"))}
            >
              New Project
            </button>
          </InboxGroup>
        )}

        {viewingDay && (
          <InboxGroup title={dateTitle}>
            {dayTasks.map((item) => (
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

        {!viewingDay && dues.length > 0 && (
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

        {workspace.projects.length > 0 && (clients.length > 0 || showingProjects) && (
          <InboxGroup title={showingProjects ? (focus?.name ?? "Projects") : undefined}>
            {tableCount === 0 ? (
              <p className="project-hub-group-title">No matching records</p>
            ) : showingProjects ? (
              clientProjects.map((project) => (
                <ProjectHubRow
                  key={project.id}
                  name={project.name}
                  subtitle={projectListSubtitle(project)}
                  onOpen={() => onOpenProject?.(project.id)}
                />
              ))
            ) : (
              visibleClients.map((client) => (
                <ProjectHubRow
                  key={client.id}
                  name={client.name}
                  subtitle={
                    `${client.projectCount === 1 ? "1 project" : `${client.projectCount} projects`} · ${client.openCount} open`
                  }
                  onOpen={() => setClientFilter(client.id)}
                />
              ))
            )}
          </InboxGroup>
        )}

        {emptyInbox && !showingProjects && workspace.projects.length > 0 && clients.length === 0 && (
          <InboxGroup>
            {workspace.projects.map((project) => (
              <ProjectHubRow
                key={project.id}
                name={project.name}
                subtitle={projectListSubtitle(project)}
                onOpen={() => onOpenProject?.(project.id)}
              />
            ))}
            <button
              type="button"
              className="kanban-list-add project-hub-add"
              onClick={() => window.dispatchEvent(new CustomEvent("create-new-project"))}
            >
              New Project
            </button>
          </InboxGroup>
        )}
      </div>
    </>
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
    <div
      data-calendar-page=""
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg"
    >
      {!hideTitleBar && titlebar}
      <div className="project-hub">
        {content}
      </div>
    </div>
  );
}

function InboxGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="project-hub-group">
      {title && <h2 className="project-hub-group-title">{title}</h2>}
      {children}
    </section>
  );
}

function ProjectHubRow({
  name,
  subtitle,
  onOpen,
}: {
  name: string;
  subtitle: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="project-hub-link" onClick={onOpen}>
      <span className="kanban-task-title">{name || "Untitled"}</span>
      <span className="kanban-task-meta">{subtitle}</span>
    </button>
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
    <div className="project-hub-task">
      <div className="kanban-task">
        <span className="kanban-task-check">
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
            className={cn("kanban-done-toggle kanban-check size-[1.125rem]", done && "is-checked")}
          >
            <CheckmarkIcon checked={done} className="size-3.5" />
          </button>
        </span>
        <button type="button" onClick={onOpen} className="kanban-task-body">
          <span className={cn("kanban-task-title", done && "text-text-muted")}>
            {item.card.title || "Untitled"}
          </span>
          {meta && (
            <span className={cn("kanban-task-meta", due?.tone === "overdue" && "is-overdue")}>
              {meta}
            </span>
          )}
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
    </div>
  );
}

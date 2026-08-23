import type { KanbanBoard, KanbanCard, KanbanColumn, KanbanProject, KanbanWorkspace, ProjectIconId, ProjectViewId } from "../types/note";

export type ProjectTemplateId = "client" | "personal" | "blank";

export const PROJECT_ICON_IDS: ProjectIconId[] = [
  "briefcase",
  "board",
  "flag",
  "book",
  "calendar",
  "inbox",
  "check",
  "workflow",
];

export const PROJECT_VIEWS: { id: ProjectViewId; label: string }[] = [
  { id: "list", label: "List" },
  { id: "board", label: "Board" },
  { id: "gallery", label: "Gallery" },
];

export function isProjectIcon(value: unknown): value is ProjectIconId {
  return typeof value === "string" && PROJECT_ICON_IDS.includes(value as ProjectIconId);
}

export function isProjectView(value: unknown): value is ProjectViewId {
  return value === "list" || value === "board" || value === "gallery";
}

export function iconForTemplate(id: ProjectTemplateId): ProjectIconId {
  if (id === "personal") return "flag";
  if (id === "blank") return "board";
  return "briefcase";
}

export const PROJECT_TEMPLATES: {
  id: ProjectTemplateId;
  name: string;
  description: string;
}[] = [
  { id: "client", name: "Client work", description: "Inbox through Done" },
  { id: "personal", name: "Personal", description: "To Do, Doing, Done" },
  { id: "blank", name: "Blank", description: "Just a title, then write" },
];

export function captureColumn(board: KanbanBoard): KanbanColumn | undefined {
  return (
    board.columns.find((column) => /^(inbox|to do|todo)$/i.test(column.title.trim())) ??
    board.columns.find((column) => !/^done$/i.test(column.title.trim())) ??
    board.columns[0]
  );
}

export function doneColumn(board: KanbanBoard): KanbanColumn | undefined {
  return board.columns.find((column) => /^done$/i.test(column.title.trim()));
}

export function openTaskCount(project: { board: KanbanBoard }): number {
  const done = doneColumn(project.board);
  const doneIds = new Set(done?.cardIds ?? []);
  return project.board.cards.filter((card) => !card.completed && !doneIds.has(card.id)).length;
}

export function projectListSubtitle(project: { client?: string; board: KanbanBoard }): string {
  const open = openTaskCount(project);
  const client = project.client?.trim();
  if (open === 0 && project.board.cards.length === 0) {
    return client ? `${client} · Empty` : "Empty";
  }
  const count = `${open} open`;
  return client ? `${client} · ${count}` : count;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type TaskDueTone = "overdue" | "today" | "soon" | "normal";

export function formatDueDate(dueDate?: string): { label: string; tone: TaskDueTone } | null {
  if (!dueDate) return null;
  const date = new Date(`${dueDate}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.valueOf() - today.valueOf()) / DAY_MS);

  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: "overdue" };
  if (days === 0) return { label: "Due today", tone: "today" };
  if (days === 1) return { label: "Due tomorrow", tone: "soon" };
  return {
    label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    tone: "normal",
  };
}

export interface ProjectTaskItem {
  projectId: string;
  projectName: string;
  columnId: string;
  columnTitle: string;
  card: KanbanCard;
}

function isOpenCard(project: KanbanProject, card: KanbanCard) {
  if (card.completed) return false;
  const done = doneColumn(project.board);
  return !done?.cardIds.includes(card.id);
}

function openTasks(workspace: KanbanWorkspace): ProjectTaskItem[] {
  const items: ProjectTaskItem[] = [];
  for (const project of workspace.projects) {
    const cardsById = new Map(project.board.cards.map((card) => [card.id, card]));
    for (const column of project.board.columns) {
      for (const cardId of column.cardIds) {
        const card = cardsById.get(cardId);
        if (!card || !isOpenCard(project, card)) continue;
        items.push({
          projectId: project.id,
          projectName: project.name,
          columnId: column.id,
          columnTitle: column.title,
          card,
        });
      }
    }
  }
  return items;
}

export function dueTasks(workspace: KanbanWorkspace, limit = 12): ProjectTaskItem[] {
  return openTasks(workspace)
    .filter((item) => Boolean(item.card.dueDate))
    .sort((left, right) => (left.card.dueDate ?? "").localeCompare(right.card.dueDate ?? "") || left.card.updatedAt - right.card.updatedAt)
    .slice(0, limit);
}

export function recentTasks(workspace: KanbanWorkspace, limit = 8): ProjectTaskItem[] {
  const dueIds = new Set(dueTasks(workspace, 50).map((item) => item.card.id));
  return openTasks(workspace)
    .filter((item) => !dueIds.has(item.card.id))
    .sort((left, right) => right.card.updatedAt - left.card.updatedAt)
    .slice(0, limit);
}

export function overviewSubtitle(workspace: KanbanWorkspace): string {
  if (workspace.projects.length === 0) return "Empty";
  const open = workspace.projects.reduce((total, project) => total + openTaskCount(project), 0);
  const due = dueTasks(workspace, 100).length;
  if (open === 0) return "Caught up";
  if (due > 0) return `${due} due · ${open} open`;
  return `${open} open`;
}

export function createEmptyBoard(): KanbanBoard {
  return {
    version: 1,
    columns: [],
    cards: [],
  };
}

function columns(defs: { id: string; title: string }[]): KanbanColumn[] {
  return defs.map((column) => ({ ...column, cardIds: [] }));
}

export function createBoardFromTemplate(id: ProjectTemplateId): KanbanBoard {
  if (id === "blank") return createEmptyBoard();
  if (id === "personal") {
    return {
      version: 1,
      cards: [],
      columns: columns([
        { id: "ready", title: "To Do" },
        { id: "doing", title: "Doing" },
        { id: "done", title: "Done" },
      ]),
    };
  }
  return {
    version: 1,
    cards: [],
    columns: columns([
      { id: "inbox", title: "Inbox" },
      { id: "ready", title: "This week" },
      { id: "doing", title: "In progress" },
      { id: "waiting", title: "Waiting on client" },
      { id: "done", title: "Done" },
    ]),
  };
}

export function normalizeBoard(value: KanbanBoard | undefined): KanbanBoard {
  const fallback = createEmptyBoard();
  if (!value || value.version !== 1 || !Array.isArray(value.cards) || !Array.isArray(value.columns)) {
    return fallback;
  }

  const cards = value.cards.filter((card): card is KanbanCard =>
    typeof card?.id === "string" &&
    typeof card.title === "string" &&
    (card.priority === "high" || card.priority === "medium" || card.priority === "low"),
  ).map((card) => ({
    ...card,
    completed: card.completed === true,
    todos: Array.isArray(card.todos)
      ? card.todos.filter((todo) => typeof todo?.id === "string" && typeof todo.title === "string" && typeof todo.completed === "boolean")
      : [],
  }));
  const validIds = new Set(cards.map((card) => card.id));
  const placed = new Set<string>();
  const nextColumns = value.columns
    .filter((column): column is KanbanColumn => typeof column?.id === "string" && typeof column.title === "string" && Array.isArray(column.cardIds))
    .map((column) => ({
      id: column.id,
      title: column.title.trim() || "Untitled stage",
      cardIds: column.cardIds.filter((id): id is string => typeof id === "string" && validIds.has(id) && !placed.has(id) && (placed.add(id), true)),
    }));

  if (nextColumns.length === 0) return { version: 1, columns: [], cards };
  for (const card of cards) {
    if (!placed.has(card.id)) nextColumns[0].cardIds.push(card.id);
  }
  return { version: 1, columns: nextColumns, cards };
}

import type { ColumnColorId, KanbanBoard, KanbanCard, KanbanColumn, KanbanProject, KanbanWorkspace, ProjectIconId, ProjectViewId } from "../types/note";

export type { ColumnColorId };

export type ProjectTemplateId = "week" | "blank";

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
  return id === "blank" ? "board" : "calendar";
}

export const PROJECT_TEMPLATES: {
  id: ProjectTemplateId;
  name: string;
  description: string;
}[] = [
  { id: "week", name: "This week", description: "Today, This week, Later, Done" },
  { id: "blank", name: "Blank", description: "Start empty, then add your own columns" },
];

export type ColumnStatusKind = "inbox" | "todo" | "progress" | "waiting" | "done" | "other";
export type ResolvedColumnColor = Exclude<ColumnColorId, "default">;

export const COLUMN_COLORS: { id: ColumnColorId; name: string; swatch: string }[] = [
  { id: "default", name: "Default", swatch: "" },
  { id: "gray", name: "Gray", swatch: "#8e8e93" },
  { id: "brown", name: "Brown", swatch: "#ac8e68" },
  { id: "orange", name: "Orange", swatch: "#ff9f0a" },
  { id: "yellow", name: "Yellow", swatch: "#ffd60a" },
  { id: "green", name: "Green", swatch: "#30d158" },
  { id: "blue", name: "Blue", swatch: "#0a84ff" },
  { id: "purple", name: "Purple", swatch: "#bf5af2" },
  { id: "pink", name: "Pink", swatch: "#ff375f" },
  { id: "red", name: "Red", swatch: "#ff453a" },
];

export function isColumnColor(value: unknown): value is ColumnColorId {
  return typeof value === "string" && COLUMN_COLORS.some((color) => color.id === value);
}

export function columnStatusKind(title: string): ColumnStatusKind {
  const name = title.trim().toLowerCase();
  if (/^(done|complete|completed|finished)$/.test(name)) return "done";
  if (/(^|\b)(in progress|doing|wip)(\b|$)/.test(name)) return "progress";
  if (/(^|\b)(waiting|blocked|on hold)(\b|$)/.test(name) || name === "hold") return "waiting";
  if (/^(inbox|today)$/.test(name)) return "inbox";
  if (/^(to[- ]?do|ready|this week|next week|this month|later|tomorrow|up next|backlog)$/.test(name)) return "todo";
  return "other";
}

export function resolvedColumnColor(title: string, color?: ColumnColorId): ResolvedColumnColor {
  if (color && color !== "default") return color;
  switch (columnStatusKind(title)) {
    case "progress":
      return "blue";
    case "waiting":
      return "orange";
    case "done":
      return "green";
    default:
      return "gray";
  }
}

export function captureColumn(board: KanbanBoard): KanbanColumn | undefined {
  return (
    board.columns.find((column) => {
      const kind = columnStatusKind(column.title);
      return kind === "inbox" || kind === "todo";
    }) ??
    board.columns.find((column) => columnStatusKind(column.title) !== "done") ??
    board.columns[0]
  );
}

export function doneColumn(board: KanbanBoard): KanbanColumn | undefined {
  return board.columns.find((column) => columnStatusKind(column.title) === "done");
}

export function removeCardId(columns: KanbanColumn[], cardId: string): KanbanColumn[] {
  return columns.map((column) => ({
    ...column,
    cardIds: column.cardIds.filter((id) => id !== cardId),
  }));
}

export function placeCard(
  columns: KanbanColumn[],
  cardId: string,
  columnId: string,
  insertAt?: number,
): KanbanColumn[] {
  return removeCardId(columns, cardId).map((column) => {
    if (column.id !== columnId) return column;
    const cardIds = [...column.cardIds];
    const index = insertAt == null || insertAt < 0 ? cardIds.length : Math.min(insertAt, cardIds.length);
    cardIds.splice(index, 0, cardId);
    return { ...column, cardIds };
  });
}

function withCardFlag(board: KanbanBoard, cardId: string, completed: boolean, now: number): KanbanBoard {
  return {
    ...board,
    cards: board.cards.map((card) => (
      card.id === cardId ? { ...card, completed, updatedAt: now } : card
    )),
  };
}

export function withCardCompleted(
  board: KanbanBoard,
  cardId: string,
  completed: boolean,
  now = Date.now(),
): KanbanBoard {
  if (!board.cards.some((card) => card.id === cardId)) return board;
  return withCardFlag(board, cardId, completed, now);
}

export function withCardInColumn(
  board: KanbanBoard,
  cardId: string,
  columnId: string,
  insertAt?: number,
): KanbanBoard {
  if (!board.cards.some((card) => card.id === cardId)) return board;
  if (!board.columns.some((column) => column.id === columnId)) return board;
  return {
    ...board,
    columns: placeCard(board.columns, cardId, columnId, insertAt),
  };
}

export function openTaskCount(project: { board: KanbanBoard }): number {
  const done = doneColumn(project.board);
  const doneIds = new Set(done?.cardIds ?? []);
  return project.board.cards.filter((card) => !card.completed && !doneIds.has(card.id)).length;
}

export function projectListSubtitle(project: { board: KanbanBoard }): string {
  const open = openTaskCount(project);
  if (open === 0 && project.board.cards.length === 0) return "Empty";
  return `${open} open`;
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
  columnColor?: ColumnColorId;
  card: KanbanCard;
}

function isOpenCard(project: KanbanProject, card: KanbanCard) {
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
          columnColor: column.color,
          card,
        });
      }
    }
  }
  return items;
}

function isIncomplete(item: ProjectTaskItem) {
  return item.card.completed !== true;
}

function takeOpenThenRecentDone(items: ProjectTaskItem[], limit: number) {
  const open = items.filter(isIncomplete);
  if (open.length >= limit) return open.slice(0, limit);
  const done = items
    .filter((item) => !isIncomplete(item))
    .sort((left, right) => right.card.updatedAt - left.card.updatedAt);
  return [...open, ...done.slice(0, limit - open.length)];
}

export function dueTasks(workspace: KanbanWorkspace, limit = 12): ProjectTaskItem[] {
  const items = openTasks(workspace)
    .filter((item) => Boolean(item.card.dueDate))
    .sort((left, right) => (left.card.dueDate ?? "").localeCompare(right.card.dueDate ?? "") || left.card.updatedAt - right.card.updatedAt);
  return takeOpenThenRecentDone(items, limit);
}

export function recentTasks(workspace: KanbanWorkspace, limit = 8): ProjectTaskItem[] {
  const dueIds = new Set(dueTasks(workspace, 50).map((item) => item.card.id));
  const items = openTasks(workspace)
    .filter((item) => !dueIds.has(item.card.id))
    .sort((left, right) => right.card.updatedAt - left.card.updatedAt);
  return takeOpenThenRecentDone(items, limit);
}

export function overviewOpenCount(workspace: KanbanWorkspace): number {
  return workspace.projects.reduce((total, project) => total + openTaskCount(project), 0);
}

export function overviewDueCount(workspace: KanbanWorkspace): number {
  return openTasks(workspace).filter((item) => Boolean(item.card.dueDate) && item.card.completed !== true).length;
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

export function createBoardFromTemplate(id: string): KanbanBoard {
  if (id === "blank") return createEmptyBoard();
  return {
    version: 1,
    cards: [],
    columns: columns([
      { id: "today", title: "Today" },
      { id: "week", title: "This week" },
      { id: "later", title: "Later" },
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
      color: isColumnColor(column.color) && column.color !== "default" ? column.color : undefined,
    }));

  if (nextColumns.length === 0) return { version: 1, columns: [], cards };
  for (const card of cards) {
    if (!placed.has(card.id)) nextColumns[0].cardIds.push(card.id);
  }
  return { version: 1, columns: nextColumns, cards };
}

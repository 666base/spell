import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { KanbanBoard, KanbanCard, KanbanColumn, KanbanPriority, KanbanTodo } from "../../types/note";
import { createEmptyBoard, useKanbanWorkspace } from "../../context/KanbanWorkspaceContext";
import { cn } from "../../lib/utils";
import {
  Button,
  IconButton,
  Input,
  Select,
} from "../ui";
import {
  CalendarIcon,
  ClientIcon,
  DoneIcon,
  GripIcon,
  InboxIcon,
  InProgressIcon,
  KanbanIcon,
  PlusIcon,
  TableIcon,
  TodoIcon,
  WaitingIcon,
  XIcon,
} from "../icons/velocity";
import { CheckmarkIcon } from "../ui/StateIcon";

interface KanbanPageProps {
  rightSidebarVisible?: boolean;
}

interface EditingCard {
  card: KanbanCard;
  columnId: string;
  isNew: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const KANBAN_MOTION_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";
const KANBAN_SORT_TRANSITION = { duration: 180, easing: KANBAN_MOTION_EASING };
const KANBAN_DROP_ANIMATION = { duration: 180, easing: KANBAN_MOTION_EASING };

const COLUMN_ICONS = {
  inbox: InboxIcon,
  ready: TodoIcon,
  doing: InProgressIcon,
  waiting: WaitingIcon,
  done: DoneIcon,
} as const;

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function newCard(): KanbanCard {
  const now = Date.now();
  return {
    id: makeId(),
    title: "",
    client: "",
    dueDate: "",
    priority: "medium",
    description: "",
    todos: [],
    createdAt: now,
    updatedAt: now,
  };
}

function dateAfter(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function createClientDeliveryExample(): KanbanBoard {
  const cards: KanbanCard[] = [
    {
      ...newCard(),
      title: "Collect brand references from the client",
      client: "Northstar Coffee",
      dueDate: dateAfter(1),
      priority: "medium",
      description: "Ask for the current logo files, menu, photography, and the launch date.",
    },
    {
      ...newCard(),
      title: "Confirm the website launch scope",
      client: "Northstar Coffee",
      dueDate: dateAfter(2),
      priority: "high",
      description: "Turn the kickoff call into a clear list of pages, approvals, and success criteria.",
    },
    {
      ...newCard(),
      title: "Prepare the first homepage direction",
      client: "Northstar Coffee",
      dueDate: dateAfter(4),
      priority: "high",
      description: "Keep this as the one active deliverable until the client can react to it.",
    },
    {
      ...newCard(),
      title: "Approve the final product photography",
      client: "Northstar Coffee",
      dueDate: dateAfter(-1),
      priority: "medium",
      description: "Waiting for the client’s selection before placing imagery in the final layout.",
    },
    {
      ...newCard(),
      title: "Send signed proposal and deposit receipt",
      client: "Northstar Coffee",
      dueDate: dateAfter(-3),
      priority: "low",
      description: "A finished operational task stays visible here briefly for context.",
    },
  ];

  const board = createEmptyBoard();
  board.cards = cards;
  board.columns = board.columns.map((column) => ({
    ...column,
    cardIds:
      column.id === "inbox" ? [cards[0].id]
      : column.id === "ready" ? [cards[1].id]
      : column.id === "doing" ? [cards[2].id]
      : column.id === "waiting" ? [cards[3].id]
      : [cards[4].id],
  }));
  return board;
}

function formatDueDate(dueDate?: string) {
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

function removeCardId(columns: KanbanColumn[], cardId: string) {
  return columns.map((column) => ({
    ...column,
    cardIds: column.cardIds.filter((id) => id !== cardId),
  }));
}

export function KanbanPage({
  rightSidebarVisible = true,
}: KanbanPageProps) {
  const { activeProject, isLoading, updateProject } = useKanbanWorkspace();
  const [editing, setEditing] = useState<EditingCard | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [recentlyCreatedCardId, setRecentlyCreatedCardId] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "table">("board");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  const board = activeProject?.board ?? createEmptyBoard();

  const persist = useCallback((nextBoard: KanbanBoard) => {
    if (!activeProject) return;
    updateProject({ ...activeProject, board: nextBoard });
  }, [activeProject, updateProject]);

  const cardsById = useMemo(
    () => new Map(board.cards.map((card) => [card.id, card])),
    [board.cards],
  );
  const activeCard = activeCardId ? cardsById.get(activeCardId) ?? null : null;
  const activeCount = board.columns
    .filter((column) => column.id !== "done")
    .reduce((count, column) => count + column.cardIds.length, 0);
  const waitingCount = board.columns.find((column) => column.id === "waiting")?.cardIds.length ?? 0;
  const isEmpty = board.cards.length === 0;

  useEffect(() => {
    if (!recentlyCreatedCardId) return;
    const timeoutId = window.setTimeout(() => setRecentlyCreatedCardId(null), 220);
    return () => window.clearTimeout(timeoutId);
  }, [recentlyCreatedCardId]);

  const openNewCard = useCallback((columnId?: string) => {
    setEditing({ card: newCard(), columnId: columnId ?? board.columns[0]?.id ?? "inbox", isNew: true });
  }, [board.columns]);

  const saveCard = useCallback((card: KanbanCard, columnId: string, isNew: boolean) => {
    const savedCard = { ...card, title: card.title.trim(), updatedAt: Date.now() };
    if (!savedCard.title) return;

    const columnsWithoutCard = removeCardId(board.columns, savedCard.id);
    const nextColumns = columnsWithoutCard.map((column) =>
      column.id === columnId
        ? { ...column, cardIds: [...column.cardIds, savedCard.id] }
        : column,
    );
    persist({
      ...board,
      columns: nextColumns,
      cards: isNew
        ? [...board.cards, savedCard]
        : board.cards.map((existing) => existing.id === savedCard.id ? savedCard : existing),
    });
    if (isNew) setRecentlyCreatedCardId(savedCard.id);
    setEditing(null);
  }, [board, persist]);

  const deleteCard = useCallback((cardId: string) => {
    persist({
      ...board,
      columns: removeCardId(board.columns, cardId),
      cards: board.cards.filter((card) => card.id !== cardId),
    });
    setEditing(null);
  }, [board, persist]);

  const updateCardTodos = useCallback((cardId: string, update: (todos: KanbanTodo[]) => KanbanTodo[]) => {
    const card = board.cards.find((item) => item.id === cardId);
    if (!card) return;
    const nextCard = { ...card, todos: update(card.todos ?? []), updatedAt: Date.now() };
    persist({
      ...board,
      cards: board.cards.map((item) => item.id === cardId ? nextCard : item),
    });
    setEditing((current) => current?.card.id === cardId ? { ...current, card: nextCard } : current);
  }, [board, persist]);

  const addTodoToCard = useCallback((cardId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    updateCardTodos(cardId, (todos) => [...todos, { id: makeId(), title: trimmed, completed: false }]);
  }, [updateCardTodos]);

  const toggleCardTodo = useCallback((cardId: string, todoId: string) => {
    updateCardTodos(cardId, (todos) => todos.map((todo) => todo.id === todoId ? { ...todo, completed: !todo.completed } : todo));
  }, [updateCardTodos]);

  const moveCardToColumn = useCallback((cardId: string, columnId: string) => {
    if (!board.columns.some((column) => column.id === columnId)) return;
    const columnsWithoutCard = removeCardId(board.columns, cardId);
    persist({
      ...board,
      columns: columnsWithoutCard.map((column) => (
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, cardId] }
          : column
      )),
    });
  }, [board, persist]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveCardId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveCardId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const cardId = String(active.id);
    const sourceColumn = board.columns.find((column) => column.cardIds.includes(cardId));
    if (!sourceColumn) return;
    const overData = over.data.current;
    const destinationId = overData?.type === "kanban-card"
      ? String(overData.columnId)
      : String(over.id).replace(/^kanban-column:/, "");
    const destinationColumn = board.columns.find((column) => column.id === destinationId);
    if (!destinationColumn) return;

    const destinationCardId = overData?.type === "kanban-card" ? String(over.id) : null;
    const baseColumns = removeCardId(board.columns, cardId);
    const nextColumns = baseColumns.map((column) => {
      if (column.id !== destinationColumn.id) return column;
      const insertAt = destinationCardId
        ? Math.max(0, column.cardIds.indexOf(destinationCardId))
        : column.cardIds.length;
      const cardIds = [...column.cardIds];
      cardIds.splice(insertAt, 0, cardId);
      return { ...column, cardIds };
    });
    persist({ ...board, columns: nextColumns });
  }, [board, persist]);

  if (isLoading) {
    return <KanbanLoading />;
  }

  return (
    <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-bg">
      <header className="shrink-0 border-b border-border bg-bg px-3 sm:px-5">
        <div className="flex min-h-16 items-center gap-3 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-muted text-text-muted">
          <KanbanIcon className="h-4 w-4 stroke-[1.65]" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold tracking-[-0.015em] text-text">{activeProject?.name ?? "Projects"}</h1>
          <p className="truncate text-xs text-text-muted">
            {isEmpty ? "No tasks yet" : activeCount === 0 ? "Nothing open" : `${activeCount} open${waitingCount ? ` · ${waitingCount} waiting` : ""}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center rounded-lg border border-border bg-bg-secondary p-0.5" role="group" aria-label="Project view">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setView("board")}
            aria-pressed={view === "board"}
            className={cn("gap-1.5 px-2", view === "board" ? "bg-bg text-text shadow-none hover:bg-bg" : "text-text-muted")}
          >
            <KanbanIcon className="h-3.5 w-3.5 stroke-[1.7]" />
            Board
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
            className={cn("gap-1.5 px-2", view === "table" ? "bg-bg text-text shadow-none hover:bg-bg" : "text-text-muted")}
          >
            <TableIcon className="h-3.5 w-3.5 stroke-[1.7]" />
            Table
          </Button>
        </div>
        <Button variant="primary" size="sm" onClick={() => openNewCard()} className="shrink-0 gap-1.5 shadow-none hover:shadow-none">
          <PlusIcon className="h-3.5 w-3.5 stroke-[1.8]" />
          <span className="hidden sm:inline">New task</span>
          <span className="sm:hidden">New</span>
        </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className={cn("flex min-w-0 flex-1", editing && "sm:mr-[388px]")}>
          {isEmpty ? (
            <EmptyBoard onCreateTask={() => openNewCard()} onUseExample={() => persist(createClientDeliveryExample())} />
          ) : view === "table" ? (
            <ProjectTable
              board={board}
              cardsById={cardsById}
              onOpenCard={(card, columnId) => setEditing({ card, columnId, isNew: false })}
              onMoveCard={moveCardToColumn}
            />
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveCardId(null)}
            >
              <div className={cn("kanban-scroll flex-1 overflow-x-auto overflow-y-hidden bg-bg-secondary", !rightSidebarVisible && "pr-0")}>
                <div className="flex h-full min-w-max divide-x divide-border/90 px-3 sm:px-5">
                  {board.columns.map((column) => (
                    <KanbanColumnView
                      key={column.id}
                      column={column}
                      cards={column.cardIds.map((id) => cardsById.get(id)).filter((card): card is KanbanCard => Boolean(card))}
                      onAddCard={() => openNewCard(column.id)}
                      onOpenCard={(card) => setEditing({ card, columnId: column.id, isNew: false })}
                      onAddTodo={addTodoToCard}
                      onToggleTodo={toggleCardTodo}
                      recentlyCreatedCardId={recentlyCreatedCardId}
                    />
                  ))}
                </div>
              </div>
              <DragOverlay dropAnimation={KANBAN_DROP_ANIMATION}>
                {activeCard ? <KanbanCardTile card={activeCard} overlay /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
        {editing && (
          <TaskDetailPanel
            key={`${editing.columnId}:${editing.card.id}:${editing.isNew ? "new" : "existing"}`}
            editing={editing}
            columns={board.columns}
            onClose={() => setEditing(null)}
            onSave={saveCard}
            onDelete={deleteCard}
          />
        )}
      </div>
    </section>
  );
}

function KanbanLoading() {
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-bg">
      <div className="flex min-h-16 items-center gap-3 border-b border-border px-3 py-2 sm:px-5">
        <div className="h-8 w-8 rounded-lg bg-bg-muted" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-24 rounded bg-bg-muted" />
          <div className="h-2.5 w-16 rounded bg-bg-muted/70" />
        </div>
      </div>
      <div className="flex flex-1 gap-4 overflow-hidden bg-bg-secondary/35 p-3 sm:p-5">
        {[0, 1, 2].map((item) => (
          <div key={item} className="w-[280px] shrink-0 border-r border-border pr-3">
            <div className="h-4 w-24 rounded bg-bg-muted" />
            <div className="mt-4 h-18 rounded-lg border border-border bg-bg-muted/50" />
            <div className="mt-2 h-18 rounded-lg border border-border bg-bg-muted/35" />
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyBoard({ onCreateTask, onUseExample }: { onCreateTask: () => void; onUseExample: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto bg-bg-secondary/35 px-5 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-bg p-5 sm:p-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-muted text-text-muted">
          <KanbanIcon className="h-4.5 w-4.5 stroke-[1.65]" />
        </span>
        <h2 className="mt-4 text-base font-semibold tracking-[-0.015em] text-text">Start with the next task.</h2>
        <p className="mt-1.5 max-w-sm text-sm leading-5 text-text-muted">
          Add one task, then move it forward when it is ready.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button variant="primary" size="md" onClick={onCreateTask} className="gap-2 shadow-none hover:shadow-none">
            <PlusIcon className="h-4 w-4 stroke-[1.8]" />
            Add task
          </Button>
          <Button variant="ghost" size="md" onClick={onUseExample}>
            Use example
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProjectTable({
  board,
  cardsById,
  onOpenCard,
  onMoveCard,
}: {
  board: KanbanBoard;
  cardsById: Map<string, KanbanCard>;
  onOpenCard: (card: KanbanCard, columnId: string) => void;
  onMoveCard: (cardId: string, columnId: string) => void;
}) {
  const rows = board.columns.flatMap((column) => column.cardIds
    .map((cardId) => {
      const card = cardsById.get(cardId);
      return card ? { card, column } : null;
    })
    .filter((row): row is { card: KanbanCard; column: KanbanColumn } => Boolean(row)));

  return (
    <div className="flex-1 overflow-auto bg-bg-secondary/35 px-3 py-3 sm:px-5 sm:py-4">
      <div className="min-w-[720px] overflow-hidden rounded-xl border border-border bg-bg">
        <table className="w-full border-collapse text-left">
          <thead className="bg-bg-secondary text-2xs font-medium uppercase tracking-[0.08em] text-text-muted">
            <tr>
              <th className="w-[38%] px-3 py-2.5 font-medium">Task</th>
              <th className="w-[20%] px-3 py-2.5 font-medium">Stage</th>
              <th className="w-[18%] px-3 py-2.5 font-medium">Client</th>
              <th className="w-[14%] px-3 py-2.5 font-medium">Due</th>
              <th className="w-[10%] px-3 py-2.5 text-right font-medium">To-dos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ card, column }) => {
              const due = formatDueDate(card.dueDate);
              const todoTotal = card.todos?.length ?? 0;
              const todoComplete = card.todos?.filter((todo) => todo.completed).length ?? 0;

              return (
                <tr key={card.id} className="group transition-colors duration-150 hover:bg-bg-secondary/70">
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenCard(card, column.id)}
                      className="block max-w-full rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      <span className="block truncate text-sm font-medium text-text">{card.title}</span>
                      {card.priority === "high" && <span className="mt-0.5 block text-2xs font-medium text-rose-600 dark:text-rose-300">High priority</span>}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={column.id}
                      onValueChange={(columnId) => onMoveCard(card.id, columnId)}
                      className="h-7 min-w-[128px] px-2 text-xs"
                      contentClassName="min-w-[160px]"
                    >
                      {board.columns.map((stage) => <option key={stage.id} value={stage.id}>{stage.title}</option>)}
                    </Select>
                  </td>
                  <td className="max-w-[170px] truncate px-3 py-2.5 text-sm text-text-muted">{card.client || "—"}</td>
                  <td className={cn(
                    "px-3 py-2.5 text-xs",
                    due?.tone === "overdue" ? "font-medium text-rose-600 dark:text-rose-300"
                    : due?.tone === "today" ? "font-medium text-amber-700 dark:text-amber-300"
                    : "text-text-muted",
                  )}>{due?.label ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-text-muted">
                    {todoTotal ? `${todoComplete}/${todoTotal}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-1 pt-2 text-2xs text-text-muted">Use board view to reorder tasks. Use this view to scan and update stages.</p>
    </div>
  );
}

function KanbanColumnView({
  column,
  cards,
  onAddCard,
  onOpenCard,
  onAddTodo,
  onToggleTodo,
  recentlyCreatedCardId,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  onAddCard: () => void;
  onOpenCard: (card: KanbanCard) => void;
  onAddTodo: (cardId: string, title: string) => void;
  onToggleTodo: (cardId: string, todoId: string) => void;
  recentlyCreatedCardId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `kanban-column:${column.id}`,
    data: { type: "kanban-column", columnId: column.id },
  });
  const StatusIcon = COLUMN_ICONS[column.id as keyof typeof COLUMN_ICONS] ?? InboxIcon;

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "kanban-column flex h-full w-[276px] shrink-0 flex-col p-3 sm:w-[292px] sm:p-4",
        isOver && "kanban-column-over",
      )}
      data-over={isOver ? "true" : undefined}
      aria-label={`${column.title} column`}
    >
      <div className="mb-3 flex items-center gap-2 border-b border-border/80 px-0.5 pb-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-bg-muted text-text-muted">
          <StatusIcon className="h-3.5 w-3.5 stroke-[1.65]" />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.01em] text-text">{column.title}</h2>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-bg-muted px-1 text-2xs tabular-nums text-text-muted">
          {cards.length}
        </span>
        <IconButton variant="ghost" size="sm" onClick={onAddCard} title={`Add task to ${column.title}`} className="-mr-1 shrink-0">
          <PlusIcon className="h-3.5 w-3.5 stroke-[1.8]" />
        </IconButton>
      </div>
      <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
        <div className="kanban-column-cards min-h-7 flex-1 space-y-2 overflow-y-auto px-0.5 pb-1">
          {cards.map((card) => (
            <SortableKanbanCard
              key={card.id}
              card={card}
              columnId={column.id}
              onOpen={() => onOpenCard(card)}
              onAddTodo={onAddTodo}
              onToggleTodo={onToggleTodo}
              recentlyCreated={card.id === recentlyCreatedCardId}
            />
          ))}
          {cards.length === 0 && (
            <div className="flex min-h-20 items-center px-1 text-xs text-text-muted">
              {isOver ? "Release to move here" : "No tasks"}
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableKanbanCard({
  card,
  columnId,
  onOpen,
  onAddTodo,
  onToggleTodo,
  recentlyCreated,
}: {
  card: KanbanCard;
  columnId: string;
  onOpen: () => void;
  onAddTodo: (cardId: string, title: string) => void;
  onToggleTodo: (cardId: string, todoId: string) => void;
  recentlyCreated: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "kanban-card", columnId },
    transition: KANBAN_SORT_TRANSITION,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={cn("kanban-card-slot", isDragging && "opacity-30")} {...attributes}>
      <KanbanCardTile
        card={card}
        dragListeners={listeners}
        onOpen={onOpen}
        onAddTodo={onAddTodo}
        onToggleTodo={onToggleTodo}
        recentlyCreated={recentlyCreated}
      />
    </div>
  );
}

function KanbanCardTile({
  card,
  overlay = false,
  onOpen,
  dragListeners,
  onAddTodo,
  onToggleTodo,
  recentlyCreated = false,
}: {
  card: KanbanCard;
  overlay?: boolean;
  onOpen?: () => void;
  dragListeners?: Record<string, unknown>;
  onAddTodo?: (cardId: string, title: string) => void;
  onToggleTodo?: (cardId: string, todoId: string) => void;
  recentlyCreated?: boolean;
}) {
  const due = formatDueDate(card.dueDate);
  const todoTotal = card.todos?.length ?? 0;
  const todoComplete = card.todos?.filter((todo) => todo.completed).length ?? 0;
  return (
    <article
      className={cn(
        "kanban-card-tile group relative rounded-lg border border-border bg-bg px-3 py-3 text-left transition-[border-color,background-color,box-shadow] duration-150",
        overlay ? "w-[276px] border-text-muted/45 bg-bg shadow-lg" : "hover:border-text-muted/40 hover:bg-bg",
        recentlyCreated && "kanban-card-enter",
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          aria-label={`Drag ${card.title}`}
          className="kanban-drag-handle -ml-1.5 mt-0.5 flex h-6 w-5 shrink-0 touch-none cursor-grab items-center justify-center rounded text-text-muted/45 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing sm:opacity-0 sm:group-hover:opacity-100"
          {...dragListeners}
        >
          <GripIcon className="h-3.5 w-3.5 stroke-[1.65]" />
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
          <h3 className="text-sm font-medium leading-[1.35] tracking-[-0.005em] text-text">{card.title}</h3>
        </button>
      </div>
      {(card.client || due || card.priority === "high" || todoTotal > 0) && (
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] leading-4 text-text-muted">
        {card.priority === "high" && <span className="font-medium text-rose-600 dark:text-rose-300">High priority</span>}
        {card.client && (
          <span className="inline-flex max-w-full items-center gap-1">
            <ClientIcon className="h-3 w-3 shrink-0 stroke-[1.65]" />
            <span className="truncate">{card.client}</span>
          </span>
        )}
        {due && (
          <span className={cn(
            "inline-flex items-center gap-1",
            due.tone === "overdue" ? "font-medium text-rose-600 dark:text-rose-300"
            : due.tone === "today" ? "font-medium text-amber-700 dark:text-amber-300"
            : "text-text-muted",
          )}>
            <CalendarIcon className="h-3 w-3 stroke-[1.65]" />
            {due.label}
          </span>
        )}
        {todoTotal > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <CheckmarkIcon checked={todoComplete === todoTotal} className="h-3 w-3" />
            {todoComplete}/{todoTotal}
          </span>
        )}
      </div>
      )}
      {!overlay && onAddTodo && onToggleTodo && (
        <InlineTodoList
          key={card.id}
          card={card}
          onAddTodo={onAddTodo}
          onToggleTodo={onToggleTodo}
        />
      )}
    </article>
  );
}

function InlineTodoList({
  card,
  onAddTodo,
  onToggleTodo,
}: {
  card: KanbanCard;
  onAddTodo: (cardId: string, title: string) => void;
  onToggleTodo: (cardId: string, todoId: string) => void;
}) {
  const [newTodo, setNewTodo] = useState("");
  const todos = card.todos ?? [];

  return (
    <section className="mt-3 border-t border-border/80 pt-2.5" aria-label="To-dos">
      {todos.length > 0 && (
        <div className="space-y-1">
          {todos.map((todo) => (
            <div key={todo.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onToggleTodo(card.id, todo.id)}
                aria-pressed={todo.completed}
                aria-label={`${todo.completed ? "Mark incomplete" : "Mark complete"}: ${todo.title}`}
                data-state={todo.completed ? "checked" : "unchecked"}
                className={cn(
                  "kanban-todo-toggle flex h-4 w-4 shrink-0 items-center justify-center rounded border outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  todo.completed ? "border-accent bg-accent text-text-inverse" : "border-border text-transparent hover:border-text-muted/60",
                )}
              >
                <CheckmarkIcon checked={todo.completed} className="h-2.5 w-2.5" />
              </button>
              <span className={cn("min-w-0 flex-1 truncate text-xs leading-4", todo.completed ? "text-text-muted line-through" : "text-text-muted")}>{todo.title}</span>
            </div>
          ))}
        </div>
      )}
      <form
        className={cn("flex items-center gap-1.5", todos.length > 0 && "mt-2")}
        onPointerDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!newTodo.trim()) return;
          onAddTodo(card.id, newTodo);
          setNewTodo("");
        }}
      >
        <PlusIcon className="h-3.5 w-3.5 shrink-0 stroke-[1.8] text-text-muted" />
        <input
          value={newTodo}
          onChange={(event) => setNewTodo(event.target.value)}
          placeholder="Add to-do"
          aria-label="Add to-do"
          className="min-w-0 flex-1 bg-transparent text-xs leading-5 text-text outline-none placeholder:text-text-muted/75"
        />
      </form>
    </section>
  );
}

function TaskDetailPanel({
  editing,
  columns,
  onClose,
  onSave,
  onDelete,
}: {
  editing: EditingCard;
  columns: KanbanColumn[];
  onClose: () => void;
  onSave: (card: KanbanCard, columnId: string, isNew: boolean) => void;
  onDelete: (cardId: string) => void;
}) {
  const [draft, setDraft] = useState(editing.card);
  const [columnId, setColumnId] = useState(editing.columnId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <aside className="kanban-task-panel absolute inset-y-0 right-0 z-30 flex w-full flex-col border-l border-border bg-bg-secondary shadow-[var(--shadow-surface)] sm:w-[388px]" aria-label={editing.isNew ? "New task" : "Task details"}>
      <header className="flex items-center gap-2 border-b border-border/80 px-4 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-muted text-text-muted">
          <KanbanIcon className="h-3.5 w-3.5 stroke-[1.7]" />
        </span>
        <span className="min-w-0 flex-1 text-xs font-medium text-text-muted">{editing.isNew ? "New task" : "Task"}</span>
        <IconButton onClick={onClose} title="Close task panel" size="sm"><XIcon className="h-4 w-4 stroke-[1.7]" /></IconButton>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        <textarea
          autoFocus
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          placeholder="What needs to happen next?"
          rows={2}
          className="min-h-15 w-full resize-none bg-transparent text-[17px] font-semibold leading-6 tracking-[-0.018em] text-text outline-none placeholder:text-text-muted"
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="Stage"><Select value={columnId} onValueChange={setColumnId}>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</Select></Field>
          <Field label="Priority"><Select value={draft.priority} onValueChange={(value) => setDraft((current) => ({ ...current, priority: value as KanbanPriority }))}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select></Field>
          <Field label="Client" optional><Input value={draft.client ?? ""} onChange={(event) => setDraft((current) => ({ ...current, client: event.target.value }))} placeholder="Client or project" /></Field>
          <Field label="Due" optional><Input type="date" value={draft.dueDate ?? ""} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
        </div>

        <div className="mt-6 border-t border-border/80 pt-5">
          <Field label="Notes" optional>
            <textarea
              value={draft.description ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="Add context, links, decisions, or what is blocking this task…"
              rows={7}
              className="min-h-36 w-full resize-y rounded-lg border border-transparent bg-bg-secondary/75 px-3 py-2.5 text-sm leading-5 text-text outline-none placeholder:text-text-muted focus:border-accent/45 focus:bg-bg focus:ring-2 focus:ring-accent/10"
            />
          </Field>
          <p className="mt-3 text-2xs leading-4 text-text-muted">To-dos stay on the card, so they are always one click away.</p>
        </div>
      </div>

      <footer className="flex min-h-14 items-center gap-2 border-t border-border/80 bg-bg/90 px-4 py-3 backdrop-blur-xl sm:px-5">
        {!editing.isNew && (
          confirmingDelete ? (
            <div className="mr-auto flex min-w-0 items-center gap-1 text-xs text-text-muted"><span className="whitespace-nowrap">Delete task?</span><Button variant="ghost" size="xs" onClick={() => setConfirmingDelete(false)}>Keep</Button><Button variant="ghost" size="xs" onClick={() => onDelete(draft.id)} className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-700">Delete</Button></div>
          ) : <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)} className="mr-auto text-text-muted hover:text-rose-600">Delete</Button>
        )}
        {editing.isNew && <span className="mr-auto" />}
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={!draft.title.trim()} onClick={() => onSave(draft, columnId, editing.isNew)} className="shadow-none hover:shadow-none">{editing.isNew ? "Add task" : "Save"}</Button>
      </footer>
    </aside>
  );
}

function Field({ label, optional = false, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text">
        {label}
        {optional && <span className="font-normal text-text-muted">optional</span>}
      </span>
      {children}
    </label>
  );
}

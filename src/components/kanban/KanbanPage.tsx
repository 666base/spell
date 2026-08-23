import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
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
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { KanbanBoard, KanbanCard, KanbanColumn, KanbanPriority, KanbanTodo, ProjectViewId } from "../../types/note";
import { useKanbanWorkspace } from "../../context/KanbanWorkspaceContext";
import { createBoardFromTemplate, createEmptyBoard, captureColumn, formatDueDate, PROJECT_ICON_IDS, PROJECT_TEMPLATES } from "../../lib/kanban";
import { cn } from "../../lib/utils";
import { playCheckAnimation } from "../../lib/checkAnimation";
import { isMobileApp } from "../../lib/platform";
import { NoteTitlebar } from "../layout/NoteTitlebar";
import {
  Button,
  IconButton,
  Input,
  Select,
} from "../ui";
import {
  GripIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
  XIcon,
} from "../icons/velocity";
import { CheckmarkIcon } from "../ui/StateIcon";
import { ProjectGlyph } from "./ProjectGlyph";
import { toast } from "sonner";

interface KanbanPageProps {
  sidebarVisible?: boolean;
  focusMode?: boolean;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  showWindowControls?: boolean;
  hideTitleBar?: boolean;
  openCardId?: string | null;
}

interface EditingCard {
  card: KanbanCard;
  columnId: string;
  isNew: boolean;
}

const KANBAN_SORT_TRANSITION = { duration: 250, easing: "cubic-bezier(0.2, 0, 0, 1)" };
const KANBAN_DROP_ANIMATION = {
  duration: 250,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
};

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
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
}

function removeCardId(columns: KanbanColumn[], cardId: string) {
  return columns.map((column) => ({
    ...column,
    cardIds: column.cardIds.filter((id) => id !== cardId),
  }));
}

export function KanbanPage({
  sidebarVisible = true,
  focusMode = false,
  onToggleSidebar,
  onNewNote,
  showWindowControls = false,
  hideTitleBar = false,
  openCardId = null,
}: KanbanPageProps) {
  const { activeProject, isLoading, updateProject } = useKanbanWorkspace();
  const [editing, setEditing] = useState<EditingCard | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [recentlyCreatedCardId, setRecentlyCreatedCardId] = useState<string | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusCaptureId, setFocusCaptureId] = useState<string | null>(null);
  const [boardEditing, setBoardEditing] = useState(false);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: boardEditing ? 8 : 6 } }),
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
  const hasColumns = board.columns.length > 0;
  const [view, setView] = useState<ProjectViewId>("list");
  const columnIds = useMemo(() => board.columns.map((column) => column.id), [board.columns]);

  useEffect(() => {
    setView("list");
  }, [activeProject?.id]);

  useEffect(() => {
    if (!openCardId || !activeProject || isLoading) return;
    const column = activeProject.board.columns.find((item) => item.cardIds.includes(openCardId));
    const card = activeProject.board.cards.find((item) => item.id === openCardId);
    if (!column || !card) return;
    setEditing({ card, columnId: column.id, isNew: false });
  }, [activeProject?.id, isLoading, openCardId]);

  useEffect(() => {
    if (!recentlyCreatedCardId) return;
    const timeoutId = window.setTimeout(() => setRecentlyCreatedCardId(null), 220);
    return () => window.clearTimeout(timeoutId);
  }, [recentlyCreatedCardId]);

  useEffect(() => {
    const onCreateTask = () => {
      const column = captureColumn(board);
      if (!column) return;
      setFocusCaptureId(column.id);
    };
    window.addEventListener("create-project-task", onCreateTask);
    return () => window.removeEventListener("create-project-task", onCreateTask);
  }, [board]);

  const addColumn = useCallback((title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    persist({
      ...board,
      columns: [...board.columns, { id: `column:${makeId()}`, title: trimmedTitle, cardIds: [] }],
    });
    setNewColumnTitle("");
    setIsAddingColumn(false);
  }, [board, persist]);

  const renameColumn = useCallback((columnId: string, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    persist({
      ...board,
      columns: board.columns.map((column) => (
        column.id === columnId ? { ...column, title: trimmedTitle } : column
      )),
    });
  }, [board, persist]);

  const deleteColumn = useCallback((columnId: string) => {
    const column = board.columns.find((item) => item.id === columnId);
    if (!column) return;
    const remainingColumns = board.columns.filter((item) => item.id !== columnId);
    if (column.cardIds.length > 0 && remainingColumns.length === 0) {
      toast.error("Create another column before removing this one");
      return;
    }
    const columns = remainingColumns.map((item, index) => (
      index === 0 && column.cardIds.length > 0
        ? { ...item, cardIds: [...item.cardIds, ...column.cardIds] }
        : item
    ));
    persist({ ...board, columns });
    setSelectedColumnId((current) => current === columnId ? null : current);
    if (column.cardIds.length > 0) toast.message(`Moved ${column.cardIds.length} task${column.cardIds.length === 1 ? "" : "s"} to ${columns[0].title}`);
  }, [board, persist]);

  const reorderColumns = useCallback((activeId: string, overId: string) => {
    const oldIndex = board.columns.findIndex((column) => column.id === activeId);
    const newIndex = board.columns.findIndex((column) => column.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    persist({ ...board, columns: arrayMove(board.columns, oldIndex, newIndex) });
  }, [board, persist]);

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

  const addQuickCard = useCallback((columnId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const card = { ...newCard(), title: trimmed, client: activeProject?.client?.trim() || "" };
    persist({
      ...board,
      cards: [...board.cards, card],
      columns: board.columns.map((column) => (
        column.id === columnId ? { ...column, cardIds: [...column.cardIds, card.id] } : column
      )),
    });
  }, [activeProject?.client, board, persist]);

  const renameCardTitle = useCallback((cardId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) {
      deleteCard(cardId);
      return;
    }
    persist({
      ...board,
      cards: board.cards.map((card) => (
        card.id === cardId ? { ...card, title: trimmed, updatedAt: Date.now() } : card
      )),
    });
  }, [board, deleteCard, persist]);

  const toggleCardDone = useCallback((cardId: string) => {
    persist({
      ...board,
      cards: board.cards.map((item) =>
        item.id === cardId ? { ...item, completed: !item.completed, updatedAt: Date.now() } : item,
      ),
    });
  }, [board, persist]);

  const renameProject = useCallback((name: string) => {
    if (!activeProject) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === activeProject.name) return;
    updateProject({ ...activeProject, name: trimmed });
  }, [activeProject, updateProject]);

  const setProjectIcon = useCallback((icon: typeof PROJECT_ICON_IDS[number]) => {
    if (!activeProject || activeProject.icon === icon) return;
    updateProject({ ...activeProject, icon });
  }, [activeProject, updateProject]);

  const exitBoardEditing = useCallback(() => {
    setBoardEditing(false);
    setSelectedColumnId(null);
    setIsAddingColumn(false);
    setNewColumnTitle("");
  }, []);

  const setProjectView = useCallback((next: ProjectViewId) => {
    if (next === view) return;
    if (next !== "board") exitBoardEditing();
    setView(next);
    if (activeProject) updateProject({ ...activeProject, view: next });
  }, [activeProject, exitBoardEditing, updateProject, view]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (event.active.data.current?.type === "kanban-column") return;
    setActiveCardId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveCardId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (active.data.current?.type === "kanban-column") {
      reorderColumns(String(active.id), String(over.id));
      return;
    }

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
  }, [board, persist, reorderColumns]);

  useEffect(() => {
    if (!boardEditing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        exitBoardEditing();
        return;
      }
      if ((event.key !== "Delete" && event.key !== "Backspace") || !selectedColumnId) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      deleteColumn(selectedColumnId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [boardEditing, deleteColumn, exitBoardEditing, selectedColumnId]);

  if (isLoading) {
    return (
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg">
        {!hideTitleBar && (
          <NoteTitlebar
            sidebarVisible={sidebarVisible}
            focusMode={focusMode}
            onToggleSidebar={onToggleSidebar}
            onNewNote={onNewNote}
            showWindowControls={showWindowControls}
            showTools={false}
          />
        )}
        <div className="flex-1 bg-bg" />
      </div>
    );
  }

  const titlebar = (
    <NoteTitlebar
      sidebarVisible={sidebarVisible}
      focusMode={focusMode}
      onToggleSidebar={onToggleSidebar}
      onNewNote={onNewNote}
      showWindowControls={showWindowControls}
      showTools={false}
      center={
        <ProjectTitle name={activeProject?.name ?? "Untitled"} onRename={renameProject} />
      }
      trailing={
        <>
          <div className="flex items-center gap-3 pr-1">
            <button
              type="button"
              className={cn("text-[13px]", view === "list" ? "font-semibold text-text" : "text-text-muted")}
              onClick={() => setProjectView("list")}
            >
              List
            </button>
            <button
              type="button"
              className={cn("text-[13px]", view === "board" ? "font-semibold text-text" : "text-text-muted")}
              onClick={() => setProjectView("board")}
            >
              Board
            </button>
          </div>
          {view === "board" && boardEditing && (
            <IconButton
              size="sm"
              title="Delete column"
              disabled={!selectedColumnId}
              className={cn(!selectedColumnId && "opacity-30")}
              onClick={() => selectedColumnId && deleteColumn(selectedColumnId)}
            >
              <TrashIcon />
            </IconButton>
          )}
          {view === "board" && (
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={boardEditing}
              onClick={() => (boardEditing ? exitBoardEditing() : setBoardEditing(true))}
            >
              {boardEditing ? "Done" : "Edit"}
            </Button>
          )}
          <div className="relative">
            <IconButton
              size="sm"
              title="Project settings"
              pressed={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <SettingsIcon />
            </IconButton>
            {settingsOpen && (
              <div className="spell-menu absolute right-0 top-full z-50 mt-1 grid min-w-36 grid-cols-4 gap-0.5 p-1.5">
                {PROJECT_ICON_IDS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    className={cn(
                      "flex size-7 items-center justify-center rounded-md text-text-muted",
                      activeProject?.icon === icon && "bg-bg-selected text-text",
                    )}
                    onClick={() => {
                      setProjectIcon(icon);
                      setSettingsOpen(false);
                    }}
                    aria-label={icon}
                  >
                    <ProjectGlyph id={icon} className="size-4" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      }
    />
  );

  const columns = (
    <>
      {!hasColumns && (
        <EmptyBoard
          onUseTemplate={(id) => persist(createBoardFromTemplate(id))}
        />
      )}
      {board.columns.map((column) => (
        <KanbanColumnView
          key={column.id}
          column={column}
          boardEditing={boardEditing}
          selected={selectedColumnId === column.id}
          focusCapture={focusCaptureId === column.id}
          cards={column.cardIds.map((id) => cardsById.get(id)).filter((card): card is KanbanCard => Boolean(card))}
          onSelect={() => setSelectedColumnId(column.id)}
          onAddCard={(title) => addQuickCard(column.id, title)}
          onToggleDone={(card) => toggleCardDone(card.id)}
          onRenameCard={(card, title) => renameCardTitle(card.id, title)}
          onOpenCard={(card) => setEditing({ card, columnId: column.id, isNew: false })}
          onRename={(title) => renameColumn(column.id, title)}
          recentlyCreatedCardId={recentlyCreatedCardId}
          onCaptureFocused={() => setFocusCaptureId(null)}
        />
      ))}
      <ColumnCreator
        isAdding={isAddingColumn}
        value={newColumnTitle}
        onChange={setNewColumnTitle}
        onAdd={() => addColumn(newColumnTitle)}
        onCancel={() => {
          setNewColumnTitle("");
          setIsAddingColumn(false);
        }}
        onOpen={() => setIsAddingColumn(true)}
      />
    </>
  );

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg">
      {!hideTitleBar && titlebar}
      <div className="relative min-h-0 flex-1">
        <div className={cn("h-full overflow-hidden", editing && "sm:mr-[388px]")}>
          {view === "list" ? (
            <ProjectNoteList
              columns={board.columns}
              cardsById={cardsById}
              recentlyCreatedCardId={recentlyCreatedCardId}
              focusCaptureId={focusCaptureId}
              isAddingColumn={isAddingColumn}
              newColumnTitle={newColumnTitle}
              onCaptureFocused={() => setFocusCaptureId(null)}
              onAddCard={(columnId, title) => addQuickCard(columnId, title)}
              onToggleDone={(card) => toggleCardDone(card.id)}
              onRenameCard={(card, title) => renameCardTitle(card.id, title)}
              onOpenCard={(card, columnId) => setEditing({ card, columnId, isNew: false })}
              onRenameColumn={renameColumn}
              onUseTemplate={(id) => persist(createBoardFromTemplate(id))}
              onAddColumn={() => addColumn(newColumnTitle)}
              onColumnTitleChange={setNewColumnTitle}
              onOpenColumnCreator={() => setIsAddingColumn(true)}
              onCancelColumnCreator={() => {
                setNewColumnTitle("");
                setIsAddingColumn(false);
              }}
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={boardEditing ? closestCenter : undefined}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveCardId(null)}
            >
              <div
                className="kanban-board"
                data-editing={boardEditing ? "true" : undefined}
                onPointerDown={(event) => {
                  if (!boardEditing) return;
                  if (event.target === event.currentTarget) setSelectedColumnId(null);
                }}
              >
                {boardEditing ? (
                  <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
                    {columns}
                  </SortableContext>
                ) : columns}
              </div>
              <DragOverlay dropAnimation={KANBAN_DROP_ANIMATION}>
                {!boardEditing && activeCard ? <KanbanCardTile card={activeCard} overlay /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
        {editing && (
          <>
            {isMobileApp && (
              <button
                type="button"
                className="mobile-drawer-scrim"
                aria-label="Close task"
                onClick={() => setEditing(null)}
              />
            )}
            <TaskDetailPanel
              key={`${editing.columnId}:${editing.card.id}:${editing.isNew ? "new" : "existing"}`}
              editing={editing}
              columns={board.columns}
              onClose={() => setEditing(null)}
              onSave={saveCard}
              onDelete={deleteCard}
              onAddTodo={addTodoToCard}
              onToggleTodo={toggleCardTodo}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ProjectTitle({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [value, setValue] = useState(name);

  useEffect(() => {
    setValue(name);
  }, [name]);

  return (
    <input
      value={value}
      aria-label="Project title"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const trimmed = value.trim();
        if (trimmed) onRename(trimmed);
        else setValue(name);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setValue(name);
          event.currentTarget.blur();
        }
      }}
      className="titlebar-title"
    />
  );
}

function ProjectNoteList({
  columns,
  cardsById,
  recentlyCreatedCardId,
  focusCaptureId,
  isAddingColumn,
  newColumnTitle,
  onCaptureFocused,
  onAddCard,
  onToggleDone,
  onRenameCard,
  onOpenCard,
  onRenameColumn,
  onUseTemplate,
  onAddColumn,
  onColumnTitleChange,
  onOpenColumnCreator,
  onCancelColumnCreator,
}: {
  columns: KanbanColumn[];
  cardsById: Map<string, KanbanCard>;
  recentlyCreatedCardId: string | null;
  focusCaptureId: string | null;
  isAddingColumn: boolean;
  newColumnTitle: string;
  onCaptureFocused: () => void;
  onAddCard: (columnId: string, title: string) => void;
  onToggleDone: (card: KanbanCard) => void;
  onRenameCard: (card: KanbanCard, title: string) => void;
  onOpenCard: (card: KanbanCard, columnId: string) => void;
  onRenameColumn: (columnId: string, title: string) => void;
  onUseTemplate: (id: "client" | "personal") => void;
  onAddColumn: () => void;
  onColumnTitleChange: (title: string) => void;
  onOpenColumnCreator: () => void;
  onCancelColumnCreator: () => void;
}) {
  return (
    <div
      className="h-full overflow-y-auto"
    >
      <div
        className="prose mx-auto w-full px-6 pt-3 pb-24"
        style={{ maxWidth: "var(--editor-max-width, 48rem)" }}
      >
        {columns.length === 0 && <EmptyBoard onUseTemplate={onUseTemplate} />}
        {columns.map((column, index) => (
          <section key={column.id}>
            <ColumnHeading
              title={column.title}
              first={index === 0}
              onRename={(title) => onRenameColumn(column.id, title)}
            />
            {column.cardIds.map((id) => {
              const card = cardsById.get(id);
              if (!card) return null;
              return (
                <KanbanCardTile
                  key={card.id}
                  card={card}
                  onToggleDone={() => onToggleDone(card)}
                  onRename={(title) => onRenameCard(card, title)}
                  onOpen={() => onOpenCard(card, column.id)}
                  recentlyCreated={card.id === recentlyCreatedCardId}
                />
              );
            })}
            <NoteAddLine
              onAdd={(title) => onAddCard(column.id, title)}
              autoFocus={focusCaptureId === column.id}
              onFocused={onCaptureFocused}
            />
          </section>
        ))}
        {columns.length > 0 && (
          isAddingColumn ? (
            <input
              autoFocus
              value={newColumnTitle}
              onChange={(event) => onColumnTitleChange(event.target.value)}
              onBlur={() => {
                if (newColumnTitle.trim()) onAddColumn();
                else onCancelColumnCreator();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAddColumn();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelColumnCreator();
                }
              }}
              placeholder="List"
              aria-label="List name"
              className="not-prose mt-6 w-full bg-transparent text-[length:var(--editor-h2-size)] font-semibold leading-[1.3] text-text outline-none placeholder:text-text-muted/45"
            />
          ) : (
            <button
              type="button"
              className="not-prose mt-6 text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)] text-text-muted hover:text-text"
              onClick={onOpenColumnCreator}
            >
              Add a list
            </button>
          )
        )}
      </div>
    </div>
  );
}

function ColumnHeading({
  title,
  first,
  onRename,
}: {
  title: string;
  first: boolean;
  onRename: (title: string) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [value, setValue] = useState(title);

  useEffect(() => {
    if (!isRenaming) setValue(title);
  }, [isRenaming, title]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed) onRename(trimmed);
    else setValue(title);
    setIsRenaming(false);
  };

  if (isRenaming) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setValue(title);
            setIsRenaming(false);
          }
        }}
        aria-label="List name"
        className={cn(
          "not-prose w-full bg-transparent text-[length:var(--editor-h2-size)] font-semibold leading-[1.3] text-text outline-none",
          first ? "mt-0 mb-[0.35em]" : "mt-[1em] mb-[0.35em]",
        )}
      />
    );
  }

  return (
    <h2 className={cn("cursor-text", first && "!mt-0")}>
      <button type="button" onClick={() => setIsRenaming(true)} className="text-left">
        {title}
      </button>
    </h2>
  );
}

function EmptyBoard({
  onUseTemplate,
}: {
  onUseTemplate: (id: "client" | "personal") => void;
}) {
  return (
    <div className="not-prose mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)] text-text-muted">
      {PROJECT_TEMPLATES.filter((template) => template.id !== "blank").map((template) => (
        <button
          key={template.id}
          type="button"
          className="hover:text-text"
          onClick={() => onUseTemplate(template.id as "client" | "personal")}
        >
          {template.name}
        </button>
      ))}
    </div>
  );
}

function ColumnCreator({
  isAdding,
  value,
  onChange,
  onAdd,
  onCancel,
  onOpen,
}: {
  isAdding: boolean;
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  onCancel: () => void;
  onOpen: () => void;
}) {
  if (!isAdding) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label="Add column"
        className="kanban-board-add not-prose"
      >
        Add
      </button>
    );
  }
  return (
    <form
      className="kanban-board-column not-prose"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd();
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (value.trim()) onAdd();
          else onCancel();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder="Column"
        aria-label="Column name"
        className="w-full bg-transparent px-1 text-[13px] font-semibold leading-5 text-text outline-none placeholder:text-text-muted/50"
      />
    </form>
  );
}

function KanbanColumnView({
  column,
  cards,
  boardEditing,
  selected,
  focusCapture = false,
  onSelect,
  onAddCard,
  onToggleDone,
  onRenameCard,
  onOpenCard,
  onRename,
  recentlyCreatedCardId,
  onCaptureFocused,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  boardEditing: boolean;
  selected: boolean;
  focusCapture?: boolean;
  onSelect: () => void;
  onAddCard: (title: string) => void;
  onToggleDone: (card: KanbanCard) => void;
  onRenameCard: (card: KanbanCard, title: string) => void;
  onOpenCard: (card: KanbanCard) => void;
  onRename: (title: string) => void;
  recentlyCreatedCardId: string | null;
  onCaptureFocused?: () => void;
}) {
  const droppable = useDroppable({
    id: `kanban-column:${column.id}`,
    data: { type: "kanban-column", columnId: column.id },
    disabled: boardEditing,
  });
  const sortable = useSortable({
    id: column.id,
    data: { type: "kanban-column", columnId: column.id },
    disabled: !boardEditing,
    transition: KANBAN_SORT_TRANSITION,
  });
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(column.title);

  useEffect(() => {
    if (!isRenaming) setTitle(column.title);
  }, [column.title, isRenaming]);

  const commitRename = () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle) onRename(trimmedTitle);
    else setTitle(column.title);
    setIsRenaming(false);
  };

  const setNodeRef = (node: HTMLElement | null) => {
    droppable.setNodeRef(node);
    sortable.setNodeRef(node);
  };

  return (
    <section
      ref={setNodeRef}
      style={boardEditing ? { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition } : undefined}
      className={cn(
        "not-prose kanban-column kanban-board-column",
        sortable.isDragging && "opacity-40",
      )}
      data-over={!boardEditing && droppable.isOver ? "true" : undefined}
      data-editing={boardEditing ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      aria-label={column.title}
      onPointerDown={() => {
        if (boardEditing) onSelect();
      }}
    >
      <div className="flex items-center gap-1.5">
        {boardEditing && (
          <button
            type="button"
            aria-label={`Reorder ${column.title}`}
            className="flex size-6 shrink-0 cursor-grab items-center justify-center text-text-muted active:cursor-grabbing"
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripIcon className="size-3.5" />
          </button>
        )}
        {isRenaming ? (
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitRename();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setTitle(column.title);
                setIsRenaming(false);
              }
            }}
            aria-label="Column name"
            className="min-w-0 flex-1 bg-transparent px-0.5 text-[13px] font-semibold leading-5 text-text outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsRenaming(true)}
            className="min-w-0 flex-1 truncate px-0.5 text-left text-[13px] font-semibold leading-5 text-text"
          >
            {column.title}
          </button>
        )}
      </div>
      <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
        <div className="kanban-board-cards">
          {cards.map((card) => (
            <SortableKanbanCard
              key={card.id}
              card={card}
              columnId={column.id}
              disabled={boardEditing}
              onToggleDone={() => onToggleDone(card)}
              onRename={(nextTitle) => onRenameCard(card, nextTitle)}
              onOpen={() => onOpenCard(card)}
              recentlyCreated={card.id === recentlyCreatedCardId}
            />
          ))}
          {cards.length === 0 && droppable.isOver && !boardEditing && (
            <div className="kanban-board-drop" />
          )}
          {!boardEditing && (
            <NoteAddLine
              onAdd={onAddCard}
              autoFocus={focusCapture}
              onFocused={onCaptureFocused}
            />
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function NoteAddLine({
  onAdd,
  autoFocus = false,
  onFocused,
}: {
  onAdd: (title: string) => void;
  autoFocus?: boolean;
  onFocused?: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    onFocused?.();
  }, [autoFocus, onFocused]);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const title = value.trim();
          if (!title) return;
          onAdd(title);
          setValue("");
        }
      }}
      placeholder="Add"
      aria-label="Add"
      className="not-prose w-full bg-transparent py-1 text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)] text-text outline-none placeholder:text-text-muted/45"
    />
  );
}

function SortableKanbanCard({
  card,
  columnId,
  disabled = false,
  onToggleDone,
  onRename,
  onOpen,
  recentlyCreated,
}: {
  card: KanbanCard;
  columnId: string;
  disabled?: boolean;
  onToggleDone: () => void;
  onRename: (title: string) => void;
  onOpen: () => void;
  recentlyCreated: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "kanban-card", columnId },
    disabled,
    transition: KANBAN_SORT_TRANSITION,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-30")} {...attributes}>
      <KanbanCardTile
        card={card}
        dragListeners={disabled ? undefined : listeners}
        onToggleDone={onToggleDone}
        onRename={onRename}
        onOpen={onOpen}
        recentlyCreated={recentlyCreated}
      />
    </div>
  );
}

function DoneToggle({
  done,
  label,
  onToggle,
  size = "md",
}: {
  done: boolean;
  label: string;
  onToggle?: () => void;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={done}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (!done) {
          playCheckAnimation(event.currentTarget).catch(() => {});
        }
        onToggle?.();
      }}
      className={cn(
        "kanban-done-toggle",
        size === "sm" ? "size-4" : "size-[1.125rem]",
        done && "is-checked",
      )}
    >
      <CheckmarkIcon checked={done} className={size === "sm" ? "size-2.5" : "size-3"} />
    </button>
  );
}

function KanbanCardTile({
  card,
  overlay = false,
  onToggleDone,
  onRename,
  onOpen,
  dragListeners,
  recentlyCreated = false,
}: {
  card: KanbanCard;
  overlay?: boolean;
  onToggleDone?: () => void;
  onRename?: (title: string) => void;
  onOpen?: () => void;
  dragListeners?: Record<string, unknown>;
  recentlyCreated?: boolean;
}) {
  const [title, setTitle] = useState(card.title);
  const due = formatDueDate(card.dueDate);
  const done = card.completed === true;
  const todos = card.todos ?? [];
  const todoTotal = todos.length;
  const todosDone = todos.filter((todo) => todo.completed).length;

  useEffect(() => {
    setTitle(card.title);
  }, [card.title]);

  return (
    <article
      className={cn(
        "group not-prose kanban-card-tile kanban-board-card",
        overlay && "w-64 rounded-lg bg-bg px-3 py-2 shadow-[var(--shadow-menu)]",
        recentlyCreated && "kanban-card-enter",
      )}
      {...dragListeners}
    >
      <div className="flex items-start gap-[0.4rem]">
        <DoneToggle
          done={done}
          label={done ? `Mark ${card.title} not done` : `Mark ${card.title} done`}
          onToggle={onToggleDone}
        />
        <div className={cn("min-w-0 flex-1", done && "opacity-45")}>
          <input
            value={title}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (title.trim() !== card.title) onRename?.(title);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setTitle(card.title);
                event.currentTarget.blur();
              }
            }}
            onDoubleClick={onOpen}
            aria-label="Task"
            className="min-w-0 w-full bg-transparent text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)] text-text outline-none"
          />
          {(card.client || due || todoTotal > 0) && (
            <p className="mt-1 text-[12px] leading-4 text-text-muted">
              {card.client}
              {card.client && due ? " · " : null}
              {due && (
                <span className={due.tone === "overdue" ? "text-[var(--color-menu-danger)]" : undefined}>
                  {due.label}
                </span>
              )}
              {todoTotal > 0 && (
                <>
                  {(card.client || due) ? " · " : null}
                  {todosDone}/{todoTotal}
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function TaskDetailPanel({
  editing,
  columns,
  hideClient = false,
  onClose,
  onSave,
  onDelete,
  onAddTodo,
  onToggleTodo,
}: {
  editing: EditingCard;
  columns: KanbanColumn[];
  hideClient?: boolean;
  onClose: () => void;
  onSave: (card: KanbanCard, columnId: string, isNew: boolean) => void;
  onDelete: (cardId: string) => void;
  onAddTodo: (cardId: string, title: string) => void;
  onToggleTodo: (cardId: string, todoId: string) => void;
}) {
  const [draft, setDraft] = useState(editing.card);
  const [columnId, setColumnId] = useState(editing.columnId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [newTodo, setNewTodo] = useState("");
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const todos = editing.card.todos ?? [];

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <aside
      className={cn(
        "kanban-task-panel z-30 flex w-full flex-col bg-bg",
        isMobileApp
          ? "mobile-drawer"
          : "absolute inset-y-0 right-0 border-l border-border sm:w-[388px]",
      )}
      aria-label={editing.isNew ? "New task" : "Task details"}
    >
      {isMobileApp && <span className="mobile-drawer-handle" aria-hidden />}
      <header className="flex h-11 items-center gap-2 px-3">
        <span className="min-w-0 flex-1 text-[13px] text-text-muted">{editing.isNew ? "New" : "Note"}</span>
        <IconButton onClick={onClose} title="Close" size="sm"><XIcon className="h-4 w-4 stroke-[1.7]" /></IconButton>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        <textarea
          ref={titleInputRef}
          aria-label="Task title"
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          placeholder="What needs to happen next?"
          rows={2}
          className="min-h-15 w-full resize-none bg-transparent text-[17px] font-semibold leading-6 text-text outline-none placeholder:text-text-muted"
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="Stage"><Select value={columnId} onValueChange={setColumnId}>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</Select></Field>
          <Field label="Due" optional><Input type="date" value={draft.dueDate ?? ""} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
          {!hideClient && (
            <Field label="Client" optional><Input value={draft.client ?? ""} onChange={(event) => setDraft((current) => ({ ...current, client: event.target.value }))} placeholder="Client" /></Field>
          )}
          <Field label="Priority"><Select value={draft.priority} onValueChange={(value) => setDraft((current) => ({ ...current, priority: value as KanbanPriority }))}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select></Field>
        </div>

        <div className="mt-6 border-t border-border/80 pt-5">
          <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text">
            To-dos
            <span className="font-normal text-text-muted">optional</span>
          </span>
          <div className="space-y-1.5">
            {todos.map((todo) => (
              <div key={todo.id} className="flex items-center gap-2.5">
                <DoneToggle
                  done={todo.completed}
                  label={`${todo.completed ? "Mark incomplete" : "Mark complete"}: ${todo.title}`}
                  onToggle={() => onToggleTodo(draft.id, todo.id)}
                  size="sm"
                />
                <span className={cn("min-w-0 flex-1 text-[13px] leading-5", todo.completed ? "text-text-muted/70" : "text-text")}>{todo.title}</span>
              </div>
            ))}
            <form
              className="flex items-center gap-2.5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!newTodo.trim()) return;
                onAddTodo(draft.id, newTodo);
                setNewTodo("");
              }}
            >
              <PlusIcon className="size-3.5 shrink-0 text-text-muted" />
              <input
                value={newTodo}
                onChange={(event) => setNewTodo(event.target.value)}
                placeholder="Add to-do"
                aria-label="Add to-do"
                className="min-w-0 flex-1 bg-transparent text-[13px] leading-5 text-text outline-none placeholder:text-text-muted/75"
              />
            </form>
          </div>
        </div>

        <div className="mt-6 border-t border-border/80 pt-5">
          <Field label="Notes" optional>
            <textarea
              aria-label="Task notes"
              value={draft.description ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="Add context, links, decisions, or what is blocking this task…"
              rows={7}
              className="min-h-36 w-full resize-y rounded-lg border border-transparent bg-bg-secondary/75 px-3 py-2.5 text-sm leading-5 text-text outline-none placeholder:text-text-muted focus:border-accent/45 focus:bg-bg focus:ring-2 focus:ring-accent/10"
            />
          </Field>
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

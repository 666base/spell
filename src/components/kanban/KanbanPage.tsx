import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
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
import type { ColumnColorId, KanbanBoard, KanbanCard, KanbanColumn, KanbanPriority, KanbanTodo, ProjectViewId } from "../../types/note";
import { useKanbanWorkspace } from "../../context/KanbanWorkspaceContext";
import {
  appendCardToColumn,
  captureColumn,
  createBoardFromTemplate,
  createEmptyBoard,
  formatDueDate,
  PROJECT_ICON_IDS,
  PROJECT_VIEWS,
  removeCardId,
  withCardCompleted,
  withCardInColumn,
  withCardTodos,
} from "../../lib/kanban";
import { cn } from "../../lib/utils";
import { isMobileApp } from "../../lib/platform";
import { EASE_OUT_CSS, MOTION_PANEL_MS } from "../../lib/motion";
import { NoteTitlebar } from "../layout/NoteTitlebar";
import {
  AnchoredPopover,
  AppPopover,
  IconButton,
  Input,
  Select,
  SpellDateField,
} from "../ui";
import {
  ColumnsIcon,
  GalleryIcon,
  GripIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
} from "../icons/velocity";
import { CheckmarkIcon } from "../ui/StateIcon";
import { ProjectGlyph } from "./ProjectGlyph";
import { StatusPicker, StageEditor, checkStatusColor } from "./StatusChip";
import { toast } from "sonner";
import { bindOverflowPan } from "../../lib/overflowPan";

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

const KANBAN_SORT_TRANSITION = { duration: MOTION_PANEL_MS, easing: EASE_OUT_CSS };
const KANBAN_DROP_ANIMATION = {
  duration: MOTION_PANEL_MS,
  easing: EASE_OUT_CSS,
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

export function KanbanPage({
  sidebarVisible = true,
  focusMode = false,
  onToggleSidebar,
  onNewNote,
  showWindowControls = false,
  hideTitleBar = false,
  openCardId = null,
}: KanbanPageProps) {
  const { activeProject, isLoading, updateProject, patchActiveBoard } = useKanbanWorkspace();
  const [editing, setEditing] = useState<EditingCard | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [recentlyCreatedCardId, setRecentlyCreatedCardId] = useState<string | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const [focusCaptureId, setFocusCaptureId] = useState<string | null>(null);
  const [boardEditing, setBoardEditing] = useState(false);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: boardEditing ? 8 : 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: isMobileApp ? { distance: 16 } : { delay: 180, tolerance: 8 },
    }),
  );
  const board = activeProject?.board ?? createEmptyBoard();

  const persist = useCallback((updater: (board: KanbanBoard) => KanbanBoard) => {
    patchActiveBoard(updater);
  }, [patchActiveBoard]);

  const cardsById = useMemo(
    () => new Map(board.cards.map((card) => [card.id, card])),
    [board.cards],
  );
  const activeCard = activeCardId ? cardsById.get(activeCardId) ?? null : null;
  const hasColumns = board.columns.length > 0;
  const [view, setView] = useState<ProjectViewId>(activeProject?.view ?? "list");
  const columnIds = useMemo(() => board.columns.map((column) => column.id), [board.columns]);

  useEffect(() => {
    setView(activeProject?.view ?? "list");
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
    if (!activeCardId) {
      delete document.documentElement.dataset.kanbanDragging;
      return;
    }
    document.documentElement.dataset.kanbanDragging = "true";
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    return () => {
      delete document.documentElement.dataset.kanbanDragging;
    };
  }, [activeCardId]);

  useEffect(() => {
    if (view !== "board") return;
    const node = boardRef.current;
    if (!node) return;
    return bindOverflowPan(node, {
      axis: "x",
      holdCancelsMs: 160,
      ignore: (event) => {
        if (!(event.target instanceof Element)) return false;
        if (event.target.closest("input, textarea, select, [data-no-pan]")) return true;
        return event.pointerType !== "touch" && Boolean(event.target.closest(".kanban-board-card"));
      },
    });
  }, [view, board.columns.length]);

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
    persist((current) => ({
      ...current,
      columns: [...current.columns, { id: `column:${makeId()}`, title: trimmedTitle, cardIds: [] }],
    }));
    setNewColumnTitle("");
    setIsAddingColumn(false);
  }, [persist]);

  const renameColumn = useCallback((columnId: string, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    persist((current) => ({
      ...current,
      columns: current.columns.map((column) => (
        column.id === columnId ? { ...column, title: trimmedTitle } : column
      )),
    }));
  }, [persist]);

  const recolorColumn = useCallback((columnId: string, color: ColumnColorId) => {
    persist((current) => ({
      ...current,
      columns: current.columns.map((column) => (
        column.id === columnId
          ? { ...column, color: color === "default" ? undefined : color }
          : column
      )),
    }));
  }, [persist]);

  const deleteColumn = useCallback((columnId: string) => {
    persist((current) => {
      const column = current.columns.find((item) => item.id === columnId);
      if (!column) return current;
      const remainingColumns = current.columns.filter((item) => item.id !== columnId);
      if (column.cardIds.length > 0 && remainingColumns.length === 0) {
        toast.error("Create another column before removing this one");
        return current;
      }
      const columns = remainingColumns.map((item, index) => (
        index === 0 && column.cardIds.length > 0
          ? { ...item, cardIds: [...item.cardIds, ...column.cardIds] }
          : item
      ));
      if (column.cardIds.length > 0) {
        toast.message(`Moved ${column.cardIds.length} task${column.cardIds.length === 1 ? "" : "s"} to ${columns[0].title}`);
      }
      return { ...current, columns };
    });
    setSelectedColumnId((current) => current === columnId ? null : current);
  }, [persist]);

  const reorderColumns = useCallback((activeId: string, overId: string) => {
    persist((current) => {
      const oldIndex = current.columns.findIndex((column) => column.id === activeId);
      const newIndex = current.columns.findIndex((column) => column.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return current;
      return { ...current, columns: arrayMove(current.columns, oldIndex, newIndex) };
    });
  }, [persist]);

  const saveCard = useCallback((card: KanbanCard, columnId: string, isNew: boolean) => {
    const savedCard = { ...card, title: card.title.trim(), updatedAt: Date.now() };
    if (!savedCard.title) return;
    persist((current) => withCardInColumn({
      ...current,
      cards: isNew
        ? [...current.cards, savedCard]
        : current.cards.map((existing) => existing.id === savedCard.id ? savedCard : existing),
    }, savedCard.id, columnId));
    if (isNew) setRecentlyCreatedCardId(savedCard.id);
    setEditing(null);
  }, [persist]);

  const deleteCard = useCallback((cardId: string) => {
    persist((current) => ({
      ...current,
      columns: removeCardId(current.columns, cardId),
      cards: current.cards.filter((card) => card.id !== cardId),
    }));
    setEditing(null);
  }, [persist]);

  const updateCardTodos = useCallback((cardId: string, update: (todos: KanbanTodo[]) => KanbanTodo[]) => {
    persist((current) => {
      const boardCard = current.cards.find((item) => item.id === cardId);
      if (!boardCard) return current;
      return withCardTodos(current, cardId, update(boardCard.todos ?? []));
    });
    setEditing((current) => {
      if (current?.card.id !== cardId) return current;
      const todos = update(current.card.todos ?? []);
      return { ...current, card: { ...current.card, todos, updatedAt: Date.now() } };
    });
  }, [persist]);

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
    persist((current) => appendCardToColumn(current, columnId, { ...newCard(), title: trimmed }));
  }, [persist]);

  const renameCardTitle = useCallback((cardId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) {
      deleteCard(cardId);
      return;
    }
    persist((current) => ({
      ...current,
      cards: current.cards.map((card) => (
        card.id === cardId ? { ...card, title: trimmed, updatedAt: Date.now() } : card
      )),
    }));
  }, [deleteCard, persist]);

  const toggleCardDone = useCallback((cardId: string) => {
    persist((current) => {
      const card = current.cards.find((item) => item.id === cardId);
      if (!card) return current;
      return withCardCompleted(current, cardId, card.completed !== true);
    });
  }, [persist]);

  const moveCard = useCallback((cardId: string, columnId: string) => {
    persist((current) => withCardInColumn(current, cardId, columnId));
  }, [persist]);

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

    persist((current) => {
      const cardId = String(active.id);
      const sourceColumn = current.columns.find((column) => column.cardIds.includes(cardId));
      if (!sourceColumn) return current;
      const overData = over.data.current;
      const destinationId = overData?.type === "kanban-card"
        ? String(overData.columnId)
        : String(over.id).replace(/^kanban-column:/, "");
      const destinationColumn = current.columns.find((column) => column.id === destinationId);
      if (!destinationColumn) return current;

      const destinationCardId = overData?.type === "kanban-card" ? String(over.id) : null;
      const withoutCard = removeCardId(current.columns, cardId);
      const destination = withoutCard.find((column) => column.id === destinationColumn.id);
      if (!destination) return current;
      const insertAt = destinationCardId
        ? Math.max(0, destination.cardIds.indexOf(destinationCardId))
        : destination.cardIds.length;
      return withCardInColumn(current, cardId, destinationColumn.id, insertAt);
    });
  }, [persist, reorderColumns]);

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
        <div className="notes-toolbar relative flex items-center" role="toolbar" aria-label="Project">
          <ProjectViewSwitcher view={view} onChange={setProjectView} />
          {view === "board" && (
            <div className="notes-toolbar-group">
              {boardEditing && (
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
              <IconButton
                size="sm"
                title={boardEditing ? "Done" : "Edit board"}
                pressed={boardEditing}
                onClick={() => (boardEditing ? exitBoardEditing() : setBoardEditing(true))}
              >
                <PencilIcon />
              </IconButton>
            </div>
          )}
          <div className="notes-toolbar-group relative">
            <IconButton
              ref={settingsRef}
              size="sm"
              title="Project settings"
              pressed={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <SettingsIcon />
            </IconButton>
            <AnchoredPopover
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              anchorRef={settingsRef}
              align="end"
              origin="top right"
              className="spell-menu grid min-w-36 grid-cols-4 gap-0.5 p-1.5"
            >
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
            </AnchoredPopover>
          </div>
        </div>
      }
    />
  );

  const columns = (
    <>
      {!hasColumns && (
        <EmptyBoard
          onUseTemplate={(id) => persist(() => createBoardFromTemplate(id))}
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
          onToggleTodo={toggleCardTodo}
          onRenameCard={(card, title) => renameCardTitle(card.id, title)}
          onOpenCard={(card) => setEditing({ card, columnId: column.id, isNew: false })}
          onRename={(title) => renameColumn(column.id, title)}
          onColor={(color) => recolorColumn(column.id, color)}
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
      {hideTitleBar && (
        <ProjectViewSwitcher view={view} onChange={setProjectView} variant="mobile" />
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-hidden">
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
              onToggleTodo={toggleCardTodo}
              onRenameCard={(card, title) => renameCardTitle(card.id, title)}
              onOpenCard={(card, columnId) => setEditing({ card, columnId, isNew: false })}
              onRenameColumn={renameColumn}
              onColorColumn={recolorColumn}
              onUseTemplate={(id) => persist(() => createBoardFromTemplate(id))}
              onAddColumn={() => addColumn(newColumnTitle)}
              onColumnTitleChange={setNewColumnTitle}
              onOpenColumnCreator={() => setIsAddingColumn(true)}
              onCancelColumnCreator={() => {
                setNewColumnTitle("");
                setIsAddingColumn(false);
              }}
            />
          ) : view === "gallery" ? (
            <ProjectGallery
              columns={board.columns}
              cardsById={cardsById}
              recentlyCreatedCardId={recentlyCreatedCardId}
              focusCaptureId={focusCaptureId}
              onCaptureFocused={() => setFocusCaptureId(null)}
              onAddCard={(title) => {
                const column = captureColumn(board);
                if (column) addQuickCard(column.id, title);
              }}
              onToggleDone={(card) => toggleCardDone(card.id)}
              onToggleTodo={toggleCardTodo}
              onRenameCard={(card, title) => renameCardTitle(card.id, title)}
              onOpenCard={(card, columnId) => setEditing({ card, columnId, isNew: false })}
              onMoveCard={(card, columnId) => moveCard(card.id, columnId)}
              onUseTemplate={(id) => persist(() => createBoardFromTemplate(id))}
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
                ref={boardRef}
                className="kanban-board"
                data-keen-slider-clickable
                data-pager-ignore
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
                {!boardEditing && activeCard ? (
                  <KanbanCardTile
                    card={activeCard}
                    overlay
                    columnTitle={board.columns.find((column) => column.cardIds.includes(activeCard.id))?.title}
                    columnColor={board.columns.find((column) => column.cardIds.includes(activeCard.id))?.color}
                    onToggleTodo={toggleCardTodo}
                  />
                ) : null}
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
            onAddTodo={addTodoToCard}
            onToggleTodo={toggleCardTodo}
          />
        )}
      </div>
    </div>
  );
}

const PROJECT_VIEW_ICONS = {
  list: ListIcon,
  board: ColumnsIcon,
  gallery: GalleryIcon,
} as const;

function ProjectViewSwitcher({
  view,
  onChange,
  variant = "desktop",
}: {
  view: ProjectViewId;
  onChange: (id: ProjectViewId) => void;
  variant?: "desktop" | "mobile";
}) {
  const buttons = PROJECT_VIEWS.map((item) => {
    const Icon = PROJECT_VIEW_ICONS[item.id];
    const selected = view === item.id;
    if (variant === "mobile") {
      return (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-label={item.label}
          aria-selected={selected}
          aria-pressed={selected}
          onClick={() => onChange(item.id)}
        >
          <Icon className="size-4" />
        </button>
      );
    }
    return (
      <IconButton
        key={item.id}
        size="sm"
        title={item.label}
        role="tab"
        aria-selected={selected}
        pressed={selected}
        onClick={() => onChange(item.id)}
      >
        <Icon />
      </IconButton>
    );
  });

  return (
    <div
      className={variant === "mobile" ? "mobile-project-views" : "notes-toolbar-group"}
      role="tablist"
      aria-label="Project view"
    >
      {buttons}
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
      size={Math.max(value.length, 1)}
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
  onToggleTodo,
  onRenameCard,
  onOpenCard,
  onRenameColumn,
  onColorColumn,
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
  onToggleTodo: (cardId: string, todoId: string) => void;
  onRenameCard: (card: KanbanCard, title: string) => void;
  onOpenCard: (card: KanbanCard, columnId: string) => void;
  onRenameColumn: (columnId: string, title: string) => void;
  onColorColumn: (columnId: string, color: ColumnColorId) => void;
  onUseTemplate: (id: "week") => void;
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
        className="prose mx-auto w-full px-6 pt-8 pb-24"
        style={{ maxWidth: "var(--editor-max-width, 48rem)" }}
      >
        {columns.length === 0 && <EmptyBoard onUseTemplate={onUseTemplate} />}
        {columns.map((column, index) => (
          <section key={column.id}>
            <ColumnHeading
              title={column.title}
              color={column.color}
              first={index === 0}
              onRename={(title) => onRenameColumn(column.id, title)}
              onColor={(color) => onColorColumn(column.id, color)}
            />
            {column.cardIds.map((id) => {
              const card = cardsById.get(id);
              if (!card) return null;
              return (
                <KanbanCardTile
                  key={card.id}
                  card={card}
                  columnTitle={column.title}
                  columnColor={column.color}
                  onToggleDone={() => onToggleDone(card)}
                  onToggleTodo={onToggleTodo}
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
              className="kanban-list-composer pl-7"
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

function ProjectGallery({
  columns,
  cardsById,
  recentlyCreatedCardId,
  focusCaptureId,
  onCaptureFocused,
  onAddCard,
  onToggleDone,
  onToggleTodo,
  onRenameCard,
  onOpenCard,
  onMoveCard,
  onUseTemplate,
}: {
  columns: KanbanColumn[];
  cardsById: Map<string, KanbanCard>;
  recentlyCreatedCardId: string | null;
  focusCaptureId: string | null;
  onCaptureFocused: () => void;
  onAddCard: (title: string) => void;
  onToggleDone: (card: KanbanCard) => void;
  onToggleTodo: (cardId: string, todoId: string) => void;
  onRenameCard: (card: KanbanCard, title: string) => void;
  onOpenCard: (card: KanbanCard, columnId: string) => void;
  onMoveCard: (card: KanbanCard, columnId: string) => void;
  onUseTemplate: (id: "week") => void;
}) {
  const cards = columns.flatMap((column) =>
    column.cardIds
      .map((id) => {
        const card = cardsById.get(id);
        return card ? { card, columnId: column.id, columnTitle: column.title, columnColor: column.color } : null;
      })
      .filter((item): item is { card: KanbanCard; columnId: string; columnTitle: string; columnColor: ColumnColorId | undefined } => Boolean(item)),
  );

  return (
    <div className="kanban-gallery">
      {columns.length === 0 && <EmptyBoard onUseTemplate={onUseTemplate} />}
      {columns.length > 0 && (
        <NoteAddLine
          onAdd={onAddCard}
          autoFocus={Boolean(focusCaptureId)}
          onFocused={onCaptureFocused}
          className="kanban-list-composer mb-4"
        />
      )}
      <div className="kanban-gallery-grid">
        {cards.map(({ card, columnId, columnTitle, columnColor }) => (
          <div key={card.id} className="kanban-gallery-card">
            <p className="mb-2">
              <StatusPicker
                title={columnTitle}
                color={columnColor}
                value={columnId}
                columns={columns}
                onChange={(nextColumnId) => onMoveCard(card, nextColumnId)}
                size="sm"
              />
            </p>
            <KanbanCardTile
              card={card}
              columnTitle={columnTitle}
              columnColor={columnColor}
              onToggleDone={() => onToggleDone(card)}
              onToggleTodo={onToggleTodo}
              onRename={(title) => onRenameCard(card, title)}
              onOpen={() => onOpenCard(card, columnId)}
              recentlyCreated={card.id === recentlyCreatedCardId}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ColumnHeading({
  title,
  color,
  first,
  onRename,
  onColor,
}: {
  title: string;
  color?: ColumnColorId;
  first: boolean;
  onRename: (title: string) => void;
  onColor: (color: ColumnColorId) => void;
}) {
  return (
    <div className={cn("not-prose", first ? "mt-0 mb-3" : "mt-8 mb-3")}>
      <StageEditor title={title} color={color} size="lg" onRename={onRename} onColor={onColor} />
    </div>
  );
}

function EmptyBoard({
  onUseTemplate,
}: {
  onUseTemplate: (id: "week") => void;
}) {
  return (
    <div className="not-prose mb-4 text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)] text-text-muted">
      <button type="button" className="hover:text-text" onClick={() => onUseTemplate("week")}>
        This week
      </button>
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
  onToggleTodo,
  onRenameCard,
  onOpenCard,
  onRename,
  onColor,
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
  onToggleTodo: (cardId: string, todoId: string) => void;
  onRenameCard: (card: KanbanCard, title: string) => void;
  onOpenCard: (card: KanbanCard) => void;
  onRename: (title: string) => void;
  onColor: (color: ColumnColorId) => void;
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
      <div className="kanban-board-heading">
        {boardEditing && (
          <button
            type="button"
            aria-label={`Reorder ${column.title}`}
            data-no-pan
            className="flex size-6 shrink-0 cursor-grab items-center justify-center text-text-muted active:cursor-grabbing"
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripIcon className="size-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1 px-0.5">
          <StageEditor
            title={column.title}
            color={column.color}
            onRename={onRename}
            onColor={onColor}
          />
        </div>
      </div>
      <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
        <div className="kanban-board-cards">
          {cards.map((card) => (
            <SortableKanbanCard
              key={card.id}
              card={card}
              columnId={column.id}
              columnTitle={column.title}
              columnColor={column.color}
              disabled={boardEditing}
              onToggleDone={() => onToggleDone(card)}
              onToggleTodo={onToggleTodo}
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
              className="kanban-board-composer"
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
  className,
}: {
  onAdd: (title: string) => void;
  autoFocus?: boolean;
  onFocused?: () => void;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    onFocused?.();
  }, [autoFocus, onFocused]);

  const submit = () => {
    const title = valueRef.current.trim();
    if (!title) return false;
    valueRef.current = "";
    setValue("");
    onAdd(title);
    return true;
  };

  const keepFocus = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
  };

  return (
    <form
      className={cn("not-prose min-w-0", className)}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!submit()) return;
        keepFocus();
      }}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={(event) => {
          if (event.relatedTarget instanceof Node && event.currentTarget.form?.contains(event.relatedTarget)) {
            return;
          }
          submit();
        }}
        enterKeyHint="enter"
        autoCapitalize="sentences"
        autoComplete="off"
        autoCorrect="on"
        placeholder="Add"
        aria-label="Add"
        className="w-full min-w-0 bg-transparent py-1 text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)] text-text outline-none placeholder:text-text-muted/45"
      />
    </form>
  );
}

function SortableKanbanCard({
  card,
  columnId,
  columnTitle,
  columnColor,
  disabled = false,
  onToggleDone,
  onToggleTodo,
  onRename,
  onOpen,
  recentlyCreated,
}: {
  card: KanbanCard;
  columnId: string;
  columnTitle: string;
  columnColor?: ColumnColorId;
  disabled?: boolean;
  onToggleDone: () => void;
  onToggleTodo: (cardId: string, todoId: string) => void;
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
        columnTitle={columnTitle}
        columnColor={columnColor}
        dragListeners={disabled ? undefined : listeners}
        onToggleDone={onToggleDone}
        onToggleTodo={onToggleTodo}
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
  status,
  color,
}: {
  done: boolean;
  label: string;
  onToggle?: () => void;
  size?: "sm" | "md";
  status?: string;
  color?: ColumnColorId;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={done}
      data-color={checkStatusColor(status, color)}
      data-pager-ignore
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle?.();
      }}
      className={cn(
        "kanban-done-toggle kanban-check",
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
  columnTitle,
  columnColor,
  onToggleDone,
  onToggleTodo,
  onRename,
  onOpen,
  dragListeners,
  recentlyCreated = false,
}: {
  card: KanbanCard;
  overlay?: boolean;
  columnTitle?: string;
  columnColor?: ColumnColorId;
  onToggleDone?: () => void;
  onToggleTodo?: (cardId: string, todoId: string) => void;
  onRename?: (title: string) => void;
  onOpen?: () => void;
  dragListeners?: Record<string, unknown>;
  recentlyCreated?: boolean;
}) {
  const [title, setTitle] = useState(card.title);
  const due = formatDueDate(card.dueDate);
  const done = card.completed === true;
  const todos = card.todos ?? [];

  useEffect(() => {
    setTitle(card.title);
  }, [card.title]);

  return (
    <article
      className={cn(
        "group not-prose kanban-card-tile kanban-board-card",
        overlay && "kanban-card-float",
        recentlyCreated && "kanban-card-enter",
      )}
    >
      <div className="kanban-task">
        <span className="kanban-task-check">
          <DoneToggle
            done={done}
            status={columnTitle}
            color={columnColor}
            label={done ? `Mark ${card.title} not done` : `Mark ${card.title} done`}
            onToggle={onToggleDone}
          />
        </span>
        <div className="kanban-task-body" {...dragListeners}>
          {isMobileApp ? (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onOpen}
              className={cn("kanban-task-title", done ? "text-text-muted" : "text-text")}
            >
              {title || "Untitled"}
            </button>
          ) : (
            <input
              value={title}
              onPointerDown={(event) => {
                if (event.currentTarget === document.activeElement) {
                  event.stopPropagation();
                }
              }}
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
              className={cn("kanban-task-title bg-transparent outline-none", done ? "text-text-muted" : "text-text")}
            />
          )}
          {due && (
            <p className="kanban-task-meta">
              <span className={due.tone === "overdue" ? "text-[var(--color-menu-danger)]" : undefined}>
                {due.label}
              </span>
            </p>
          )}
          {todos.length > 0 && (
            <div className="kanban-card-todos">
              {todos.map((todo) => (
                <div key={todo.id} className="kanban-card-todo">
                  <span className="kanban-task-check is-compact">
                    <DoneToggle
                      done={todo.completed}
                      size="sm"
                      label={`${todo.completed ? "Mark incomplete" : "Mark complete"}: ${todo.title}`}
                      onToggle={() => onToggleTodo?.(card.id, todo.id)}
                    />
                  </span>
                  <span className={cn("kanban-card-todo-title", todo.completed && "is-done")}>
                    {todo.title}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function TaskDetailPanel({
  editing,
  columns,
  hideClient = true,
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
  const [newTodo, setNewTodo] = useState("");
  const canDone = Boolean(draft.title.trim());
  const todos = draft.todos ?? [];

  useEffect(() => {
    setDraft((current) => (
      current.todos === editing.card.todos ? current : { ...current, todos: editing.card.todos ?? [] }
    ));
  }, [editing.card.todos]);

  return (
    <AppPopover
      title={editing.isNew ? "New note" : "Note"}
      canDone={canDone}
      onCancel={onClose}
      onDone={() => onSave(draft, columnId, editing.isNew)}
      footer={
        !editing.isNew ? (
          <div className="flex shrink-0 items-center justify-center border-t border-border px-4 py-2.5">
            <button type="button" className="text-[13px] text-[var(--color-menu-danger)]" onClick={() => onDelete(draft.id)}>
              Delete
            </button>
          </div>
        ) : undefined
      }
    >
      <Input
        autoFocus
        aria-label="Task title"
        value={draft.title}
        onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
        placeholder="What needs to happen next?"
        className="mb-4 h-auto border-0 bg-transparent px-0 py-1 text-[17px] font-semibold leading-6 shadow-none focus-visible:border-0 focus-visible:ring-0"
      />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stage">
            <StatusPicker
              title={columns.find((column) => column.id === columnId)?.title ?? "Stage"}
              color={columns.find((column) => column.id === columnId)?.color}
              value={columnId}
              columns={columns}
              onChange={setColumnId}
            />
          </Field>
          <Field label="Due" optional>
            <SpellDateField
              value={draft.dueDate ?? ""}
              onChange={(dueDate) => setDraft((current) => ({ ...current, dueDate }))}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {!hideClient && (
            <Field label="Client" optional>
              <Input
                value={draft.client ?? ""}
                className="h-9"
                onChange={(event) => setDraft((current) => ({ ...current, client: event.target.value }))}
                placeholder="Client"
              />
            </Field>
          )}
          <Field label="Priority">
            <Select value={draft.priority} onValueChange={(value) => setDraft((current) => ({ ...current, priority: value as KanbanPriority }))}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </Field>
        </div>
        <div>
          <span className="mb-1 flex items-center gap-1 text-[12px] leading-4 text-text-muted">
            To-dos
            <span>optional</span>
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
                enterKeyHint="enter"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-[13px] leading-5 text-text outline-none placeholder:text-text-muted/75"
              />
            </form>
          </div>
        </div>
        <Field label="Notes" optional>
          <textarea
            aria-label="Task notes"
            value={draft.description ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            placeholder="Add context, links, decisions, or what is blocking this task…"
            rows={4}
            className="min-h-20 w-full resize-none rounded-lg border border-transparent bg-bg-secondary px-3 py-2 text-[13px] leading-5 text-text outline-none placeholder:text-text-muted focus:border-accent/45 focus:bg-bg"
          />
        </Field>
      </div>
    </AppPopover>
  );
}

function Field({ label, optional = false, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[12px] leading-4 text-text-muted">
        {label}
        {optional && <span>optional</span>}
      </span>
      {children}
    </label>
  );
}

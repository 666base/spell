import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNotes } from "../../context/NotesContext";
import { useKanbanWorkspace } from "../../context/KanbanWorkspaceContext";
import { useFinance } from "../../context/FinanceContext";
import type { FinanceView } from "../finance/FinancePage";
import { NoteList } from "../notes/NoteList";
import { Footer } from "./Footer";
import { IconButton, Input } from "../ui";
import {
  XIcon,
  NoteIcon,
  BookmarkIcon,
  BookIcon,
  KanbanIcon,
  ClientIcon,
  PlusIcon,
  FinanceIcon,
  RenewalIcon,
  IncomeIcon,
  ExpenseIcon,
  SubscriptionIcon,
  ArchiveIcon,
  GripIcon,
} from "../icons/velocity";
import { FolderNameDialog } from "../notes/FolderNameDialog";
export type SidebarPanel = "notes" | "bookmarks" | "journal" | "kanban" | "finance";

const FINANCE_NAV_ORDER_KEY = "spell:finance-sidebar-order";
const DEFAULT_FINANCE_NAV_ORDER = [
  "overview",
  "income",
  "expenses",
  "activity",
  "subscriptions",
  "archive",
] as const satisfies readonly FinanceView[];

function loadFinanceNavOrder(): FinanceView[] {
  try {
    const saved = JSON.parse(localStorage.getItem(FINANCE_NAV_ORDER_KEY) ?? "[]");
    if (!Array.isArray(saved)) return [...DEFAULT_FINANCE_NAV_ORDER];

    const seen = new Set<FinanceView>();
    for (const item of saved) {
      if (
        typeof item === "string" &&
        DEFAULT_FINANCE_NAV_ORDER.includes(item as FinanceView)
      ) {
        seen.add(item as FinanceView);
      }
    }

    return [
      ...DEFAULT_FINANCE_NAV_ORDER.filter((item) => seen.has(item)),
      ...DEFAULT_FINANCE_NAV_ORDER.filter((item) => !seen.has(item)),
    ];
  } catch {
    return [...DEFAULT_FINANCE_NAV_ORDER];
  }
}

interface SidebarProps {
  panel: SidebarPanel;
  onSelectPanel: (panel: SidebarPanel) => void;
  onOpenSettings: () => void;
  hidePanelTabs?: boolean;
  financeView?: FinanceView;
  onSelectFinanceView?: (view: FinanceView) => void;
}

export function SidebarPanelTabs({
  panel,
  onSelectPanel,
  className,
}: {
  panel: SidebarPanel;
  onSelectPanel: (panel: SidebarPanel) => void;
  className?: string;
}) {
  const tabs: { id: SidebarPanel; label: string; icon: typeof NoteIcon }[] = [
    { id: "notes", label: "Notes", icon: NoteIcon },
    { id: "bookmarks", label: "Bookmarks", icon: BookmarkIcon },
    { id: "journal", label: "Journal", icon: BookIcon },
    { id: "kanban", label: "Projects", icon: KanbanIcon },
    { id: "finance", label: "Money", icon: FinanceIcon },
  ];

  return (
    <div className={cn("titlebar-no-drag flex items-center gap-px", className)}>
      {tabs.map(({ id, label, icon: Icon }) => (
        <IconButton
          key={id}
          onClick={() => onSelectPanel(id)}
          aria-label={label}
          aria-pressed={panel === id}
          className={panel === id ? "bg-bg-emphasis text-text" : ""}
        >
          <Icon className="w-4.5 h-4.5 stroke-[1.5]" />
        </IconButton>
      ))}
    </div>
  );
}

export function Sidebar({
  panel,
  onSelectPanel,
  onOpenSettings,
  hidePanelTabs = false,
  financeView = "overview",
  onSelectFinanceView,
}: SidebarProps) {
  const {
    createFolder,
    search,
    searchQuery,
    clearSearch,
    selectedNoteId,
    moveNote,
    moveFolder,
  } = useNotes();
  const { workspace, activeProject, createProject, selectProject, isLoading: projectsLoading } = useKanbanWorkspace();
  const { workspace: financeWorkspace, isLoading: financeLoading } = useFinance();
  const [searchOpen, setSearchOpen] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [folderDialogParent, setFolderDialogParent] = useState("");
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [dragCount, setDragCount] = useState(1);
  const [financeNavOrder, setFinanceNavOrder] = useState<FinanceView[]>(
    loadFinanceNavOrder,
  );
  const [multiSelectedNoteIds, setMultiSelectedNoteIds] = useState<Set<string>>(new Set());
  const [lastClickedNoteId, setLastClickedNoteId] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const multiSelectedRef = useRef(multiSelectedNoteIds);

  useEffect(() => {
    multiSelectedRef.current = multiSelectedNoteIds;
  }, [multiSelectedNoteIds]);

  // dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // A short delay keeps a tap selecting a note while still making a
    // deliberate long-press drag possible on phones and tablets.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const reorderFinanceNav = useCallback((activeView: FinanceView, overView: FinanceView) => {
    if (activeView === overView) return;
    const next = arrayMove(
      financeNavOrder,
      financeNavOrder.indexOf(activeView),
      financeNavOrder.indexOf(overView),
    );
    setFinanceNavOrder(next);
    localStorage.setItem(FINANCE_NAV_ORDER_KEY, JSON.stringify(next));
  }, [financeNavOrder]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "note") {
      const noteId = data.id as string;
      const leaf = noteId.includes("/")
        ? noteId.substring(noteId.lastIndexOf("/") + 1)
        : noteId;
      setDragLabel(leaf);

      // Multi-select: if dragged note is in selection, drag all; otherwise reset
      const selected = multiSelectedRef.current!;
      if (selected.has(noteId) && selected.size > 1) {
        setDragCount(selected.size);
      } else {
        setMultiSelectedNoteIds(new Set([noteId]));
        setDragCount(1);
      }
    } else if (data?.type === "folder") {
      const path = data.path as string;
      const name = path.includes("/")
        ? path.substring(path.lastIndexOf("/") + 1)
        : path;
      setDragLabel(name);
      setDragCount(1);
    }
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setDragLabel(null);
      setDragCount(1);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current;
      const overData = over.data.current;
      if (!activeData || !overData) return;

      if (
        activeData.type === "finance-nav" &&
        overData.type === "finance-nav"
      ) {
        reorderFinanceNav(
          activeData.view as FinanceView,
          overData.view as FinanceView,
        );
        return;
      }

      const targetFolder = overData.path as string;

      try {
        if (activeData.type === "note") {
          const noteId = activeData.id as string;
          const selected = multiSelectedRef.current!;

          // Batch move if multi-selected
          if (selected.has(noteId) && selected.size > 1) {
            const noteIds = Array.from(selected).filter((id) => {
              const parent = id.includes("/")
                ? id.substring(0, id.lastIndexOf("/"))
                : "";
              return parent !== targetFolder;
            });
            if (noteIds.length === 0) return;
            let failures = 0;
            for (const id of noteIds) {
              try {
                await moveNote(id, targetFolder);
              } catch {
                failures++;
              }
            }
            if (failures > 0) {
              toast.error(`Failed to move ${failures} note(s)`);
            }
            setMultiSelectedNoteIds(new Set());
          } else {
            const noteParent = noteId.includes("/")
              ? noteId.substring(0, noteId.lastIndexOf("/"))
              : "";
            if (noteParent === targetFolder) return;
            await moveNote(noteId, targetFolder);
            setMultiSelectedNoteIds(new Set());
          }
        } else if (activeData.type === "folder") {
          const folderPath = activeData.path as string;
          if (
            targetFolder === folderPath ||
            targetFolder.startsWith(folderPath + "/")
          )
            return;
          const folderParent = folderPath.includes("/")
            ? folderPath.substring(0, folderPath.lastIndexOf("/"))
            : "";
          if (folderParent === targetFolder) return;
          await moveFolder(folderPath, targetFolder);
        }

        // Expand target folder so the moved item is visible
        if (targetFolder) {
          window.dispatchEvent(
            new CustomEvent("expand-folder", { detail: targetFolder }),
          );
        }
      } catch (error) {
        console.error("Failed to move item:", error);
        toast.error("Failed to move item");
      }
    },
    [moveNote, moveFolder, reorderFinanceNav],
  );

  // Sync input with search query
  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);

      // Debounce search
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = window.setTimeout(() => {
        search(value);
      }, 220);
    },
    [search],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setInputValue("");
    clearSearch();
  }, [clearSearch]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (searchOpen) {
      // Small delay to ensure the input is rendered
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [searchOpen]);

  // Global shortcut hook: open and focus sidebar search
  useEffect(() => {
    const handleOpenSidebarSearch = () => {
      setSearchOpen(true);
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    };

    window.addEventListener("open-sidebar-search", handleOpenSidebarSearch);
    return () =>
      window.removeEventListener(
        "open-sidebar-search",
        handleOpenSidebarSearch,
      );
  }, []);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (inputValue) {
          // First escape: clear search
          setInputValue("");
          clearSearch();
        } else {
          // Second escape: close search
          closeSearch();
        }
      }
    },
    [inputValue, clearSearch, closeSearch],
  );

  const handleClearSearch = useCallback(() => {
    setInputValue("");
    clearSearch();
  }, [clearSearch]);

  const handleFolderDialogConfirm = useCallback(
    async (name: string) => {
      try {
        await createFolder(folderDialogParent, name);
        setFolderDialogOpen(false);
      } catch (error) {
        console.error("Failed to create folder:", error);
        toast.error("Failed to create folder");
      }
    },
    [createFolder, folderDialogParent],
  );

  const handleProjectDialogConfirm = useCallback((name: string) => {
    createProject({ name });
    onSelectPanel("kanban");
    setProjectDialogOpen(false);
  }, [createProject, onSelectPanel]);

  const openProject = useCallback((projectId: string) => {
    selectProject(projectId);
    onSelectPanel("kanban");
  }, [onSelectPanel, selectProject]);

  // Listen for create-new-folder event (from command palette / keyboard shortcut)
  useEffect(() => {
    const handleCreateFolder = () => {
      // Derive parent folder from currently selected note
      const lastSlash = selectedNoteId?.lastIndexOf("/") ?? -1;
      setFolderDialogParent(
        lastSlash > 0 ? selectedNoteId!.substring(0, lastSlash) : "",
      );
      setFolderDialogOpen(true);
    };

    window.addEventListener("create-new-folder", handleCreateFolder);
    return () =>
      window.removeEventListener("create-new-folder", handleCreateFolder);
  }, [selectedNoteId]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragLabel(null)}
    >
    <div className="relative w-full h-full bg-bg-secondary border-r border-border flex flex-col select-none">
      {!hidePanelTabs && (
        <div className="h-11 shrink-0 flex items-center border-b border-border px-2" data-tauri-drag-region>
          <SidebarPanelTabs panel={panel} onSelectPanel={onSelectPanel} />
        </div>
      )}
      {/* Scrollable area with search and notes */}
      <div className="flex-1 overflow-y-auto">
        {/* Search - sticky at top */}
        {panel === "notes" && searchOpen && (
          <div className="sticky top-0 z-10 px-2 pt-2 bg-bg-secondary">
            <div className="relative">
              <Input
                ref={searchInputRef}
                type="text"
                value={inputValue}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search notes..."
                className="h-9 pr-8 text-sm"
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Clear note search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                >
                  <XIcon className="w-4.5 h-4.5 stroke-[1.5]" />
                </button>
              )}
            </div>
          </div>
        )}

        {panel === "kanban" ? (
          <div className="p-1.5">
            <div className="flex h-7 items-center justify-between px-2.5">
              <span className="text-2xs font-medium uppercase tracking-[0.08em] text-text-muted">Projects</span>
              <IconButton
                variant="ghost"
                size="sm"
                onClick={() => setProjectDialogOpen(true)}
                title="Create project"
              >
                <PlusIcon className="h-3.5 w-3.5 stroke-[1.8]" />
              </IconButton>
            </div>
            <div className="space-y-0.5">
              {projectsLoading ? (
                <div className="h-8 rounded-md bg-bg-muted/60" />
              ) : workspace.projects.map((project) => {
                const openCount = project.board.columns
                  .filter((column) => column.id !== "done")
                  .reduce((count, column) => count + column.cardIds.length, 0);
                const isActive = project.id === activeProject?.id;

                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => openProject(project.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "motion-interactive flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left",
                      isActive ? "bg-bg-emphasis text-text" : "text-text-muted hover:bg-bg-muted hover:text-text",
                    )}
                  >
                    <ClientIcon className="h-3.5 w-3.5 shrink-0 stroke-[1.65]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}</span>
                    {openCount > 0 && (
                      <span className="shrink-0 text-2xs tabular-nums text-text-muted">{openCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : panel === "finance" ? (
          <FinanceSidebarSummary
            workspace={financeWorkspace}
            isLoading={financeLoading}
            view={financeView}
            onSelectView={onSelectFinanceView ?? (() => undefined)}
            order={financeNavOrder}
          />
        ) : (
          <NoteList
            filter={panel === "bookmarks" ? "bookmarked" : panel === "journal" ? "journal" : "all"}
            multiSelectedNoteIds={multiSelectedNoteIds}
            setMultiSelectedNoteIds={setMultiSelectedNoteIds}
            lastClickedNoteId={lastClickedNoteId}
            setLastClickedNoteId={setLastClickedNoteId}
          />
        )}
      </div>

      {/* Footer with git status, commit, and settings */}
      <Footer onOpenSettings={onOpenSettings} />

      {/* Folder name dialog */}
      <FolderNameDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onConfirm={handleFolderDialogConfirm}
        title="Create new folder"
        description="Enter a name for your new folder"
        confirmLabel="Create"
      />
      <FolderNameDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        onConfirm={handleProjectDialogConfirm}
        title="Create project"
        description="Every project has its own board, table, and tasks."
        confirmLabel="Create project"
        inputPlaceholder="Project name"
      />
    </div>

    {/* Drag overlay — floating label while dragging */}
    <DragOverlay>
      {dragLabel && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bg border border-border rounded-md shadow-lg text-sm text-text">
          <NoteIcon className="w-3.5 h-3.5 stroke-[1.6] opacity-50 shrink-0" />
          {dragLabel}
          {dragCount > 1 && (
            <span className="ml-1 px-1.5 py-0.5 bg-accent text-text-inverse text-xs rounded-full leading-none">
              +{dragCount - 1}
            </span>
          )}
        </div>
      )}
    </DragOverlay>
    </DndContext>
  );
}

function FinanceSidebarSummary({
  workspace,
  isLoading,
  view,
  onSelectView,
  order,
}: {
  workspace: ReturnType<typeof useFinance>["workspace"];
  isLoading: boolean;
  view: FinanceView;
  onSelectView: (view: FinanceView) => void;
  order: FinanceView[];
}) {
  const activeSubscriptions = workspace.subscriptions.filter((subscription) => !subscription.archived);
  const activeTransactions = workspace.transactions.filter((transaction) => !transaction.archived);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthTransactions = activeTransactions.filter((transaction) => transaction.date.startsWith(currentMonth));
  const incomeThisMonth = monthTransactions
    .filter((transaction) => transaction.kind === "income")
    .reduce((total, transaction) => total + transaction.amountCents, 0);
  const expensesThisMonth = monthTransactions
    .filter((transaction) => transaction.kind === "expense")
    .reduce((total, transaction) => total + transaction.amountCents, 0);
  const monthlyCommitments = activeSubscriptions.reduce((total, subscription) => {
    if (subscription.cadence === "monthly") return total + subscription.amountCents;
    if (subscription.cadence === "yearly") return total + Math.round(subscription.amountCents / 12);
    return total + Math.round(subscription.amountCents / Math.max(1, subscription.customIntervalDays ?? 30) * 30.4375);
  }, 0);
  const dueSoon = activeSubscriptions.filter((subscription) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const renewal = new Date(`${subscription.nextBillingDate}T12:00:00`);
    return Math.round((renewal.valueOf() - today.valueOf()) / 86_400_000) <= 7;
  }).length;
  const format = (amountCents: number) => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: workspace.currency,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
  const archivedCount = workspace.transactions.filter((transaction) => transaction.archived).length
    + workspace.subscriptions.filter((subscription) => subscription.archived).length;
  const items = useMemo(() => {
    const definitions: Record<FinanceView, FinanceSidebarItem> = {
      overview: { id: "overview", label: "Overview", icon: FinanceIcon },
      income: { id: "income", label: "Income", icon: IncomeIcon, section: "Records", meta: incomeThisMonth ? `+${format(incomeThisMonth)}` : undefined, tone: "income" },
      expenses: { id: "expenses", label: "Spending", icon: ExpenseIcon, section: "Records", meta: expensesThisMonth ? `−${format(expensesThisMonth)}` : undefined, tone: "expense" },
      activity: { id: "activity", label: "All activity", icon: RenewalIcon, section: "Records", meta: activeTransactions.length ? String(activeTransactions.length) : undefined },
      subscriptions: { id: "subscriptions", label: "Subscriptions", icon: SubscriptionIcon, section: "Commitments", meta: activeSubscriptions.length ? String(activeSubscriptions.length) : undefined },
      archive: { id: "archive", label: "Archive", icon: ArchiveIcon, meta: archivedCount ? String(archivedCount) : undefined },
    };
    return order.map((id) => definitions[id]);
  }, [activeSubscriptions.length, activeTransactions.length, archivedCount, expensesThisMonth, incomeThisMonth, order]);

  const groups = useMemo(() => {
    return items.reduce<{ label?: string; items: FinanceSidebarItem[] }[]>(
      (result, item) => {
        const lastGroup = result[result.length - 1];
        if (lastGroup && lastGroup.label === item.section) {
          lastGroup.items.push(item);
        } else {
          result.push({ label: item.section, items: [item] });
        }
        return result;
      },
      [],
    );
  }, [items]);

  return (
    <div className="p-1.5">
      {isLoading ? <div className="space-y-2"><div className="h-7 rounded-md bg-bg-muted" /><div className="h-7 rounded-md bg-bg-muted/70" /><div className="h-7 rounded-md bg-bg-muted/50" /></div> : <>
        <nav aria-label="Money workspace" className="space-y-4">
          <SortableContext
            items={order.map((item) => `finance-nav:${item}`)}
            strategy={verticalListSortingStrategy}
          >
          {groups.map((group, groupIndex) => (
            <div key={`${group.label ?? "main"}-${groupIndex}`}>
              {group.label && <p className="mb-1.5 px-2.5 text-2xs font-semibold uppercase tracking-[0.08em] text-text-muted">{group.label}</p>}
              <div className="space-y-0.5">
                {group.items.map((item) => <SortableFinanceNavItem key={item.id} item={item} selected={view === item.id} onSelect={onSelectView} />)}
              </div>
            </div>
          ))}
          </SortableContext>
        </nav>

        <div className="mt-4 border-y border-border py-3.5">
          <p className="px-2.5 text-2xs font-semibold uppercase tracking-[0.08em] text-text-muted">This month</p>
          <div className="mt-2 space-y-0.5">
            <button type="button" onClick={() => onSelectView("income")} className="motion-interactive flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-bg-muted"><span className="text-xs text-text-muted">Made</span><span className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">+{format(incomeThisMonth)}</span></button>
            <button type="button" onClick={() => onSelectView("expenses")} className="motion-interactive flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-bg-muted"><span className="text-xs text-text-muted">Spent</span><span className="text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-300">−{format(expensesThisMonth)}</span></button>
            <button type="button" onClick={() => onSelectView("subscriptions")} className="motion-interactive flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-bg-muted"><span className="text-xs text-text-muted">Committed</span><span className="text-xs font-semibold tabular-nums text-text">{format(monthlyCommitments)}</span></button>
          </div>
          {dueSoon > 0 && <button type="button" onClick={() => onSelectView("subscriptions")} className="motion-interactive mt-3 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-2xs font-medium text-amber-700 hover:bg-amber-500/8 dark:text-amber-300"><RenewalIcon className="h-3.5 w-3.5 stroke-[1.7]" />{dueSoon} renewal{dueSoon === 1 ? "" : "s"} due soon</button>}
        </div>
      </>}
      </div>
  );
}

interface FinanceSidebarItem {
  id: FinanceView;
  label: string;
  icon: typeof FinanceIcon;
  section?: "Records" | "Commitments";
  meta?: string;
  tone?: "income" | "expense";
}

function SortableFinanceNavItem({
  item,
  selected,
  onSelect,
}: {
  item: FinanceSidebarItem;
  selected: boolean;
  onSelect: (view: FinanceView) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `finance-nav:${item.id}`,
      data: { type: "finance-nav", view: item.id },
    });
  const Icon = item.icon;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "motion-interactive group relative flex w-full cursor-grab items-center gap-2 rounded-lg px-2.5 py-2 text-left active:cursor-grabbing",
        selected ? "bg-bg-emphasis text-text" : "text-text-muted hover:bg-bg-muted hover:text-text",
        isDragging && "z-20 opacity-45",
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
    >
      <Icon className={cn(
        "h-3.5 w-3.5 shrink-0 stroke-[1.6] transition-opacity duration-100 group-hover:opacity-0 group-focus-visible:opacity-0",
        item.tone === "income" && "text-emerald-700 dark:text-emerald-300",
        item.tone === "expense" && "text-rose-700 dark:text-rose-300",
      )} />
      <GripIcon className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 stroke-[1.7] opacity-0 transition-[opacity,transform] duration-100 group-hover:opacity-70 group-focus-visible:opacity-70" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.label}</span>
      {item.meta && <span className={cn(
        "shrink-0 text-2xs tabular-nums",
        item.tone === "income" ? "text-emerald-700 dark:text-emerald-300" : item.tone === "expense" ? "text-rose-700 dark:text-rose-300" : "text-text-muted",
      )}>{item.meta}</span>}
    </button>
  );
}

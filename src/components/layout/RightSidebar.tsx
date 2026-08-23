import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as ContextMenu from "@radix-ui/react-context-menu";
import type { Note, NoteMetadata } from "../../types/note";
import { cn, cleanTitle } from "../../lib/utils";
import { CheckmarkIcon, IconButton, PanelToggleIcon } from "../ui";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  ExportIcon,
  OutlineIcon,
  SettingsIcon,
} from "../icons/velocity";
import { RightSidebarResizeHandle } from "./RightSidebarResizeHandle";
import { WindowControls } from "./WindowControls";


export type RightPanelId = "outline" | "calendar" | "export" | "settings";

interface PanelDefinition {
  id: RightPanelId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const PANELS: PanelDefinition[] = [
  { id: "outline", label: "Outline", icon: OutlineIcon },
  { id: "calendar", label: "Calendar", icon: CalendarIcon },
  { id: "export", label: "Export", icon: ExportIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];
const PANEL_BY_ID = new Map(PANELS.map((panel) => [panel.id, panel]));
const DEFAULT_ORDER = PANELS.map((panel) => panel.id);
const ORDER_KEY = "spell:right-sidebar-order";
const ENABLED_KEY = "spell:right-sidebar-enabled";

function loadOrder(): RightPanelId[] {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]") as string[];
    const valid = saved.filter((id): id is RightPanelId =>
      DEFAULT_ORDER.includes(id as RightPanelId),
    );
    return [...valid, ...DEFAULT_ORDER.filter((id) => !valid.includes(id))];
  } catch {
    return DEFAULT_ORDER;
  }
}

function loadEnabled(): RightPanelId[] {
  try {
    const saved = JSON.parse(localStorage.getItem(ENABLED_KEY) || "null") as
      | string[]
      | null;
    if (!saved) return DEFAULT_ORDER;
    return saved.filter((id): id is RightPanelId =>
      DEFAULT_ORDER.includes(id as RightPanelId),
    );
  } catch {
    return DEFAULT_ORDER;
  }
}

interface RightSidebarProps {
  width: number;
  fluid?: boolean;
  resizable?: boolean;
  initialPanel?: Exclude<RightPanelId, "settings">;
  activePanel?: Exclude<RightPanelId, "settings">;
  chrome?: boolean;
  mobile?: boolean;
  showWindowControls?: boolean;
  currentNote: Note | null;
  notes: NoteMetadata[];
  onWidthChange: (width: number) => void;
  onClose: () => void;
  showCloseButton?: boolean;
  onSelectNote: (id: string) => void;
  onOpenHeading: (text: string, occurrence: number) => void;
  onOpenSettings: () => void;
}

export function RightSidebar({
  width,
  fluid = false,
  resizable = true,
  initialPanel = "outline",
  activePanel,
  chrome = true,
  mobile = false,
  showWindowControls = false,
  currentNote,
  notes,
  onWidthChange,
  onClose,
  showCloseButton = true,
  onSelectNote,
  onOpenHeading,
  onOpenSettings,
}: RightSidebarProps) {
  const [order, setOrder] = useState<RightPanelId[]>(loadOrder);
  const [enabled, setEnabled] = useState<RightPanelId[]>(() =>
    mobile ? DEFAULT_ORDER : loadEnabled(),
  );
  const [active, setActive] = useState<RightPanelId>(() => {
    const available = mobile ? DEFAULT_ORDER : loadEnabled();
    return available.includes(initialPanel)
      ? initialPanel
      : available.find((id) => id !== "settings") ?? "outline";
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const enabledSet = useMemo(() => new Set(enabled), [enabled]);
  const visiblePanels = useMemo(
    () => order.filter((id) => enabledSet.has(id)),
    [enabledSet, order],
  );
  const shownPanel = activePanel ?? active;
  useEffect(() => {
    if (!enabled.includes(active)) {
      setActive(enabled.find((id) => id !== "settings") ?? "outline");
    }
  }, [active, enabled]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const next = arrayMove(
      order,
      order.indexOf(dragged.id as RightPanelId),
      order.indexOf(over.id as RightPanelId),
    );
    setOrder(next);
    localStorage.setItem(ORDER_KEY, JSON.stringify(next));
  }, [order]);

  const selectPanel = useCallback(
    (id: RightPanelId) => {
      if (id === "settings") {
        onOpenSettings();
      } else {
        setActive(id);
      }
    },
    [onOpenSettings],
  );

  const togglePanel = useCallback((id: RightPanelId) => {
    if (
      id !== "settings" &&
      enabled.includes(id) &&
      enabled.filter((item) => item !== "settings" && item !== id).length === 0
    ) {
      return;
    }
    const next = enabled.includes(id)
      ? enabled.filter((item) => item !== id)
      : [...enabled, id];
    setEnabled(next);
    localStorage.setItem(ENABLED_KEY, JSON.stringify(next));
  }, [enabled]);

  const resetLayout = useCallback(() => {
    setOrder(DEFAULT_ORDER);
    setEnabled(DEFAULT_ORDER);
    setActive("outline");
    localStorage.removeItem(ORDER_KEY);
    localStorage.removeItem(ENABLED_KEY);
  }, []);

  return (
    <aside
      className="app-sidebar-surface relative h-full shrink-0 border-l border-border text-text select-none"
      style={{ width: fluid ? "100%" : width }}
      data-mobile={mobile || undefined}
      aria-label="Right sidebar"
    >
      {resizable && <RightSidebarResizeHandle width={width} onWidthChange={onWidthChange} />}
      <div className="flex h-full flex-col overflow-hidden">
        {chrome && <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <div
              className={cn(
                "app-chrome flex shrink-0 items-center gap-px",
                mobile ? "h-14 px-2" : "h-11 px-1.5",
              )}
            >
              {showCloseButton && (
                <div>
                  <IconButton
                    onClick={onClose}
                    aria-label="Close right sidebar"
                    className={mobile ? "!h-11 !w-11 rounded-xl" : undefined}
                  >
                    <PanelToggleIcon side="right" open />
                  </IconButton>
                </div>
              )}

              <DndContext sensors={mobile ? undefined : sensors} onDragEnd={handleDragEnd}>
                <SortableContext items={visiblePanels} strategy={horizontalListSortingStrategy}>
                  <div className="flex min-w-0 flex-1 items-center gap-px">
                    {visiblePanels.map((id) => {
                      const panel = PANEL_BY_ID.get(id);
                      if (!panel) return null;
                      return (
                        <SortablePanelButton
                          key={id}
                          panel={panel}
                          active={id !== "settings" && active === id}
                          mobile={mobile}
                          onSelect={selectPanel}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content data-spell-context-menu className="spell-menu z-[1000] min-w-48">
              {PANELS.map((panel) => (
                <ContextMenu.CheckboxItem
                  key={panel.id}
                  checked={enabled.includes(panel.id)}
                  className="spell-menu-item cursor-pointer"
                  onCheckedChange={() => togglePanel(panel.id)}
                  onSelect={(event) => event.preventDefault()}
                >
                  <CheckmarkIcon
                    checked={enabled.includes(panel.id)}
                    className="h-4 w-4 stroke-[1.9]"
                  />
                  {panel.label}
                </ContextMenu.CheckboxItem>
              ))}
              <ContextMenu.Separator className="spell-menu-separator" />
              <ContextMenu.Item
                className="spell-menu-item cursor-pointer"
                onSelect={resetLayout}
              >
                Reset panel layout
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>}

        {!chrome && showWindowControls && (
          <div
            className="flex h-11 shrink-0 items-center justify-end px-1.5"
            data-tauri-drag-region
          >
            <WindowControls />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {shownPanel === "outline" && (
            <OutlinePanel note={currentNote} onOpenHeading={onOpenHeading} />
          )}
          {shownPanel === "calendar" && (
            <CalendarPanel notes={notes} onSelectNote={onSelectNote} />
          )}
          {shownPanel === "export" && <ExportPanel disabled={!currentNote} />}
        </div>
      </div>
    </aside>
  );
}

function SortablePanelButton({
  panel,
  active,
  mobile = false,
  onSelect,
}: {
  panel: PanelDefinition;
  active: boolean;
  mobile?: boolean;
  onSelect: (id: RightPanelId) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: panel.id });
  const Icon = panel.icon;
  return (
    <IconButton
      ref={setNodeRef}
      size={mobile ? "xl" : "md"}
      title={panel.label}
      className={cn(
        mobile ? "rounded-xl" : "cursor-grab rounded-lg active:cursor-grabbing",
        active && "bg-bg-selected text-text hover:bg-bg-selected",
        isDragging && "z-50 opacity-70 shadow-lg",
      )}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => onSelect(panel.id)}
      {...attributes}
      {...listeners}
    >
      <Icon />
    </IconButton>
  );
}

interface HeadingItem {
  level: number;
  text: string;
  occurrence: number;
}

function OutlinePanel({
  note,
  onOpenHeading,
}: {
  note: Note | null;
  onOpenHeading: (text: string, occurrence: number) => void;
}) {
  const headings = useMemo<HeadingItem[]>(() => {
    if (!note) return [];
    const counts = new Map<string, number>();
    return note.content.split("\n").flatMap((line) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (!match) return [];
      const text = match[2].replace(/\s+#+$/, "").trim();
      const occurrence = counts.get(text) ?? 0;
      counts.set(text, occurrence + 1);
      return [{ level: match[1].length, text, occurrence }];
    });
  }, [note]);

  return (
    <PanelSection>
      {!note ? (
        <EmptyState>No note selected</EmptyState>
      ) : headings.length === 0 ? (
        <EmptyState>No headings in this note</EmptyState>
      ) : (
        <div className="space-y-0.5">
          {headings.map((heading, index) => (
            <button
              key={`${heading.text}-${heading.occurrence}-${index}`}
              type="button"
              className="nav-item-surface motion-interactive block w-full truncate rounded-md py-1 pr-2 text-left text-[11px] text-text-muted hover:bg-bg-muted hover:text-text"
              style={{ paddingLeft: `${8 + (heading.level - 1) * 12}px` }}
              onClick={() => onOpenHeading(heading.text, heading.occurrence)}
            >
              {heading.text}
            </button>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

function CalendarPanel({
  notes,
  onSelectNote,
}: {
  notes: NoteMetadata[];
  onSelectNote: (id: string) => void;
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => new Date());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const today = new Date();
  const firstDay = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const noteDays = useMemo(() => {
    const result = new Set<number>();
    for (const note of notes) {
      const date = new Date(note.modified * 1000);
      if (date.getFullYear() === year && date.getMonth() === monthIndex) {
        result.add(date.getDate());
      }
    }
    return result;
  }, [monthIndex, notes, year]);
  const selectedNotes = useMemo(
    () =>
      notes.filter((note) => {
        const date = new Date(note.modified * 1000);
        return (
          date.getFullYear() === selected.getFullYear() &&
          date.getMonth() === selected.getMonth() &&
          date.getDate() === selected.getDate()
        );
      }),
    [notes, selected],
  );

  return (
    <PanelSection>
      <div className="mb-3 grid grid-cols-[1.75rem_1fr_1.75rem] items-center">
        <IconButton
          size="xs"
          aria-label="Previous month"
          onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
        >
          <ChevronLeftIcon className="h-3.5 w-3.5 stroke-[1.6]" />
        </IconButton>
        <div className="text-center text-xs font-medium tracking-[-0.01em] text-text">
          {month.toLocaleDateString([], { month: "long", year: "numeric" })}
        </div>
        <IconButton
          size="xs"
          aria-label="Next month"
          className="justify-self-end"
          onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
        >
          <ChevronRightIcon className="h-3.5 w-3.5 stroke-[1.6]" />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
          <div
            key={`${day}-${index}`}
            className="h-5 text-2xs font-medium uppercase leading-5 text-text-muted/80"
          >
            {day}
          </div>
        ))}
        {Array.from({ length: firstDay }, (_, index) => <div key={`blank-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const isSelected =
            selected.getFullYear() === year &&
            selected.getMonth() === monthIndex &&
            selected.getDate() === day;
          const isToday =
            today.getFullYear() === year &&
            today.getMonth() === monthIndex &&
            today.getDate() === day;
          return (
            <button
              key={day}
              type="button"
              className={cn(
                "relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-2xs text-text-muted transition-[background-color,color,box-shadow] duration-150 hover:bg-bg-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                isToday && !isSelected && "font-semibold text-accent shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_42%,transparent)]",
                isSelected && "bg-accent font-semibold text-text-inverse shadow-[0_1px_2px_color-mix(in_srgb,var(--color-accent)_32%,transparent)]",
              )}
              onClick={() => setSelected(new Date(year, monthIndex, day))}
            >
              {day}
              {noteDays.has(day) && (
                <span className={cn(
                  "absolute bottom-0.75 h-0.75 w-0.75 rounded-full bg-accent",
                  isSelected && "bg-text-inverse/75",
                )} />
              )}
            </button>
          );
        })}
      </div>
      <div className="my-4 h-px bg-border" />
      <div className="mb-2 px-1 text-2xs font-medium uppercase tracking-[0.08em] text-text-muted">
        {selected.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
      </div>
      {selectedNotes.length === 0 ? (
        <EmptyState>No notes changed on this day</EmptyState>
      ) : (
        <div className="space-y-1">
          {selectedNotes.map((note) => (
            <button
              key={note.id}
              type="button"
              className="block w-full truncate rounded-md px-2.5 py-1.5 text-left text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              onClick={() => onSelectNote(note.id)}
            >
              {cleanTitle(note.title)}
            </button>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

function ExportPanel({ disabled }: { disabled: boolean }) {
  const actions = [
    { label: "Copy Markdown", icon: CopyIcon, event: "export-copy-markdown" },
    { label: "Copy Plain Text", icon: CopyIcon, event: "export-copy-text" },
    { label: "Copy HTML", icon: CopyIcon, event: "export-copy-html" },
    { label: "Export Markdown", icon: DownloadIcon, event: "export-markdown" },
    { label: "Print as PDF", icon: DownloadIcon, event: "export-pdf" },
  ];
  return (
    <PanelSection>
      <div className="space-y-0.5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.event}
              type="button"
              disabled={disabled}
              className="motion-interactive flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => window.dispatchEvent(new CustomEvent(action.event))}
            >
              <Icon className="h-3.5 w-3.5 stroke-[1.6] text-text-muted" />
              {action.label}
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}

function PanelSection({ children }: { children: ReactNode }) {
  return (
    <section className="px-3 py-3.5">{children}</section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-2 py-3 text-center text-[11px] text-text-muted">{children}</div>;
}

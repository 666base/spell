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
  const [enabled, setEnabled] = useState<RightPanelId[]>(loadEnabled);
  const [active, setActive] = useState<RightPanelId>(
    () => loadEnabled().find((id) => id !== "settings") ?? "outline",
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const visiblePanels = useMemo(
    () => order.filter((id) => enabled.includes(id)),
    [enabled, order],
  );
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
      className="relative h-full shrink-0 border-l border-border bg-bg-secondary text-text select-none"
      style={{ width }}
      aria-label="Right sidebar"
    >
      <RightSidebarResizeHandle width={width} onWidthChange={onWidthChange} />
      <div className="flex h-full flex-col overflow-hidden">
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <div
              className="flex h-10 shrink-0 items-center gap-px border-b border-border bg-bg-secondary px-1.5"
            >
              {showCloseButton && (
                <div>
                  <IconButton onClick={onClose} aria-label="Close right sidebar">
                    <PanelToggleIcon side="right" open />
                  </IconButton>
                </div>
              )}

              <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                <SortableContext items={visiblePanels} strategy={horizontalListSortingStrategy}>
                  <div className="flex min-w-0 flex-1 items-center gap-px">
                    {visiblePanels.map((id) => {
                      const panel = PANELS.find((item) => item.id === id)!;
                      return (
                        <SortablePanelButton
                          key={id}
                          panel={panel}
                          active={id !== "settings" && active === id}
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
        </ContextMenu.Root>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {active === "outline" && (
            <OutlinePanel note={currentNote} onOpenHeading={onOpenHeading} />
          )}
          {active === "calendar" && (
            <CalendarPanel notes={notes} onSelectNote={onSelectNote} />
          )}
          {active === "export" && <ExportPanel disabled={!currentNote} />}
        </div>
      </div>
    </aside>
  );
}

function SortablePanelButton({
  panel,
  active,
  onSelect,
}: {
  panel: PanelDefinition;
  active: boolean;
  onSelect: (id: RightPanelId) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: panel.id });
  const Icon = panel.icon;
  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={panel.label}
      className={cn(
        "motion-interactive flex shrink-0 cursor-grab items-center justify-center text-text-muted hover:bg-bg-emphasis hover:text-text active:cursor-grabbing",
        "h-7 w-7 rounded-md",
        active && "bg-bg-emphasis text-text",
        isDragging && "z-50 opacity-70 shadow-lg",
      )}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => onSelect(panel.id)}
      {...attributes}
      {...listeners}
      aria-pressed={active}
    >
      <Icon className="h-3.5 w-3.5 stroke-[1.55]" />
    </button>
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
    <PanelSection title="Outline">
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
              className="motion-interactive block w-full truncate rounded-md py-1 pr-2 text-left text-[11px] text-text-muted hover:bg-bg-muted hover:text-text"
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
    <PanelSection title="Calendar">
      <div className="mb-2.5 flex items-center justify-between">
        <IconButton
          size="xs"
          onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
        </IconButton>
        <div className="text-[11px] font-medium">
          {month.toLocaleDateString([], { month: "long", year: "numeric" })}
        </div>
        <IconButton
          size="xs"
          onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
        >
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
          <div key={`${day}-${index}`} className="py-1 text-text-muted">{day}</div>
        ))}
        {Array.from({ length: firstDay }, (_, index) => <div key={`blank-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const isSelected =
            selected.getFullYear() === year &&
            selected.getMonth() === monthIndex &&
            selected.getDate() === day;
          return (
            <button
              key={day}
              type="button"
              className={cn(
                "relative aspect-square rounded-md text-[11px] hover:bg-bg-emphasis",
                isSelected && "bg-bg-emphasis text-text",
              )}
              onClick={() => setSelected(new Date(year, monthIndex, day))}
            >
              {day}
              {noteDays.has(day) && (
                <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-text-muted" />
              )}
            </button>
          );
        })}
      </div>
      <div className="my-2.5 h-px bg-border" />
      <div className="mb-1 text-[11px] font-medium text-text-muted">
        {selected.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
      </div>
      {selectedNotes.length === 0 ? (
        <EmptyState>No notes changed on this day</EmptyState>
      ) : (
        <div className="space-y-0.5">
          {selectedNotes.map((note) => (
            <button
              key={note.id}
              type="button"
              className="motion-interactive block w-full truncate rounded-md px-2 py-1 text-left text-[11px] hover:bg-bg-muted"
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
    <PanelSection title="Export">
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

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-2.5 py-3">
      <h2 className="mb-1.5 px-1 text-2xs font-semibold uppercase tracking-[0.08em] text-text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-2 py-3 text-center text-[11px] text-text-muted">{children}</div>;
}

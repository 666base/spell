import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { addDays, addMonths, format, startOfMonth, startOfWeek } from "date-fns";
import { cn } from "../../lib/utils";
import { isMobileApp } from "../../lib/platform";
import { isMonthKey } from "../../lib/finance";
import { isSameLocalDay, startOfLocalDay } from "../../lib/journal";
import { PANEL_TRANSITION_MS } from "../../lib/presence";

const WEEK_STARTS_ON = 1 as const;

function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function parseIsoDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.valueOf()) ? null : date;
}

function parseMonthDate(value: string): Date | null {
  if (!isMonthKey(value)) return null;
  const date = new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function monthWeeks(month: Date): Date[][] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON });
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)),
  );
}

function weekdayLabels(): string[] {
  const start = startOfWeek(new Date(2024, 0, 1), { weekStartsOn: WEEK_STARTS_ON });
  return Array.from({ length: 7 }, (_, index) => format(addDays(start, index), "EEEEE"));
}

function formatDateLabel(value: string): string {
  const date = parseIsoDate(value);
  if (!date) return "Date";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export type CalendarAnchor = {
  getBoundingClientRect: () => DOMRect;
} | null;

const POPOVER_GAP = 6;
const POPOVER_PAD = 8;

function placeAround(anchor: DOMRect, width: number, height: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = anchor.left;
  if (left + width > vw - POPOVER_PAD) left = vw - POPOVER_PAD - width;
  if (left < POPOVER_PAD) left = POPOVER_PAD;

  const below = anchor.bottom + POPOVER_GAP;
  const above = anchor.top - POPOVER_GAP - height;
  let top = below;
  if (below + height > vh - POPOVER_PAD && above >= POPOVER_PAD) {
    top = above;
  } else if (below + height > vh - POPOVER_PAD) {
    top = Math.max(POPOVER_PAD, vh - POPOVER_PAD - height);
  }
  return { top, left };
}

function resolveAnchorRect(anchor?: CalendarAnchor): DOMRect {
  const fromProp = anchor?.getBoundingClientRect();
  if (fromProp && (fromProp.width > 0 || fromProp.height > 0 || fromProp.top > 0 || fromProp.left > 0)) {
    return fromProp;
  }
  const fallback = document.querySelector("[data-add-month]");
  if (fallback instanceof HTMLElement) return fallback.getBoundingClientRect();
  return new DOMRect(POPOVER_PAD, 72, 0, 0);
}

function closeDelay() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : PANEL_TRANSITION_MS;
}

interface CalendarLayerProps {
  children: ReactNode;
  onClose: () => void;
  anchor?: CalendarAnchor;
  open?: boolean;
}

function CalendarLayer({ children, onClose, anchor, open = true }: CalendarLayerProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const sheet = isMobileApp;
  const [present, setPresent] = useState(open);
  const [shown, setShown] = useState(false);
  const [pos, setPos] = useState(() => (
    sheet ? null : placeAround(resolveAnchorRect(anchor), 344, 320)
  ));

  useEffect(() => {
    if (open) {
      setPresent(true);
      const frame = window.requestAnimationFrame(() => setShown(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setShown(false);
    const timeout = window.setTimeout(() => setPresent(false), closeDelay());
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!present) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, present]);

  useLayoutEffect(() => {
    if (sheet || !present) return;
    const popover = popoverRef.current;
    if (!popover) return;

    const update = () => {
      const size = popover.getBoundingClientRect();
      setPos(placeAround(resolveAnchorRect(anchor), size.width || 344, size.height || 320));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [anchor, present, sheet]);

  if (!present) return null;

  return createPortal(
    <div
      className={cn("spell-calendar-layer", sheet && "spell-calendar-layer--sheet mobile-drawer-layer")}
      data-open={shown ? "true" : "false"}
      onPointerDown={onClose}
    >
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        className={cn("spell-calendar-popover", sheet ? "mobile-drawer" : "spell-popover")}
        data-open={shown ? "true" : "false"}
        style={sheet || !pos ? undefined : { top: pos.top, left: pos.left }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function DateGrid({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (next: string) => void;
}) {
  const parsed = parseIsoDate(value);
  const today = startOfLocalDay();
  const selected = parsed ?? today;
  const [cursor, setCursor] = useState(startOfMonth(selected));
  const weekdays = useMemo(() => weekdayLabels(), []);
  const weeks = useMemo(() => monthWeeks(cursor), [cursor]);

  useEffect(() => {
    setCursor(startOfMonth(selected));
  }, [selected.getFullYear(), selected.getMonth()]);

  return (
    <div className="spell-calendar">
      <div className="spell-calendar-toolbar">
        <button type="button" className="spell-calendar-nav" onClick={() => setCursor((current) => addMonths(current, -1))} aria-label="Previous month">
          ‹
        </button>
        <span className="spell-calendar-title">{format(cursor, "LLLL yyyy")}</span>
        <button type="button" className="spell-calendar-nav" onClick={() => setCursor((current) => addMonths(current, 1))} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="journal-calendar-weekdays">
        {weekdays.map((label, index) => (
          <div key={`${label}-${index}`} className="journal-calendar-weekday">
            {label}
          </div>
        ))}
      </div>
      <div className="journal-calendar-month-grid">
        {weeks.map((row) => (
          <div key={dateKey(row[0])} className="journal-calendar-week">
            {row.map((date) => {
              const isToday = isSameLocalDay(date, today);
              const isSelected = parsed ? isSameLocalDay(date, parsed) : false;
              return (
                <button
                  key={dateKey(date)}
                  type="button"
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={isSelected}
                  className={cn(
                    "journal-calendar-day",
                    isToday && "is-today",
                    isSelected && "is-selected",
                    date.getMonth() !== cursor.getMonth() && "is-outside",
                  )}
                  onClick={() => onSelect(dateKey(date))}
                >
                  <span>{date.getDate()}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (next: string) => void;
}) {
  const selected = parseMonthDate(value) ?? startOfMonth(startOfLocalDay());
  const [year, setYear] = useState(selected.getFullYear());

  useEffect(() => {
    setYear(selected.getFullYear());
  }, [selected.getFullYear()]);

  return (
    <div className="spell-calendar">
      <div className="spell-calendar-toolbar">
        <button type="button" className="spell-calendar-nav" onClick={() => setYear((current) => current - 1)} aria-label="Previous year">
          ‹
        </button>
        <span className="spell-calendar-title">{year}</span>
        <button type="button" className="spell-calendar-nav" onClick={() => setYear((current) => current + 1)} aria-label="Next year">
          ›
        </button>
      </div>
      <div className="spell-calendar-months">
        {Array.from({ length: 12 }, (_, month) => {
          const key = `${year}-${String(month + 1).padStart(2, "0")}`;
          const selectedMonth = value === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selectedMonth}
              className={cn("spell-calendar-month", selectedMonth && "is-selected")}
              onClick={() => onSelect(key)}
            >
              {format(new Date(year, month, 1), "LLL")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SpellDateField({
  value,
  onChange,
  className,
  "aria-label": ariaLabel = "Date",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-open={open ? "true" : "false"}
        onClick={() => setOpen(true)}
        className={cn(
          "app-control spell-select-trigger flex h-9 w-full items-center rounded-lg border border-border bg-bg px-3 text-left text-sm text-text shadow-[var(--shadow-control)]",
          !value && "text-text-muted",
          className,
        )}
      >
        {value ? formatDateLabel(value) : "Choose date"}
      </button>
      <CalendarLayer open={open} anchor={triggerRef.current} onClose={() => setOpen(false)}>
          <DateGrid
            value={value}
            onSelect={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
        </CalendarLayer>
    </>
  );
}

export function SpellMonthPicker({
  open,
  value,
  onSelect,
  onClose,
  anchor,
}: {
  open: boolean;
  value?: string;
  onSelect: (month: string) => void;
  onClose: () => void;
  anchor?: CalendarAnchor;
}) {
  return (
    <CalendarLayer open={open} anchor={anchor} onClose={onClose}>
      <MonthGrid
        value={value ?? ""}
        onSelect={(next) => {
          onSelect(next);
          onClose();
        }}
      />
    </CalendarLayer>
  );
}

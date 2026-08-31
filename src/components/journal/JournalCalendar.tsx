import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { addDays, addMonths, addWeeks, format, startOfMonth, startOfWeek } from "date-fns";
import { bg } from "date-fns/locale";
import { cn } from "../../lib/utils";
import { MOTION_PANEL_MS } from "../../lib/motion";
import { isSameLocalDay, startOfLocalDay } from "../../lib/journal";

export type JournalCalendarMode = "week" | "month";

interface JournalCalendarProps {
  selected: Date;
  journalDates: Set<string>;
  onSelectDate: (date: Date) => void;
  defaultMode?: JournalCalendarMode;
  mode?: JournalCalendarMode;
  onModeChange?: (mode: JournalCalendarMode) => void;
}

const WEEK_STARTS_ON = 1 as const;
const SETTLE_MS = MOTION_PANEL_MS;

function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function weekStart(date: Date): Date {
  return startOfWeek(startOfLocalDay(date), { weekStartsOn: WEEK_STARTS_ON });
}

function daysOfWeek(anchor: Date): Date[] {
  const start = weekStart(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function monthWeeks(month: Date): Date[][] {
  const start = weekStart(startOfMonth(month));
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)),
  );
}

function selectedWeekIndex(selected: Date, month: Date): number {
  const weeks = monthWeeks(month);
  const index = weeks.findIndex((row) => row.some((date) => isSameLocalDay(date, selected)));
  return index < 0 ? 0 : index;
}

function reducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function DayCell({
  date,
  selected,
  today,
  outside,
  journalDates,
  onSelectDate,
  skipClick,
}: {
  date: Date;
  selected: Date;
  today: Date;
  outside?: boolean;
  journalDates: Set<string>;
  onSelectDate: (date: Date) => void;
  skipClick: RefObject<boolean>;
}) {
  const key = dateKey(date);
  const isToday = isSameLocalDay(date, today);
  const isSelected = isSameLocalDay(date, selected);

  return (
    <button
      type="button"
      aria-current={isToday ? "date" : undefined}
      aria-pressed={isSelected}
      className={cn(
        "journal-calendar-day",
        isToday && "is-today",
        isSelected && "is-selected",
        outside && "is-outside",
        journalDates.has(key) && "has-journal",
      )}
      onClick={() => {
        if (skipClick.current) return;
        onSelectDate(date);
      }}
    >
      <span>{date.getDate()}</span>
      {journalDates.has(key) && <i />}
    </button>
  );
}

function DateGrid({
  mode,
  cursor,
  selected,
  today,
  journalDates,
  onSelectDate,
  skipClick,
}: {
  mode: "week" | "month";
  cursor: Date;
  selected: Date;
  today: Date;
  journalDates: Set<string>;
  onSelectDate: (date: Date) => void;
  skipClick: RefObject<boolean>;
}) {
  if (mode === "week") {
    return (
      <div className="journal-calendar-week">
        {daysOfWeek(cursor).map((date) => (
          <DayCell
            key={dateKey(date)}
            date={date}
            selected={selected}
            today={today}
            journalDates={journalDates}
            onSelectDate={onSelectDate}
            skipClick={skipClick}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="journal-calendar-month-grid">
      {monthWeeks(cursor).map((row) => (
        <div key={dateKey(row[0])} className="journal-calendar-week">
          {row.map((date) => (
            <DayCell
              key={dateKey(date)}
              date={date}
              selected={selected}
              today={today}
              outside={date.getMonth() !== cursor.getMonth()}
              journalDates={journalDates}
              onSelectDate={onSelectDate}
              skipClick={skipClick}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function JournalCalendar({
  selected,
  journalDates,
  onSelectDate,
  defaultMode = "week",
  mode: modeProp,
  onModeChange,
}: JournalCalendarProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const skipClick = useRef(false);
  const widthRef = useRef(0);
  const modeRef = useRef<JournalCalendarMode>("week");
  const selectedRef = useRef(selected);
  const onSelectDateRef = useRef(onSelectDate);
  const setModeRef = useRef<(next: JournalCalendarMode) => void>(() => {});
  const dragRef = useRef<{
    id: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    t: number;
    axis: "h" | "v" | null;
  } | null>(null);
  const today = startOfLocalDay();
  const [internalMode, setInternalMode] = useState<JournalCalendarMode>(defaultMode);
  const mode = modeProp ?? internalMode;
  const [fill, setFill] = useState<JournalCalendarMode>(mode);
  const setMode = (next: JournalCalendarMode) => {
    if (modeProp === undefined) setInternalMode(next);
    onModeChange?.(next);
  };
  modeRef.current = mode;
  selectedRef.current = selected;
  onSelectDateRef.current = onSelectDate;
  setModeRef.current = setMode;

  useEffect(() => {
    if (mode === "month") {
      setFill("month");
      return;
    }
    const timeout = window.setTimeout(
      () => setFill("week"),
      reducedMotion() ? 0 : SETTLE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [mode]);

  useEffect(() => {
    if (mode !== "month") return;
    const root = viewportRef.current;
    if (!root) return;
    const page = root.closest("[data-journal-page]");
    const scroller =
      (page?.querySelector("[data-editor-scroll]") as HTMLElement | null) ??
      root.closest("[data-editor-scroll], .journal-empty");
    if (!scroller) return;

    let origin = scroller.scrollTop;
    let armed = false;
    const arm = window.setTimeout(() => {
      origin = scroller.scrollTop;
      armed = true;
    }, 400);

    const onScroll = () => {
      if (!armed) return;
      if (scroller.scrollTop - origin >= 30) setModeRef.current("week");
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(arm);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [mode]);

  const setX = (x: number, animate: boolean) => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.style.transition =
      animate && !reducedMotion() ? `transform ${SETTLE_MS}ms var(--ease-drawer)` : "none";
    strip.style.transform = `translate3d(${x}px, 0, 0)`;
  };

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const sync = () => {
      const width = viewport.clientWidth;
      widthRef.current = width;
      stripRef.current?.style.setProperty("--journal-cal-width", `${width}px`);
      if (!dragRef.current) setX(-width, false);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [selected, mode]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (drag.axis === "h") {
        drag.dx = dx;
        skipClick.current = true;
        if (event.cancelable) event.preventDefault();
        setX(-widthRef.current + dx, false);
        return;
      }
      drag.dy = dy;
    };

    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.id) return;
      dragRef.current = null;
      const width = widthRef.current;

      if (drag.axis === "v") {
        if (Math.abs(drag.dy) > 36) setModeRef.current(drag.dy > 0 ? "month" : "week");
        skipClick.current = false;
        return;
      }

      if (drag.axis !== "h") {
        skipClick.current = false;
        return;
      }

      const velocity = drag.dx / Math.max(16, event.timeStamp - drag.t);
      const go = Math.abs(drag.dx) > width * 0.18 || Math.abs(velocity) > 0.45;
      if (!go) {
        setX(-width, true);
        window.setTimeout(() => {
          skipClick.current = false;
        }, 0);
        return;
      }

      const dir = drag.dx < 0 ? 1 : -1;
      const target = dir === 1 ? -2 * width : 0;
      const strip = stripRef.current;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        strip?.removeEventListener("transitionend", onEnd);
        const current = selectedRef.current;
        const next =
          modeRef.current === "week" ? addWeeks(current, dir) : addMonths(current, dir);
        onSelectDateRef.current(startOfLocalDay(next));
        skipClick.current = false;
      };
      const onEnd = (endEvent: TransitionEvent) => {
        if (endEvent.propertyName !== "transform") return;
        finish();
      };

      if (reducedMotion()) {
        finish();
        return;
      }
      strip?.addEventListener("transitionend", onEnd);
      setX(target, true);
      window.setTimeout(finish, SETTLE_MS + 60);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const weekdays = useMemo(
    () => daysOfWeek(new Date(2024, 0, 1)).map((day) => format(day, "EEEEE", { locale: bg })),
    [],
  );
  const shiftSelected = (dir: -1 | 0 | 1) =>
    dir === 0
      ? selected
      : mode === "week"
        ? addWeeks(selected, dir)
        : addMonths(selected, dir);

  const pinRow =
    mode === "week" && fill === "month"
      ? selectedWeekIndex(selected, startOfMonth(selected))
      : 0;

  return (
    <div
      className="journal-calendar"
      data-mode={mode}
      data-pager-ignore
      style={{ "--pin-row": pinRow } as CSSProperties}
    >
      <div className="journal-calendar-weekdays">
        {weekdays.map((label, index) => (
          <div key={`${label}-${index}`} className="journal-calendar-weekday">
            {label}
          </div>
        ))}
      </div>

      <div
        ref={viewportRef}
        className="journal-calendar-viewport"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
          dragRef.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            dx: 0,
            dy: 0,
            t: event.timeStamp,
            axis: null,
          };
        }}
      >
        <div ref={stripRef} className="journal-calendar-strip">
          {([-1, 0, 1] as const).map((dir) => (
            <div key={dir} className="journal-calendar-panel">
              <DateGrid
                mode={fill}
                cursor={shiftSelected(dir)}
                selected={selected}
                today={today}
                journalDates={journalDates}
                onSelectDate={onSelectDate}
                skipClick={skipClick}
              />
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, addWeeks, format, startOfMonth, startOfWeek } from "date-fns";
import { bg } from "date-fns/locale";
import { cn } from "../../lib/utils";
import { isSameLocalDay, startOfLocalDay } from "../../lib/journal";
import { isMobileApp } from "../../lib/platform";

interface JournalCalendarProps {
  selected: Date;
  journalDates: Set<string>;
  onSelectDate: (date: Date) => void;
}

const WEEK_STARTS_ON = 1 as const;

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

function DayCell({
  date,
  selected,
  today,
  outside,
  journalDates,
  onSelectDate,
}: {
  date: Date;
  selected: Date;
  today: Date;
  outside?: boolean;
  journalDates: Set<string>;
  onSelectDate: (date: Date) => void;
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
      onClick={() => onSelectDate(date)}
    >
      <span>{date.getDate()}</span>
      {journalDates.has(key) && <i />}
    </button>
  );
}

export function JournalCalendar({
  selected,
  journalDates,
  onSelectDate,
}: JournalCalendarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const today = startOfLocalDay();
  const [mode, setMode] = useState<"week" | "month">("week");
  const [cursor, setCursor] = useState(selected);

  useEffect(() => {
    setCursor(selected);
  }, [selected]);

  useEffect(() => {
    if (mode !== "month") return;
    const root = rootRef.current;
    if (!root) return;
    const host = root.closest(".flex-1") ?? document;
    const scroller = host.querySelector("[data-editor-scroll], .journal-empty");
    if (!scroller) return;

    let origin = scroller.scrollTop;
    let armed = false;
    const arm = window.setTimeout(() => {
      origin = scroller.scrollTop;
      armed = true;
    }, 400);

    const onScroll = () => {
      if (!armed) return;
      if (scroller.scrollTop - origin >= 30) setMode("week");
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(arm);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [mode]);

  const weekdays = useMemo(
    () => daysOfWeek(new Date(2024, 0, 1)).map((day) => format(day, "EEEEE", { locale: bg })),
    [],
  );
  const week = useMemo(() => daysOfWeek(cursor), [cursor]);
  const weeks = useMemo(() => monthWeeks(cursor), [cursor]);
  const showingCurrent =
    mode === "week"
      ? week.some((day) => isSameLocalDay(day, today))
      : cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth();

  const goPrev = () => {
    const next = mode === "week" ? addWeeks(selected, -1) : addMonths(selected, -1);
    onSelectDate(startOfLocalDay(next));
  };

  const goNext = () => {
    const next = mode === "week" ? addWeeks(selected, 1) : addMonths(selected, 1);
    onSelectDate(startOfLocalDay(next));
  };

  const toggleMode = () => {
    setMode((current) => (current === "week" ? "month" : "week"));
  };

  return (
    <div ref={rootRef} className="journal-calendar" data-mode={mode}>
      {!isMobileApp && (
        <div className="journal-calendar-toolbar">
          <button
            type="button"
            className="journal-calendar-month-label"
            onClick={toggleMode}
          >
            {format(cursor, "LLLL yyyy", { locale: bg })}
          </button>
          {!showingCurrent && (
            <button
              type="button"
              className="journal-calendar-today"
              onClick={() => onSelectDate(today)}
            >
              Today
            </button>
          )}
        </div>
      )}

      <div className="journal-calendar-weekdays">
        {weekdays.map((label, index) => (
          <div key={`${label}-${index}`} className="journal-calendar-weekday">
            {label}
          </div>
        ))}
      </div>

      <div
        className="journal-calendar-viewport"
        onPointerDown={(event) => {
          event.stopPropagation();
          swipeRef.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipeRef.current;
          swipeRef.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dy) > 36 && Math.abs(dy) > Math.abs(dx)) {
            setMode(dy > 0 ? "month" : "week");
            return;
          }
          if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
          if (dx < 0) goNext();
          else goPrev();
        }}
      >
        {mode === "week" ? (
          <div className="journal-calendar-week">
            {week.map((date) => (
              <DayCell
                key={dateKey(date)}
                date={date}
                selected={selected}
                today={today}
                journalDates={journalDates}
                onSelectDate={onSelectDate}
              />
            ))}
          </div>
        ) : (
          <div className="journal-calendar-month-grid">
            {weeks.map((row) => (
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
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {!isMobileApp && (
        <button
          type="button"
          className="journal-calendar-handle"
          aria-expanded={mode === "month"}
          aria-label={mode === "month" ? "Show week" : "Show month"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={toggleMode}
        >
          <span />
        </button>
      )}
    </div>
  );
}

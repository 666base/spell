import { useMemo, useState } from "react";
import type { NoteMetadata } from "../../types/note";
import { cn, cleanTitle } from "../../lib/utils";
import { IconButton } from "../ui";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons/velocity";

interface CalendarPanelProps {
  notes: NoteMetadata[];
  onSelectNote: (id: string) => void;
}

export function CalendarPanel({ notes, onSelectNote }: CalendarPanelProps) {
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
    <div className="px-1 py-1">
      <div className="mb-2 grid grid-cols-[1.75rem_1fr_1.75rem] items-center">
        <IconButton
          size="xs"
          aria-label="Previous month"
          onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
        >
          <ChevronLeftIcon />
        </IconButton>
        <div className="text-center text-[13px] font-medium tracking-[-0.01em] text-text">
          {month.toLocaleDateString([], { month: "long", year: "numeric" })}
        </div>
        <IconButton
          size="xs"
          aria-label="Next month"
          className="justify-self-end"
          onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
        >
          <ChevronRightIcon />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
          <div
            key={`${day}-${index}`}
            className="h-5 text-[11px] font-medium uppercase leading-5 text-text-muted/80"
          >
            {day}
          </div>
        ))}
        {Array.from({ length: firstDay }, (_, index) => (
          <div key={`blank-${index}`} />
        ))}
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
                "relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[12px] text-text-muted hover:bg-bg-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                isToday && !isSelected && "font-semibold text-text ring-1 ring-border",
                isSelected && "bg-accent font-semibold text-text-inverse",
              )}
              onClick={() => setSelected(new Date(year, monthIndex, day))}
            >
              {day}
              {noteDays.has(day) && (
                <span
                  className={cn(
                    "absolute bottom-0.5 h-1 w-1 rounded-full bg-accent",
                    isSelected && "bg-text-inverse/75",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="my-3 h-px bg-border" />
      <div className="mb-1.5 px-1 text-[11px] font-medium text-text-muted">
        {selected.toLocaleDateString([], {
          weekday: "long",
          month: "short",
          day: "numeric",
        })}
      </div>
      {selectedNotes.length === 0 ? (
        <div className="px-2 py-3 text-center text-[12px] text-text-muted">
          No notes changed on this day
        </div>
      ) : (
        <div className="max-h-40 space-y-0.5 overflow-y-auto">
          {selectedNotes.map((note) => (
            <button
              key={note.id}
              type="button"
              className="spell-menu-item w-full cursor-pointer"
              onClick={() => onSelectNote(note.id)}
            >
              {cleanTitle(note.title)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

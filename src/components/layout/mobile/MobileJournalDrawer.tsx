import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { JournalCalendar } from "../../journal/JournalCalendar";
import { useOpenJournal } from "../../journal/useOpenJournal";
import { useNotes } from "../../../context/NotesContext";
import { notesInScope } from "../../../lib/notesScope";
import {
  journalDatesFromNotes,
  journalIdForDate,
  journalTitleForDate,
  parseJournalDate,
  sortJournalNotes,
  startOfLocalDay,
} from "../../../lib/journal";
import type { NoteMetadata } from "../../../types/note";

interface MobileJournalDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenEntry: () => void;
}

function journalEntries(notes: NoteMetadata[]) {
  const today = startOfLocalDay();
  const todayId = journalIdForDate(today);
  const sorted = sortJournalNotes(notes);
  const todayNote = sorted.find((note) => note.id === todayId);
  const rest = sorted.filter((note) => note.id !== todayId);
  if (todayNote) return [todayNote, ...rest];
  return [
    {
      id: todayId,
      title: journalTitleForDate(today),
      preview: "",
      modified: Math.floor(today.getTime() / 1000),
    } satisfies NoteMetadata,
    ...rest,
  ];
}

function entryTitle(note: NoteMetadata) {
  const date = parseJournalDate(note.id);
  return date ? journalTitleForDate(date) : note.title;
}

export const MobileJournalDrawer = memo(function MobileJournalDrawer({
  open,
  onClose,
  onOpenEntry,
}: MobileJournalDrawerProps) {
  const { notes } = useNotes();
  const openJournal = useOpenJournal();
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay());
  const journalNotes = useMemo(
    () => notesInScope(notes, { type: "journal" }),
    [notes],
  );
  const journalDates = useMemo(() => journalDatesFromNotes(notes), [notes]);
  const entries = useMemo(() => journalEntries(journalNotes), [journalNotes]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  const openDate = useCallback(
    async (date: Date) => {
      await openJournal(date);
      onClose();
      onOpenEntry();
    },
    [onClose, onOpenEntry, openJournal],
  );

  const pickDate = useCallback(
    (date: Date) => {
      const next = startOfLocalDay(date);
      setSelectedDate(next);
      void openDate(next);
    },
    [openDate],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="spell-calendar-layer mobile-drawer-layer"
      onPointerDown={onClose}
      data-pager-ignore
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Journal"
        className="mobile-journal-drawer spell-calendar-popover mobile-drawer"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="mobile-journal-drawer-header">
          <button type="button" className="mobile-nav-action" onClick={onClose}>
            Done
          </button>
          <span className="mobile-journal-drawer-title">Journal</span>
          <span aria-hidden="true" />
        </header>
        <JournalCalendar
          selected={selectedDate}
          journalDates={journalDates}
          onSelectDate={pickDate}
          defaultMode="month"
        />
        <div className="mobile-journal-drawer-list">
          {entries.map((note) => (
            <button
              key={note.id}
              type="button"
              className="mobile-folder-row"
              onClick={() => {
                const date = parseJournalDate(note.id);
                if (date) void openDate(date);
              }}
            >
              <span className="mobile-folder-label">{entryTitle(note)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
});

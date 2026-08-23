import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotes } from "../../context/NotesContext";
import { Editor } from "../editor/Editor";
import { NoteTitlebar } from "../layout/NoteTitlebar";
import { JournalCalendar } from "./JournalCalendar";
import { useOpenJournal } from "./useOpenJournal";
import {
  isSameLocalDay,
  journalDatesFromNotes,
  journalIdForDate,
  journalTitleForDate,
  parseJournalDate,
  startOfLocalDay,
} from "../../lib/journal";

interface JournalPageProps {
  sidebarVisible: boolean;
  focusMode: boolean;
  onEditorReady: (editor: any) => void;
  hideEditorTitleBar?: boolean;
  onDateChange?: (date: Date) => void;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  showWindowControls?: boolean;
}

export function JournalPage({
  sidebarVisible,
  focusMode,
  onEditorReady,
  hideEditorTitleBar = false,
  onDateChange,
  onToggleSidebar,
  onNewNote,
  showWindowControls = false,
}: JournalPageProps) {
  const { notes, currentNote, clearSelection } = useNotes();
  const openJournal = useOpenJournal();
  const openingJournalRef = useRef(false);
  const hasOpenedInitialJournalRef = useRef(false);
  const [isOpeningJournal, setIsOpeningJournal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay());

  const today = useMemo(() => startOfLocalDay(), []);
  const journalDates = useMemo(() => journalDatesFromNotes(notes), [notes]);
  const openDate = currentNote ? parseJournalDate(currentNote.id) : null;
  const selectedTitle = journalTitleForDate(selectedDate);
  const todayId = journalIdForDate(today);
  const todayNote = notes.find((note) => note.id === todayId);
  const isJournalOpen =
    openDate != null && isSameLocalDay(openDate, selectedDate);

  const openDateJournal = useCallback(
    async (date: Date) => {
      if (openingJournalRef.current) return;
      openingJournalRef.current = true;
      setIsOpeningJournal(true);
      try {
        await openJournal(date);
      } finally {
        openingJournalRef.current = false;
        setIsOpeningJournal(false);
      }
    },
    [openJournal],
  );

  const selectDate = useCallback(
    (date: Date) => {
      const next = startOfLocalDay(date);
      setSelectedDate(next);
      if (notes.some((note) => note.id === journalIdForDate(next))) {
        void openDateJournal(next);
        return;
      }
      if (currentNote && parseJournalDate(currentNote.id)) {
        clearSelection();
      }
    },
    [clearSelection, currentNote, notes, openDateJournal],
  );

  useEffect(() => {
    const date = currentNote ? parseJournalDate(currentNote.id) : null;
    if (date) setSelectedDate(date);
  }, [currentNote?.id]);

  useEffect(() => {
    onDateChange?.(selectedDate);
  }, [onDateChange, selectedDate]);

  useEffect(() => {
    if (!todayNote || hasOpenedInitialJournalRef.current) return;
    hasOpenedInitialJournalRef.current = true;
    if (currentNote?.id !== todayId) {
      void openDateJournal(today);
    }
  }, [currentNote?.id, openDateJournal, today, todayId, todayNote]);

  const chrome = {
    sidebarVisible,
    focusMode,
    onToggleSidebar,
    onNewNote,
    showWindowControls,
  };
  const emptyTitlebar = !hideEditorTitleBar ? (
    <NoteTitlebar
      {...chrome}
      showTools={false}
      onNewNote={() => openDateJournal(selectedDate)}
    />
  ) : null;
  const calendar = !focusMode ? (
    <div className="journal-note-calendar">
      <JournalCalendar
        selected={selectedDate}
        journalDates={journalDates}
        onSelectDate={selectDate}
      />
    </div>
  ) : null;

  return (
    <div
      data-journal-editor={hideEditorTitleBar ? "" : undefined}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg"
    >
      {isJournalOpen ? (
        <Editor
          hideTitleBar={hideEditorTitleBar}
          onEditorReady={onEditorReady}
          header={calendar}
          {...chrome}
        />
      ) : (
        <>
          {emptyTitlebar}
          {calendar}
          <div className="journal-empty">
            {isOpeningJournal ? (
              <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
                Opening {selectedTitle}…
              </div>
            ) : (
              <div className="journal-empty-page">
                {!hideEditorTitleBar && (
                  <h1 className="journal-empty-title">{selectedTitle}</h1>
                )}
                <button
                  type="button"
                  className="journal-empty-create"
                  onClick={() => openDateJournal(selectedDate)}
                >
                  Create daily note
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { createJournalNote, journalIdForDate } from "../../lib/journal";

export function useOpenJournal() {
  const { notes, selectNote, refreshNotes } = useNotes();
  const openingRef = useRef(false);

  return useCallback(
    async (date: Date) => {
      if (openingRef.current) return;
      openingRef.current = true;
      try {
        const id = journalIdForDate(date);
        if (!notes.some((note) => note.id === id)) {
          await createJournalNote(date);
          await refreshNotes();
        }
        await selectNote(id);
      } catch (error) {
        console.error("Failed to open journal:", error);
        toast.error("Could not open this day's journal");
      } finally {
        openingRef.current = false;
      }
    },
    [notes, refreshNotes, selectNote],
  );
}

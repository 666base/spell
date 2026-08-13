import { useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { bg } from "date-fns/locale";
import { useNotes } from "../../context/NotesContext";
import { Editor } from "../editor/Editor";
import { invoke } from "@tauri-apps/api/core";

interface JournalPageProps {
  sidebarVisible: boolean;
  rightSidebarVisible?: boolean;
  focusMode: boolean;
  onEditorReady: (editor: any) => void;
}

export function JournalPage({
  sidebarVisible,
  rightSidebarVisible = true,
  focusMode,
  onEditorReady,
}: JournalPageProps) {
  const { notes, selectNote, currentNote, refreshNotes } = useNotes();
  const creatingNoteRef = useRef(false);

  const today = useMemo(() => new Date(), []);
  const dateId = format(today, "yyyy-MM-dd");
  const journalTitle = format(today, "d MMMM yyyy", { locale: bg });
  const journalId = `journals/${dateId}`;
  const journalNote = notes.find((note) => note.id === journalId);

  useEffect(() => {
    if (creatingNoteRef.current) return;

    const openTodayJournal = async () => {
      creatingNoteRef.current = true;
      try {
        await invoke("create_folder", { path: "journals" }).catch(() => {});

        if (!journalNote) {
          await invoke("save_note", {
            id: journalId,
            content: `# ${journalTitle}\n\n`,
          });
          await refreshNotes();
        } else if (journalNote.title !== journalTitle) {
          // Keep the journal title tied to the current date, including older entries.
          const note = await invoke<{ content: string }>("read_note", {
            id: journalId,
          });
          const lines = note.content.split("\n");
          const content = lines[0].startsWith("# ")
            ? [`# ${journalTitle}`, ...lines.slice(1)].join("\n")
            : `# ${journalTitle}\n\n${note.content}`;
          await invoke("save_note", { id: journalId, content });
          await refreshNotes();
        }

        await selectNote(journalId);
      } catch (error) {
        console.error("Failed to open today's journal:", error);
      } finally {
        creatingNoteRef.current = false;
      }
    };

    void openTodayJournal();
  }, [journalId, journalNote, journalTitle, refreshNotes, selectNote]);

  const isReady = journalNote && currentNote?.id === journalId;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg relative">
      {isReady ? (
        <Editor
          sidebarVisible={sidebarVisible}
          rightSidebarVisible={rightSidebarVisible}
          focusMode={focusMode}
          onEditorReady={onEditorReady}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
          Loading journal...
        </div>
      )}
    </div>
  );
}

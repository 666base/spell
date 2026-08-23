import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { format } from "date-fns";
import { bg } from "date-fns/locale";
import { NotesProvider, useNotes } from "./context/NotesContext";
import { ThemeProvider } from "./context/ThemeContext";
import { GitProvider } from "./context/GitContext";
import { KanbanWorkspaceProvider } from "./context/KanbanWorkspaceContext";
import { FinanceProvider } from "./context/FinanceContext";
import { TooltipProvider, Toaster } from "./components/ui";
import { Editor } from "./components/editor/Editor";
import { JournalPage } from "./components/journal/JournalPage";
import { FolderPicker } from "./components/layout/FolderPicker";
import { CloudSync } from "./components/cloud/CloudSync";
import { SpinnerIcon } from "./components/icons/velocity";
import { SettingsPage } from "./components/settings";
import { MobileFolders } from "./components/layout/mobile/MobileFolders";
import { MobileWorkspace } from "./components/layout/mobile/MobileWorkspace";
import { MobilePager, MobilePagerSlide } from "./components/layout/mobile/MobilePager";
import {
  MobileNavBar,
  MobileScreen,
  MobileTintButton,
  useKeyboardInset,
} from "./components/layout/mobile/MobileChrome";
import { FoldersIcon, KanbanIcon } from "./components/icons/velocity";
import { useOpenJournal } from "./components/journal/useOpenJournal";
import { startOfLocalDay, isSameLocalDay } from "./lib/journal";
import { replaceMarkdownTitle, setEditorDocumentTitle } from "./lib/noteTitle";
import { cleanTitle } from "./lib/utils";

const DAILY = 1;

function DailyPage({
  onOpenFolders,
  onOpenWorkspace,
  onOpenToday,
}: {
  onOpenFolders: () => void;
  onOpenWorkspace: () => void;
  onOpenToday: () => void;
}) {
  const { currentNote, saveNote } = useNotes();
  const editorRef = useRef<TiptapEditor | null>(null);
  const [journalDate, setJournalDate] = useState(() => startOfLocalDay());
  const isVaultNote = Boolean(currentNote && !currentNote.id.startsWith("journals/"));
  const today = startOfLocalDay();
  const showToday = !isVaultNote && !isSameLocalDay(journalDate, today);
  const dateLabel = format(journalDate, "d MMMM yyyy", { locale: bg });

  const handleEditorReady = useCallback((editor: TiptapEditor | null) => {
    editorRef.current = editor;
  }, []);

  const commitTitle = useCallback(
    (nextTitle: string) => {
      if (!currentNote || currentNote.id.startsWith("journals/")) return;
      const trimmed = nextTitle.trim() || "Untitled";
      if (trimmed === cleanTitle(currentNote.title)) return;
      const editor = editorRef.current;
      if (editor && !editor.isDestroyed) {
        setEditorDocumentTitle(editor, trimmed);
        return;
      }
      void saveNote(replaceMarkdownTitle(currentNote.content, trimmed), currentNote.id);
    },
    [currentNote, saveNote],
  );

  return (
    <MobileScreen className="mobile-daily">
      <MobileNavBar
        title={
          isVaultNote ? (
            <MobileNoteTitle
              key={currentNote?.id}
              value={cleanTitle(currentNote?.title)}
              onCommit={commitTitle}
            />
          ) : (
            <>
              <span className="mobile-nav-date">{dateLabel}</span>
              {showToday && (
                <button type="button" className="mobile-nav-today" onClick={onOpenToday}>
                  Today
                </button>
              )}
            </>
          )
        }
        leading={
          <MobileTintButton title="Folders" onClick={onOpenFolders}>
            <FoldersIcon />
          </MobileTintButton>
        }
        trailing={
          <MobileTintButton title="Workspace" onClick={onOpenWorkspace}>
            <KanbanIcon />
          </MobileTintButton>
        }
      />
      <div className="mobile-editor-body">
        <div className="mobile-pager-edge mobile-pager-edge-start" aria-hidden />
        <div className="mobile-pager-edge mobile-pager-edge-end" aria-hidden />
        <div
          className="mobile-editor-pane"
          data-pager-ignore
        >
          {isVaultNote ? (
            <Editor
              sidebarVisible={false}
              focusMode={false}
              hideTitleBar
              onEditorReady={handleEditorReady}
            />
          ) : (
            <JournalPage
              sidebarVisible={false}
              focusMode={false}
              hideEditorTitleBar
              onDateChange={setJournalDate}
              onEditorReady={handleEditorReady}
            />
          )}
        </div>
      </div>
    </MobileScreen>
  );
}

function MobileNoteTitle({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (title: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      className="mobile-nav-title-input"
      value={draft}
      size={Math.max(4, draft.length || 8)}
      aria-label="Note title"
      data-pager-ignore
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function MobileAppContent() {
  const { notesFolder, isLoading, createNoteInFolder } = useNotes();
  const openJournal = useOpenJournal();
  const [index, setIndex] = useState(DAILY);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useKeyboardInset();

  useEffect(() => {
    document.documentElement.classList.add("mobile-app");
    return () => document.documentElement.classList.remove("mobile-app");
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (settingsOpen) {
        setSettingsOpen(false);
        history.pushState({ spell: true }, "");
        return;
      }
      if (index !== DAILY) {
        setIndex(DAILY);
        history.pushState({ spell: true }, "");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [index, settingsOpen]);

  const goTo = useCallback((next: number) => {
    setIndex((current) => {
      if (current === next) return current;
      if (current === DAILY && next !== DAILY) {
        history.pushState({ spell: next }, "");
      }
      return next;
    });
  }, []);

  const compose = useCallback(async () => {
    await createNoteInFolder("");
    goTo(DAILY);
  }, [createNoteInFolder, goTo]);

  const openToday = useCallback(async () => {
    await openJournal(startOfLocalDay());
    goTo(DAILY);
  }, [goTo, openJournal]);

  if (isLoading) {
    return (
      <div className="h-full min-h-dvh flex items-center justify-center bg-bg-secondary">
        <div className="app-loading">
          <div className="app-loading-mark">
            <SpinnerIcon className="w-4.5 h-4.5 stroke-[1.6] animate-spin" />
          </div>
          <span>
            Opening <span className="text-text">Spell</span>
          </span>
        </div>
      </div>
    );
  }

  if (!notesFolder) {
    return <FolderPicker />;
  }

  return (
    <>
      <CloudSync />
      <div data-mobile-shell className="mobile-shell">
        <MobilePager index={index} onIndexChange={goTo}>
          <MobilePagerSlide>
            <MobileFolders
              onOpenNote={() => goTo(DAILY)}
              onOpenJournal={() => {
                void openToday();
              }}
              onOpenSettings={() => {
                history.pushState({ spell: "settings" }, "");
                setSettingsOpen(true);
              }}
              onCompose={() => {
                void compose();
              }}
            />
          </MobilePagerSlide>
          <MobilePagerSlide>
            <DailyPage
              onOpenFolders={() => goTo(0)}
              onOpenWorkspace={() => goTo(2)}
              onOpenToday={() => {
                void openToday();
              }}
            />
          </MobilePagerSlide>
          <MobilePagerSlide>
            <MobileWorkspace onBackToDaily={() => goTo(DAILY)} />
          </MobilePagerSlide>
        </MobilePager>
        {settingsOpen && (
          <div className="mobile-settings-overlay">
            <SettingsPage compact onBack={() => setSettingsOpen(false)} />
          </div>
        )}
      </div>
    </>
  );
}

export default function MobileApp() {
  return (
    <ThemeProvider>
      <Toaster />
      <TooltipProvider>
        <NotesProvider>
          <KanbanWorkspaceProvider>
            <FinanceProvider>
              <GitProvider>
                <MobileAppContent />
              </GitProvider>
            </FinanceProvider>
          </KanbanWorkspaceProvider>
        </NotesProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

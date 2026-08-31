import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
import { EASE_DRAWER, MOTION_FAST_S, MOTION_PANEL_S } from "./lib/motion";
import { JournalPage } from "./components/journal/JournalPage";
import { FolderPicker } from "./components/layout/FolderPicker";
import { CloudSync } from "./components/cloud/CloudSync";
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

const DailyPage = memo(function DailyPage({
  active,
  onOpenFolders,
  onOpenWorkspace,
  onOpenToday,
}: {
  active: boolean;
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

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;
    const release = () => {
      if (editor.isDestroyed) return;
      if (document.activeElement?.classList.contains("mobile-nav-title-input")) return;
      editor.commands.blur();
      editor.view.dom.blur();
      window.getSelection()?.removeAllRanges();
    };
    if (!active) {
      release();
      return;
    }
    const id = window.setTimeout(() => {
      if (editor.isFocused) return;
      release();
    }, 300);
    return () => window.clearTimeout(id);
  }, [active]);

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
});

function MobileNoteTitle({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (title: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const onFocus = () => inputRef.current?.focus();
    window.addEventListener("focus-mobile-note-title", onFocus);
    return () => window.removeEventListener("focus-mobile-note-title", onFocus);
  }, []);

  return (
    <input
      ref={inputRef}
      className="mobile-nav-title-input"
      value={draft}
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
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(DAILY);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useKeyboardInset();

  useEffect(() => {
    document.documentElement.classList.add("mobile-app");
    return () => document.documentElement.classList.remove("mobile-app");
  }, []);

  useEffect(() => {
    if (!history.state?.spell) history.replaceState({ spell: true }, "");
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (settingsOpen) {
        setSettingsOpen(false);
        history.pushState({ spell: true }, "");
        return;
      }
      if (index === 2) {
        const nested = new CustomEvent("spell-mobile-back", { cancelable: true });
        if (!window.dispatchEvent(nested)) {
          history.pushState({ spell: true }, "");
          return;
        }
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

  useEffect(() => {
    const onCreated = () => goTo(DAILY);
    window.addEventListener("spell-note-created", onCreated);
    return () => window.removeEventListener("spell-note-created", onCreated);
  }, [goTo]);

  const openFolders = useCallback(() => goTo(0), [goTo]);
  const openWorkspace = useCallback(() => goTo(2), [goTo]);
  const openDaily = useCallback(() => goTo(DAILY), [goTo]);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = useCallback(() => {
    history.pushState({ spell: "settings" }, "");
    setSettingsOpen(true);
  }, []);

  useEffect(() => {
    const openAccount = () => openSettings();
    window.addEventListener("open-account-settings", openAccount);
    return () => window.removeEventListener("open-account-settings", openAccount);
  }, [openSettings]);

  const compose = useCallback(async () => {
    const note = await createNoteInFolder("");
    if (note) goTo(DAILY);
  }, [createNoteInFolder, goTo]);

  const openToday = useCallback(async () => {
    await openJournal(startOfLocalDay());
    goTo(DAILY);
  }, [goTo, openJournal]);

  if (isLoading) {
    return <div className="h-full min-h-dvh bg-bg-secondary" />;
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
              onOpenNote={openDaily}
              onOpenJournal={openToday}
              onOpenSettings={openSettings}
              onCompose={compose}
            />
          </MobilePagerSlide>
          <MobilePagerSlide>
            <DailyPage
              active={index === DAILY}
              onOpenFolders={openFolders}
              onOpenWorkspace={openWorkspace}
              onOpenToday={openToday}
            />
          </MobilePagerSlide>
          <MobilePagerSlide>
            <MobileWorkspace onBackToDaily={openDaily} />
          </MobilePagerSlide>
        </MobilePager>
        <AnimatePresence>
          {settingsOpen && (
            <motion.div
              className="mobile-settings-overlay"
              initial={
                reduceMotion ? { opacity: 0 } : { transform: "translate3d(100%, 0, 0)" }
              }
              animate={
                reduceMotion ? { opacity: 1 } : { transform: "translate3d(0, 0, 0)" }
              }
              exit={
                reduceMotion ? { opacity: 0 } : { transform: "translate3d(100%, 0, 0)" }
              }
              transition={
                reduceMotion
                  ? { duration: MOTION_FAST_S, ease: "easeOut" }
                  : { duration: MOTION_PANEL_S, ease: EASE_DRAWER }
              }
            >
              <SettingsPage compact onBack={closeSettings} />
            </motion.div>
          )}
        </AnimatePresence>
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

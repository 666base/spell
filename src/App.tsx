import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from "react";
import { toast } from "sonner";
import { NotesProvider, useNotes } from "./context/NotesContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { listen } from "@tauri-apps/api/event";
import { GitProvider } from "./context/GitContext";
import { TooltipProvider, Toaster } from "./components/ui";
import {
  Sidebar,
  type SidebarPanel,
} from "./components/layout/Sidebar";
import { SidebarResizeHandle } from "./components/layout/SidebarResizeHandle";
import { FolderSourceList } from "./components/layout/FolderSourceList";
import { FOLDER_SIDEBAR_PX, SIDEBAR_DEFAULT_PX } from "./lib/sidebar";
import { useOpenTransition } from "./lib/presence";
import { cn } from "./lib/utils";
import { isMoneyTab, isProjectsTab, notesInScope, type NotesScope } from "./lib/notesScope";
import { startOfLocalDay } from "./lib/journal";
import { Editor } from "./components/editor/Editor";
import { JournalPage } from "./components/journal/JournalPage";
import { useOpenJournal } from "./components/journal/useOpenJournal";
import { KanbanPage } from "./components/kanban/KanbanPage";
import { ProjectsHub } from "./components/kanban/ProjectsHub";
import { FinancePage } from "./components/finance/FinancePage";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { FolderPicker } from "./components/layout/FolderPicker";
import { SettingsPage } from "./components/settings";
import { SpinnerIcon } from "./components/icons/velocity";
import { PreviewApp } from "./components/preview/PreviewApp";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMac, isWindows } from "./lib/platform";
import { CloudSync } from "./components/cloud/CloudSync";
import { AppContextMenu } from "./components/layout/AppContextMenu";
import { KanbanWorkspaceProvider, useKanbanWorkspace } from "./context/KanbanWorkspaceContext";
import { FinanceProvider } from "./context/FinanceContext";

function getWindowMode(): {
  isPreview: boolean;
  previewFile: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const file = params.get("file");
  return {
    isPreview: mode === "preview" && !!file,
    previewFile: file,
  };
}

type ViewState = "notes" | "settings";

function AppContent() {
  const {
    notesFolder,
    isLoading,
    createNote,
    createNoteInFolder,
    duplicateNote,
    notes,
    selectedNoteId,
    selectNote,
    clearSelection,
    reloadCurrentNote,
    currentNote,
    syncNotesFolder,
  } = useNotes();
  const openJournal = useOpenJournal();
  const { selectProject } = useKanbanWorkspace();
  const { interfaceZoom, setInterfaceZoom, reloadSettings } = useTheme();
  const interfaceZoomRef = useRef(interfaceZoom);
  const currentNoteRef = useRef(currentNote);
  const [view, setView] = useState<ViewState>("notes");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>("notes");
  const [notesScope, setNotesScope] = useState<NotesScope>({ type: "all" });
  const [openProjectCardId, setOpenProjectCardId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const editorRef = useRef<TiptapEditor | null>(null);
  const foldersOpen = sidebarVisible && !focusMode;
  const notesListOpen = !focusMode;
  const folderRail = useOpenTransition(foldersOpen);
  const notesRail = useOpenTransition(notesListOpen);

  useEffect(() => {
    interfaceZoomRef.current = interfaceZoom;
  }, [interfaceZoom]);

  useEffect(() => {
    currentNoteRef.current = currentNote;
  }, [currentNote]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<string>("set-notes-folder", async (event) => {
      await syncNotesFolder(event.payload);
      await reloadSettings();
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [syncNotesFolder, reloadSettings]);

  const toggleSidebar = useCallback(() => {
    setSidebarVisible((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleOpenNote = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      selectNote(customEvent.detail);
    };
    window.addEventListener("spell-open-note", handleOpenNote);
    return () => window.removeEventListener("spell-open-note", handleOpenNote);
  }, [selectNote]);

  const selectScope = useCallback((scope: NotesScope, cardId?: string) => {
    setNotesScope(scope);
    setOpenProjectCardId(scope.type === "project" ? cardId ?? null : null);
    if (scope.type === "project") selectProject(scope.id);
    setSidebarPanel(scope.type === "journal" ? "journal" : "notes");
    setSidebarVisible(true);
  }, [selectProject]);

  const notesScopeRef = useRef(notesScope);
  const pendingNewProjectRef = useRef(false);
  notesScopeRef.current = notesScope;

  useEffect(() => {
    const onCreate = () => {
      if (isProjectsTab(notesScopeRef.current)) return;
      pendingNewProjectRef.current = true;
      setNotesScope({ type: "projects" });
      setSidebarPanel("notes");
      setSidebarVisible(true);
    };
    window.addEventListener("create-new-project", onCreate);
    return () => window.removeEventListener("create-new-project", onCreate);
  }, []);

  useEffect(() => {
    if (!pendingNewProjectRef.current || !isProjectsTab(notesScope)) return;
    pendingNewProjectRef.current = false;
    window.dispatchEvent(new CustomEvent("create-new-project"));
  }, [notesScope]);

  const selectSidebarPanel = useCallback((panel: SidebarPanel) => {
    setSidebarPanel(panel);
    setNotesScope(panel === "journal" ? { type: "journal" } : { type: "all" });
    setSidebarVisible(true);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (notesScope.type !== "all" && notesScope.type !== "folder") return;

    const scoped = notesInScope(notes, notesScope);
    if (selectedNoteId && scoped.some((note) => note.id === selectedNoteId)) {
      return;
    }
    if (scoped.length > 0) {
      void selectNote(scoped[0].id);
      return;
    }
    if (selectedNoteId) clearSelection();
  }, [clearSelection, isLoading, notes, notesScope, selectNote, selectedNoteId]);

  const createNoteInContext = useCallback(() => {
    if (notesScope.type === "projects") {
      window.dispatchEvent(new CustomEvent("create-new-project"));
      return;
    }
    if (notesScope.type === "project") {
      window.dispatchEvent(new CustomEvent("create-project-task"));
      return;
    }
    if (notesScope.type === "subscriptions") {
      window.dispatchEvent(new CustomEvent("create-money-subscription"));
      return;
    }
    if (notesScope.type === "money" || notesScope.type === "moneyMonth") {
      window.dispatchEvent(new CustomEvent("create-money-record"));
      return;
    }
    setSidebarVisible(true);
    if (notesScope.type === "folder") {
      void createNoteInFolder(notesScope.path);
      return;
    }
    if (notesScope.type === "journal") {
      setSidebarPanel("journal");
      void openJournal(startOfLocalDay());
      return;
    }
    setSidebarPanel("notes");
    void createNote();
  }, [createNote, createNoteInFolder, notesScope, openJournal]);

  const openSettings = useCallback(() => setView("settings"), []);

  const toggleFocusMode = useCallback(() => {
    if (!focusMode && !selectedNoteId) return;
    const nextFocusMode = !focusMode;
    setFocusMode(nextFocusMode);
    if (!nextFocusMode) setSidebarVisible(true);
  }, [focusMode, selectedNoteId]);

  const toggleSettings = useCallback(() => {
    setView((prev) => (prev === "settings" ? "notes" : "settings"));
  }, []);

  const closeSettings = useCallback(() => {
    setView("notes");
  }, []);

  const displayItems = notes;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "F12" ||
        ((e.metaKey || e.ctrlKey) &&
          e.shiftKey &&
          ["i", "j"].includes(e.key.toLowerCase()))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const target = e.target instanceof HTMLElement ? e.target : document.body;
      const isInEditor = !!target.closest(".ProseMirror");
      const isInInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      const isEditorEmpty =
        isInEditor && currentNoteRef.current?.content.trim() === "";

      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        toggleSettings();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setInterfaceZoom((prev) => prev + 0.05);
        const newZoom = Math.round(Math.min(interfaceZoomRef.current + 0.05, 1.5) * 20) / 20;
        toast(`Zoom ${Math.round(newZoom * 100)}%`, { id: "zoom", duration: 1500 });
        return;
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        setInterfaceZoom((prev) => prev - 0.05);
        const newZoom = Math.round(Math.max(interfaceZoomRef.current - 0.05, 0.7) * 20) / 20;
        toast(`Zoom ${Math.round(newZoom * 100)}%`, { id: "zoom", duration: 1500 });
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        setInterfaceZoom(1.0);
        toast("Zoom 100%", { id: "zoom", duration: 1500 });
        return;
      }

      if (view === "settings") {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      if (e.key === "Escape" && focusMode && !isInEditor) {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      if (target.closest("[role='dialog'], [role='alertdialog']")) {
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("print-note"));
        return;
      }

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === "Backslash") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        createNoteInContext();
        return;
      }

      if (
        selectedNoteId &&
        !isInInput &&
        (e.key === "Delete" ||
          (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) &&
        (!isInEditor || isEditorEmpty)
      ) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("request-delete-note", { detail: selectedNoteId }),
        );
        return;
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "d" &&
        !isInEditor &&
        !isInInput &&
        selectedNoteId
      ) {
        e.preventDefault();
        duplicateNote(selectedNoteId);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        reloadCurrentNote();
        return;
      }

      const isInFolderTree = !!(e.target as HTMLElement).closest("[data-folder-tree]");
      if (
        !isProjectsTab(notesScope) &&
        !isMoneyTab(notesScope) &&
        displayItems.length > 0 &&
        (e.key === "ArrowDown" || e.key === "ArrowUp") &&
        ((!isInEditor && !isInInput) || isEditorEmpty) &&
        !isInFolderTree
      ) {
        e.preventDefault();
        const currentIndex = displayItems.findIndex(
          (n) => n.id === selectedNoteId,
        );
        let newIndex: number;

        if (e.key === "ArrowDown") {
          newIndex =
            currentIndex < displayItems.length - 1 ? currentIndex + 1 : 0;
        } else {
          newIndex =
            currentIndex > 0 ? currentIndex - 1 : displayItems.length - 1;
        }

        selectNote(displayItems[newIndex].id);
        window.dispatchEvent(new CustomEvent("focus-note-list"));
        return;
      }

      if (e.key === "Enter" && selectedNoteId && !isInEditor && !isInInput) {
        e.preventDefault();
        const editor = document.querySelector(".ProseMirror") as HTMLElement;
        if (editor) {
          editor.focus();
        }
        return;
      }

      if (e.key === "Escape" && isInEditor) {
        e.preventDefault();
        (target as HTMLElement).blur();
        window.dispatchEvent(new CustomEvent("focus-note-list"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    createNoteInContext,
    duplicateNote,
    displayItems,
    reloadCurrentNote,
    selectedNoteId,
    selectNote,
    toggleSettings,
    toggleSidebar,
    toggleFocusMode,
    focusMode,
    view,
    setInterfaceZoom,
    notesScope,
  ]);

  if (isLoading) {
    return (
      <div className="h-full min-h-0 flex items-center justify-center bg-bg-secondary">
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

  const editorChrome = {
    onToggleSidebar: toggleSidebar,
    onNewNote: createNoteInContext,
    showWindowControls: true,
  };

  return (
    <>
      <CloudSync />
      <div className="h-full min-h-0 flex bg-bg text-text overflow-hidden">
        {view === "settings" ? (
          <SettingsPage onBack={closeSettings} />
        ) : (
          <>
            <div
              data-sidebar
              data-state={folderRail.state}
              className={cn(
                "app-workspace-panel relative h-full shrink-0 overflow-hidden border-r border-border",
                folderRail.animating && "is-animating",
              )}
              style={{ "--panel-width": `${FOLDER_SIDEBAR_PX}px` } as CSSProperties}
              inert={folderRail.state === "closed" ? true : undefined}
              aria-hidden={folderRail.state === "closed"}
            >
              <div className="app-workspace-panel-inner">
                <FolderSourceList
                  scope={notesScope}
                  onSelectScope={selectScope}
                  onToggle={toggleSidebar}
                  onNewFolder={() => undefined}
                  onOpenSettings={openSettings}
                />
              </div>
            </div>
            <div
              data-sidebar
              data-state={notesRail.state}
              className={cn(
                "app-workspace-panel app-sidebar-panel relative h-full shrink-0 overflow-hidden",
                notesRail.animating && "is-animating",
              )}
              style={{ "--panel-width": `var(--sidebar-width, ${SIDEBAR_DEFAULT_PX}px)` } as CSSProperties}
              inert={notesRail.state === "closed" ? true : undefined}
              aria-hidden={notesRail.state === "closed"}
            >
              <div className="app-workspace-panel-inner">
                <Sidebar
                  panel={sidebarPanel}
                  onSelectPanel={selectSidebarPanel}
                  onToggle={toggleSidebar}
                  foldersVisible={foldersOpen || folderRail.animating}
                  scope={notesScope}
                  onSelectScope={selectScope}
                />
                {notesRail.state === "open" && <SidebarResizeHandle />}
              </div>
            </div>
            {notesScope.type === "projects" ? (
              <ProjectsHub
                sidebarVisible={notesListOpen || foldersOpen}
                focusMode={focusMode}
                onOpenProject={(id, cardId) => selectScope({ type: "project", id }, cardId)}
                {...editorChrome}
              />
            ) : notesScope.type === "project" ? (
              <KanbanPage
                sidebarVisible={notesListOpen || foldersOpen}
                focusMode={focusMode}
                openCardId={openProjectCardId}
                {...editorChrome}
              />
            ) : isMoneyTab(notesScope) ? (
              <FinancePage
                scope={notesScope}
                sidebarVisible={notesListOpen || foldersOpen}
                focusMode={focusMode}
                {...editorChrome}
              />
            ) : notesScope.type === "journal" ? (
              <JournalPage
                sidebarVisible={notesListOpen}
                focusMode={focusMode}
                onEditorReady={(editor) => {
                  editorRef.current = editor;
                }}
                {...editorChrome}
              />
            ) : (
              <Editor
                sidebarVisible={notesListOpen}
                focusMode={focusMode}
                onEditorReady={(editor) => {
                  editorRef.current = editor;
                }}
                {...editorChrome}
              />
            )}
          </>
        )}
      </div>

      <AppContextMenu
        getEditor={() => editorRef.current}
        onCreateNote={createNoteInContext}
        onOpenSettings={openSettings}
      />
    </>
  );
}

function App() {
  const { isPreview, previewFile } = useMemo(getWindowMode, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        getCurrentWindow().close().catch(console.error);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const os = isMac ? "mac" : isWindows ? "windows" : "linux";
    document.documentElement.classList.add(`platform-${os}`);
  }, []);

  if (isPreview && previewFile) {
    return (
      <ThemeProvider>
        <Toaster />
        <TooltipProvider>
          <PreviewApp filePath={decodeURIComponent(previewFile)} />
        </TooltipProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <Toaster />
      <TooltipProvider>
        <div className="relative h-full">
          <NotesProvider>
            <KanbanWorkspaceProvider>
              <FinanceProvider>
                <GitProvider>
                  <AppContent />
                </GitProvider>
              </FinanceProvider>
            </KanbanWorkspaceProvider>
          </NotesProvider>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;

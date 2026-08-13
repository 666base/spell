import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { NotesProvider, useNotes } from "./context/NotesContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { listen } from "@tauri-apps/api/event";
import { GitProvider } from "./context/GitContext";
import { KanbanWorkspaceProvider } from "./context/KanbanWorkspaceContext";
import { FinanceProvider } from "./context/FinanceContext";
import { IconButton, PanelToggleIcon, TooltipProvider, Toaster } from "./components/ui";
import {
  Sidebar,
  SidebarPanelTabs,
  type SidebarPanel,
} from "./components/layout/Sidebar";
import { SidebarResizeHandle } from "./components/layout/SidebarResizeHandle";
import { SIDEBAR_DEFAULT_PX } from "./lib/sidebar";
import { Editor } from "./components/editor/Editor";
import { JournalPage } from "./components/journal/JournalPage";
import { KanbanPage } from "./components/kanban/KanbanPage";
import { FinancePage, type FinanceView } from "./components/finance/FinancePage";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { FolderPicker } from "./components/layout/FolderPicker";
import { CommandPalette } from "./components/command-palette/CommandPalette";
import { SettingsPage } from "./components/settings";
import {
  SpinnerIcon,
  ClaudeIcon,
  CodexIcon,
  OpenCodeIcon,
  OllamaIcon,
} from "./components/icons/velocity";
import { AiEditModal } from "./components/ai/AiEditModal";
import { AiResponseToast } from "./components/ai/AiResponseToast";
import { PreviewApp } from "./components/preview/PreviewApp";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as aiService from "./services/ai";
import type { AiProvider } from "./services/ai";
import { isAndroid, isMac, isWindows } from "./lib/platform";
import { cn } from "./lib/utils";
import { CloudSync } from "./components/cloud/CloudSync";
import { WindowControls } from "./components/layout/WindowControls";
import { AppContextMenu } from "./components/layout/AppContextMenu";
import { RightSidebar } from "./components/layout/RightSidebar";
import { getSavedRightSidebarWidth } from "./components/layout/RightSidebarResizeHandle";

// Detect preview mode from URL search params
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

const PANEL_TRANSITION_MS = 240;

/**
 * Keeps a panel mounted just long enough for its compositor transition to
 * finish. Re-opening cancels the pending unmount, so a quick toggle reverses
 * from the panel's current position instead of replaying a separate animation.
 */
function usePanelPresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setVisible(false);
    if (!mounted) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timeout = window.setTimeout(
      () => setMounted(false),
      prefersReducedMotion ? 0 : PANEL_TRANSITION_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [mounted, open]);

  return { mounted, visible };
}

function AppContent() {
  const {
    notesFolder,
    isLoading,
    createNote,
    duplicateNote,
    notes,
    selectedNoteId,
    selectNote,
    searchQuery,
    searchResults,
    reloadCurrentNote,
    currentNote,
    syncNotesFolder,
  } = useNotes();
  const { interfaceZoom, setInterfaceZoom, reloadSettings } = useTheme();
  const interfaceZoomRef = useRef(interfaceZoom);
  const currentNoteRef = useRef(currentNote);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [view, setView] = useState<ViewState>("notes");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [rightSidebarVisible, setRightSidebarVisible] = useState(
    () => localStorage.getItem("spell:right-sidebar-visible") !== "false",
  );
  const [rightSidebarWidth, setRightSidebarWidth] = useState(
    getSavedRightSidebarWidth,
  );
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>("notes");
  const [financeView, setFinanceView] = useState<FinanceView>("overview");
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiEditing, setAiEditing] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider>("claude");
  const editorRef = useRef<TiptapEditor | null>(null);
  const usesCustomLinuxTitlebar = isTauri() && !isAndroid && !isMac && !isWindows;
  const leftPanelOpen = sidebarVisible && !focusMode;
  const rightPanelOpen =
    sidebarPanel !== "kanban" && rightSidebarVisible && !focusMode;
  const { mounted: leftPanelMounted, visible: leftPanelVisible } =
    usePanelPresence(leftPanelOpen);
  const { mounted: rightPanelMounted, visible: rightPanelVisible } =
    usePanelPresence(rightPanelOpen);

  useEffect(() => {
    interfaceZoomRef.current = interfaceZoom;
  }, [interfaceZoom]);

  useEffect(() => {
    currentNoteRef.current = currentNote;
  }, [currentNote]);

  // Listen for set-notes-folder event from CLI (scratch .)
  // Placed here in AppContent where both NotesContext and ThemeContext are available
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

  const toggleRightSidebar = useCallback(() => {
    setRightSidebarVisible((visible) => !visible);
  }, []);

  useEffect(() => {
    localStorage.setItem("spell:right-sidebar-visible", String(rightSidebarVisible));
  }, [rightSidebarVisible]);

  const selectSidebarPanel = useCallback((panel: SidebarPanel) => {
    setSidebarPanel(panel);
    setSidebarVisible(true);
  }, []);

  const openSidebarSearch = useCallback(() => {
    setSidebarPanel("notes");
    setSidebarVisible(true);
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("open-sidebar-search"));
    });
  }, []);

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

  // Go back to command palette from AI modal
  const handleBackToPalette = useCallback(() => {
    setAiModalOpen(false);
    setPaletteOpen(true);
  }, []);

  // AI Edit handler
  const handleAiEdit = useCallback(
    async (prompt: string, ollamaModel?: string) => {
      if (!currentNote) {
        toast.error("No note selected");
        return;
      }

      setAiEditing(true);

      try {
        let result: aiService.AiExecutionResult;
        if (aiProvider === "codex") {
          result = await aiService.executeCodexEdit(currentNote.path, prompt);
        } else if (aiProvider === "opencode") {
          result = await aiService.executeOpenCodeEdit(currentNote.path, prompt);
        } else if (aiProvider === "ollama") {
          result = await aiService.executeOllamaEdit(
            currentNote.path,
            prompt,
            ollamaModel || "qwen3:8b",
          );
        } else {
          result = await aiService.executeClaudeEdit(currentNote.path, prompt);
        }

        // Reload the current note from disk
        await reloadCurrentNote();

        // Show results
        if (result.success) {
          // Close modal after success
          setAiModalOpen(false);

          // Show success toast with provider response
          toast(
            <AiResponseToast output={result.output} provider={aiProvider} />,
            {
              duration: Infinity,
              closeButton: true,
              className: "!min-w-[450px] !max-w-[600px]",
            },
          );
        } else {
          toast.error(
            <div className="space-y-1">
              <div className="font-medium">AI Edit Failed</div>
              <div className="text-xs">{result.error || "Unknown error"}</div>
            </div>,
            { duration: Infinity, closeButton: true },
          );
        }
      } catch (error) {
        console.error("[AI] Error:", error);
        toast.error(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      } finally {
        setAiEditing(false);
      }
    },
    [aiProvider, currentNote, reloadCurrentNote],
  );

  // Memoize display items to prevent unnecessary recalculations
  const displayItems = useMemo(() => {
    return searchQuery.trim() ? searchResults : notes;
  }, [searchQuery, searchResults, notes]);

  // Global keyboard shortcuts
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

      // Cmd+, - Toggle settings (always works, even in settings)
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        toggleSettings();
        return;
      }

      // Cmd+= or Cmd++ - Zoom in (works everywhere, including settings)
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setInterfaceZoom((prev) => prev + 0.05);
        const newZoom = Math.round(Math.min(interfaceZoomRef.current + 0.05, 1.5) * 20) / 20;
        toast(`Zoom ${Math.round(newZoom * 100)}%`, { id: "zoom", duration: 1500 });
        return;
      }

      // Cmd+- - Zoom out (works everywhere, including settings)
      if ((e.metaKey || e.ctrlKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        setInterfaceZoom((prev) => prev - 0.05);
        const newZoom = Math.round(Math.max(interfaceZoomRef.current - 0.05, 0.7) * 20) / 20;
        toast(`Zoom ${Math.round(newZoom * 100)}%`, { id: "zoom", duration: 1500 });
        return;
      }

      // Cmd+0 - Reset zoom (works everywhere, including settings)
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        setInterfaceZoom(1.0);
        toast("Zoom 100%", { id: "zoom", duration: 1500 });
        return;
      }

      // Block all other shortcuts when in settings view
      if (view === "settings") {
        return;
      }

      // Cmd+Shift+Enter - Toggle focus mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      // Cmd+Shift+M - Toggle markdown source mode
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "m"
      ) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("toggle-source-mode"));
        return;
      }

      // Escape exits focus mode when not in editor
      if (e.key === "Escape" && focusMode && !isInEditor) {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      // Let dialogs handle their own keyboard events (Tab, Enter, etc.)
      if (target.closest("[role='dialog'], [role='alertdialog']")) {
        return;
      }

      // Trap Tab/Shift+Tab in notes view only - prevent focus navigation
      // TipTap handles indentation internally before event bubbles up
      if (e.key === "Tab") {
        e.preventDefault();
        return;
      }

      // Cmd+P - Open command palette
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "p") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      // Cmd+Shift+P - Print
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("print-note"));
        return;
      }

      // Cmd/Ctrl+Shift+F - Open sidebar search
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        setSidebarVisible(true);
        window.dispatchEvent(new CustomEvent("open-sidebar-search"));
        return;
      }

      // Cmd+\ - Toggle sidebar
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === "Backslash") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Cmd/Ctrl+Shift+\\ - Toggle right sidebar
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.code === "Backslash"
      ) {
        e.preventDefault();
        toggleRightSidebar();
        return;
      }

      // Cmd+N - New note
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        createNote();
        return;
      }

      // Delete current note (note list focused, or editor on empty note)
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

      // Cmd+D - Duplicate current note
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

      // Cmd+R - Reload current note (pull external changes)
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        reloadCurrentNote();
        return;
      }

      // Arrow keys for note navigation
      // Skip if folder tree view is handling its own navigation
      const isInFolderTree = !!(e.target as HTMLElement).closest("[data-folder-tree]");
      if (
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

      // Enter to focus editor
      if (e.key === "Enter" && selectedNoteId && !isInEditor && !isInInput) {
        e.preventDefault();
        const editor = document.querySelector(".ProseMirror") as HTMLElement;
        if (editor) {
          editor.focus();
        }
        return;
      }

      // Escape to blur editor and go back to note list
      if (e.key === "Escape" && isInEditor) {
        e.preventDefault();
        (target as HTMLElement).blur();
        // Focus the note list for keyboard navigation
        window.dispatchEvent(new CustomEvent("focus-note-list"));
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    createNote,
    duplicateNote,
    displayItems,
    reloadCurrentNote,
    selectedNoteId,
    selectNote,
    toggleSettings,
    toggleSidebar,
    toggleRightSidebar,
    toggleFocusMode,
    focusMode,
    view,
    setInterfaceZoom,
  ]);

  const handleClosePalette = useCallback(() => {
    setPaletteOpen(false);
    editorRef.current?.commands.focus();
  }, []);

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

  return (
    <>
      <CloudSync />
      {usesCustomLinuxTitlebar && (
        <div
          className="titlebar-drag-region fixed inset-x-0 top-0 z-20 flex h-10 items-center justify-center border-b border-border bg-bg-secondary/95"
          data-tauri-drag-region
        >
          {!focusMode && leftPanelMounted && (
            <div
              data-state={leftPanelVisible ? "open" : "closed"}
              style={{ pointerEvents: leftPanelVisible ? "auto" : "none" }}
              className="app-titlebar-sidebar-panel titlebar-no-drag fixed left-11 top-1.5 z-40"
            >
              <SidebarPanelTabs panel={sidebarPanel} onSelectPanel={selectSidebarPanel} />
            </div>
          )}
          <span className="titlebar-brand pointer-events-none absolute top-0 hidden h-10 select-none items-center text-[11px] font-semibold tracking-[0.08em] text-text-muted/75 min-[420px]:flex">
            SPELL
          </span>
        </div>
      )}
      {usesCustomLinuxTitlebar && !focusMode && (
        <div className="titlebar-no-drag titlebar-panel-control fixed left-2 top-1.5 z-[60]">
          <IconButton
            variant="ghost"
            className="hover:bg-transparent"
            onClick={toggleSidebar}
            aria-label={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
          >
            <PanelToggleIcon side="left" open={sidebarVisible} />
          </IconButton>
        </div>
      )}
      {usesCustomLinuxTitlebar && !focusMode && sidebarPanel !== "kanban" && (
        <div className="titlebar-no-drag titlebar-panel-control fixed right-28 top-1.5 z-[60]">
          <IconButton
            variant="ghost"
            className="hover:bg-transparent"
            onClick={toggleRightSidebar}
            aria-label={rightSidebarVisible ? "Hide right sidebar" : "Show right sidebar"}
          >
            <PanelToggleIcon side="right" open={rightSidebarVisible} />
          </IconButton>
        </div>
      )}
      <div className={cn("h-full min-h-0 flex bg-bg text-text overflow-hidden", usesCustomLinuxTitlebar && "pt-10")}>
        {view === "settings" ? (
          <SettingsPage onBack={closeSettings} />
        ) : (
          <>
            {leftPanelMounted && (
              <div
                data-sidebar
                data-state={leftPanelVisible ? "open" : "closed"}
                style={{ width: `var(--sidebar-width, ${SIDEBAR_DEFAULT_PX}px)` }}
                className={cn(
                  "app-sidebar-panel relative shrink-0 overflow-hidden",
                  !leftPanelVisible && "pointer-events-none",
                )}
              >
                <Sidebar
                  panel={sidebarPanel}
                  onSelectPanel={selectSidebarPanel}
                  onOpenSettings={toggleSettings}
                  hidePanelTabs={usesCustomLinuxTitlebar}
                  financeView={financeView}
                  onSelectFinanceView={setFinanceView}
                />
                {leftPanelVisible && <SidebarResizeHandle />}
              </div>
            )}
            {sidebarPanel === "kanban" ? (
              <KanbanPage
                rightSidebarVisible={rightSidebarVisible}
              />
            ) : sidebarPanel === "finance" ? (
              <FinancePage
                view={financeView}
                onViewChange={setFinanceView}
                showSectionTabs={!sidebarVisible}
              />
            ) : sidebarPanel === "journal" ? (
              <JournalPage
                sidebarVisible={sidebarVisible}
                rightSidebarVisible={rightSidebarVisible}
                focusMode={focusMode}
                onEditorReady={(editor) => {
                  editorRef.current = editor;
                }}
              />
            ) : (
              <Editor
                sidebarVisible={sidebarVisible}
                rightSidebarVisible={rightSidebarVisible}
                focusMode={focusMode}
                onEditorReady={(editor) => {
                  editorRef.current = editor;
                }}
              />
            )}
            {rightPanelMounted && (
              <div
                data-state={rightPanelVisible ? "open" : "closed"}
                style={{ width: rightSidebarWidth }}
                className={cn(
                  "app-right-sidebar-panel relative shrink-0",
                  !rightPanelVisible && "pointer-events-none",
                )}
              >
                <RightSidebar
                  width={rightSidebarWidth}
                  currentNote={currentNote}
                  notes={notes}
                  onWidthChange={setRightSidebarWidth}
                  onClose={toggleRightSidebar}
                  showCloseButton={false}
                  onSelectNote={selectNote}
                  onOpenHeading={(text, occurrence) => {
                    const editor = editorRef.current;
                    if (!editor) return;
                    let seen = 0;
                    let position: number | null = null;
                    editor.state.doc.descendants((node, pos) => {
                      if (
                        position === null &&
                        node.type.name === "heading" &&
                        node.textContent === text
                      ) {
                        if (seen === occurrence) position = pos + 1;
                        seen += 1;
                      }
                    });
                    if (position !== null) {
                      editor
                        .chain()
                        .focus()
                        .setTextSelection(position)
                        .scrollIntoView()
                        .run();
                    }
                  }}
                  onOpenSettings={openSettings}
                />
              </div>
            )}
          </>
        )}
      </div>

      <AppContextMenu
        getEditor={() => editorRef.current}
        onCreateNote={createNote}
        onSearch={openSidebarSearch}
        onOpenSettings={openSettings}
      />

      {/* Shared backdrop for command palette and AI modal */}
      {(paletteOpen || aiModalOpen) && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={paletteOpen ? "Close command palette" : "Close AI editor"}
          className="fixed inset-0 z-40 bg-text/50 backdrop-blur-sm"
          onClick={() => {
            if (paletteOpen) handleClosePalette();
            if (aiModalOpen) setAiModalOpen(false);
          }}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          open
          onClose={handleClosePalette}
          onOpenSettings={toggleSettings}
          onOpenAiModal={(provider) => {
            setAiProvider(provider);
            setAiModalOpen(true);
          }}
          focusMode={focusMode}
          onToggleFocusMode={toggleFocusMode}
          editorRef={editorRef}
        />
      )}
      {aiModalOpen && (
        <AiEditModal
          open
          provider={aiProvider}
          onBack={handleBackToPalette}
          onExecute={handleAiEdit}
          isExecuting={aiEditing}
        />
      )}

      {/* AI Editing Overlay */}
      {aiEditing && (
        <div className="fixed inset-0 bg-bg/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex items-center gap-2">
            {aiProvider === "codex" ? (
              <CodexIcon className="w-4.5 h-4.5 fill-text-muted" />
            ) : aiProvider === "opencode" ? (
              <OpenCodeIcon className="w-4.5 h-4.5 fill-text-muted" />
            ) : aiProvider === "ollama" ? (
              <OllamaIcon className="w-4.5 h-4.5 fill-text-muted" />
            ) : (
              <ClaudeIcon className="w-4.5 h-4.5 fill-text-muted" />
            )}
            <SpinnerIcon className="w-4 h-4 stroke-[1.7] text-text-muted animate-spin" />
            <div className="text-sm font-medium text-text">
              {aiProvider === "codex"
                ? "Codex is editing your note..."
                : aiProvider === "opencode"
                  ? "OpenCode is editing your note..."
                : aiProvider === "ollama"
                  ? "Ollama is editing your note..."
                  : "Claude is editing your note..."}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function App() {
  const { isPreview, previewFile } = useMemo(getWindowMode, []);

  // Cmd/Ctrl+W — close window (works in both preview and folder mode)
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

  // Add platform class for OS-specific styling (e.g., keyboard shortcuts)
  useEffect(() => {
    const os = isMac ? "mac" : isWindows ? "windows" : "linux";
    document.documentElement.classList.add(`platform-${os}`);
  }, []);

  // Preview mode: lightweight editor without sidebar, search, git
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

  // Folder mode: full app with sidebar, search, git, etc.
  return (
    <ThemeProvider>
      <Toaster />
      <TooltipProvider>
        <div className="relative h-full">
          <WindowControls />
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

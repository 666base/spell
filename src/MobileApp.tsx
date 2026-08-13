import { useState, useRef, useEffect } from "react";
import { NotesProvider, useNotes } from "./context/NotesContext";
import { ThemeProvider } from "./context/ThemeContext";
import { GitProvider } from "./context/GitContext";
import { KanbanWorkspaceProvider } from "./context/KanbanWorkspaceContext";
import { FinanceProvider } from "./context/FinanceContext";
import { TooltipProvider, Toaster } from "./components/ui";
import { Sidebar, type SidebarPanel } from "./components/layout/Sidebar";
import { RightSidebar } from "./components/layout/RightSidebar";
import { Editor } from "./components/editor/Editor";
import { JournalPage } from "./components/journal/JournalPage";
import { KanbanPage } from "./components/kanban/KanbanPage";
import { FinancePage } from "./components/finance/FinancePage";
import { FolderPicker } from "./components/layout/FolderPicker";
import { MobileTopBar } from "./components/layout/MobileTopBar";
import { MobileDrawer } from "./components/layout/MobileDrawers";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { CommandPalette } from "./components/command-palette/CommandPalette";
import { CloudSync } from "./components/cloud/CloudSync";
import { SpinnerIcon } from "./components/icons/velocity";
import { SettingsPage } from "./components/settings";

type MobileView = "notes" | "settings";

function MobileAppContent() {
  const { notesFolder, isLoading, currentNote, notes, selectNote } = useNotes();
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>("notes");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [view, setView] = useState<MobileView>("notes");
  const editorRef = useRef<TiptapEditor | null>(null);

  // Selecting a file from the mobile vault should return to the editor,
  // matching the push-in / pop-out feel of Obsidian's mobile file explorer.
  useEffect(() => {
    if (currentNote) setLeftDrawerOpen(false);
  }, [currentNote]);

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

  if (view === "settings") {
    return (
      <>
        <CloudSync />
        <SettingsPage onBack={() => setView("notes")} />
      </>
    );
  }

  // Mobile Topbar Title
  const title = sidebarPanel === "kanban"
    ? "Projects"
    : sidebarPanel === "finance"
    ? "Money"
    : sidebarPanel === "journal" 
    ? "Journal" 
    : (currentNote ? currentNote.title || "Untitled" : "Notes");

  return (
    <>
      <CloudSync />
      <div className="flex flex-col h-[100dvh] w-full bg-bg text-text overflow-hidden">
        <MobileTopBar
        title={title}
        onOpenLeftDrawer={() => setLeftDrawerOpen(true)}
        onOpenRightDrawer={() => setRightDrawerOpen(true)}
      />

      <main className="flex-1 overflow-hidden relative">
        {!currentNote && sidebarPanel === "notes" ? (
          <div className="h-full bg-bg-secondary">
            <Sidebar
              panel="notes"
              onSelectPanel={setSidebarPanel}
              onOpenSettings={() => setView("settings")}
            />
          </div>
        ) : sidebarPanel === "kanban" ? (
          <KanbanPage rightSidebarVisible={false} />
        ) : sidebarPanel === "finance" ? (
          <FinancePage />
        ) : sidebarPanel === "journal" ? (
          <JournalPage
            sidebarVisible={false}
            rightSidebarVisible={true}
            focusMode={false}
            onEditorReady={(editor) => {
              editorRef.current = editor;
            }}
          />
        ) : (
          <Editor
            sidebarVisible={false}
            focusMode={false}
            onEditorReady={(editor) => {
              editorRef.current = editor;
            }}
          />
        )}
      </main>

      {/* Left Drawer - Navigation & File Explorer */}
      <MobileDrawer open={leftDrawerOpen} onClose={() => setLeftDrawerOpen(false)} side="left">
        <Sidebar
          panel={sidebarPanel}
          onSelectPanel={(panel) => {
            setSidebarPanel(panel);
            setLeftDrawerOpen(false);
          }}
          onOpenSettings={() => {
            setLeftDrawerOpen(false);
            setView("settings");
          }}
        />
      </MobileDrawer>

      {/* Right Drawer - Metadata & Outline */}
      <MobileDrawer open={rightDrawerOpen} onClose={() => setRightDrawerOpen(false)} side="right">
        <RightSidebar
          width={320} // arbitrary fixed width for inner content, drawer handles max-width
          currentNote={currentNote}
          notes={notes}
          onWidthChange={() => {}}
          onClose={() => setRightDrawerOpen(false)}
          onSelectNote={(id) => {
            selectNote(id);
            setRightDrawerOpen(false);
          }}
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
              setRightDrawerOpen(false);
            }
          }}
          onOpenSettings={() => {
            setRightDrawerOpen(false);
            setView("settings");
          }}
        />
      </MobileDrawer>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenSettings={() => setView("settings")}
        onOpenAiModal={() => {}}
        focusMode={false}
        onToggleFocusMode={() => {}}
      />
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

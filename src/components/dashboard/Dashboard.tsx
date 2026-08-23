import { useMemo, useState } from "react";
import { useNotes } from "../../context/NotesContext";
import { Button, IconButton } from "../ui";
import { NoteIcon, PlusIcon, GalleryIcon, ListIcon } from "../icons/velocity";

export function Dashboard() {
  const { notes, createNote } = useNotes();
  const [view, setView] = useState<"gallery" | "list">("gallery");

  // Sort notes by modified date
  const recentNotes = useMemo(() => {
    return [...notes].sort((a, b) => b.modified - a.modified).slice(0, 50);
  }, [notes]);

  return (
    <div className="flex-1 flex flex-col bg-bg h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-8 py-10 max-w-5xl mx-auto w-full">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-3xl text-text font-serif mb-2 tracking-[-0.02em]">Overview</h1>
            <p className="text-text-muted text-sm">Pick up where you left off</p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-bg-secondary p-1 rounded-lg border border-border">
              <IconButton 
                size="sm" 
                variant={view === "gallery" ? "secondary" : "ghost"}
                onClick={() => setView("gallery")}
                className="!w-8 !h-8 rounded-md"
              >
                <GalleryIcon />
              </IconButton>
              <IconButton 
                size="sm" 
                variant={view === "list" ? "secondary" : "ghost"}
                onClick={() => setView("list")}
                className="!w-8 !h-8 rounded-md"
              >
                <ListIcon />
              </IconButton>
            </div>
            <Button onClick={() => createNote()} size="sm" className="gap-2 h-10 px-4 rounded-lg shadow-sm">
              <PlusIcon />
              New Note
            </Button>
          </div>
        </div>

        {view === "gallery" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {recentNotes.map((note) => (
              <div 
                key={note.id} 
                className="group flex flex-col p-4 bg-bg-secondary hover:bg-bg-emphasis border border-border hover:border-text-muted/30 rounded-xl cursor-pointer transition-all motion-interactive active:scale-95"
                onClick={() => window.dispatchEvent(new CustomEvent("spell-open-note", { detail: note.id }))}
              >
                <div className="flex items-center gap-2 mb-3 text-text-muted">
                  <NoteIcon className="w-4 h-4" />
                  <span className="text-xs truncate">{note.id.split('/').slice(0, -1).join('/') || "Root"}</span>
                </div>
                <h3 className="text-sm font-medium text-text mb-2 line-clamp-2 leading-tight">
                  {note.title || "Untitled"}
                </h3>
                <p className="text-xs text-text-muted line-clamp-3 leading-relaxed mt-auto">
                  {note.preview || "No content"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {recentNotes.map((note) => (
              <div 
                key={note.id} 
                className="group flex items-center justify-between p-3 px-4 bg-transparent hover:bg-bg-secondary border-b border-border/50 cursor-pointer transition-colors"
                onClick={() => window.dispatchEvent(new CustomEvent("spell-open-note", { detail: note.id }))}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <NoteIcon className="w-4.5 h-4.5 text-text-muted shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-text truncate">{note.title || "Untitled"}</span>
                    <span className="text-xs text-text-muted truncate">{note.id.split('/').slice(0, -1).join('/') || "Root"}</span>
                  </div>
                </div>
                <span className="text-xs text-text-muted shrink-0 ml-4">
                  {new Date(note.modified * 1000).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

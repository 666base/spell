import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Editor } from "@tiptap/react";
import { useNotes } from "../../context/NotesContext";
import { IconButton } from "../ui";
import {
  NotesAaIcon,
  NotesChecklistIcon,
  NotesPhotoIcon,
  NotesShareIcon,
  NotesTableIcon,
} from "../icons/notesToolbar";
import { FormatToolbar } from "../editor/FormatToolbar";

const SHARE_ACTIONS = [
  { label: "Copy Markdown", event: "export-copy-markdown" },
  { label: "Copy Plain Text", event: "export-copy-text" },
  { label: "Export Markdown", event: "export-markdown" },
  { label: "Print", event: "export-pdf" },
] as const;

type OpenMenu = "format" | "share" | null;

function stopEditorBlur(event: MouseEvent) {
  event.preventDefault();
}

export function TitlebarTools({ editor = null }: { editor?: Editor | null }) {
  const { currentNote } = useNotes();
  const [open, setOpen] = useState<OpenMenu>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hasNote = Boolean(currentNote && editor);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const insert = (eventName: string) => {
    if (!hasNote) return;
    window.dispatchEvent(new CustomEvent(eventName));
  };

  return (
    <div
      ref={rootRef}
      className="notes-toolbar relative flex items-center"
      role="toolbar"
      aria-label="Note"
    >
      <div className="notes-toolbar-group">
        <div className="relative">
          <IconButton
            size="sm"
            title="Format"
            disabled={!hasNote}
            pressed={open === "format"}
            onMouseDown={stopEditorBlur}
            onClick={() => setOpen((value) => (value === "format" ? null : "format"))}
          >
            <NotesAaIcon />
          </IconButton>
          {open === "format" && editor && (
            <div className="absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2">
              <FormatToolbar editor={editor} />
            </div>
          )}
        </div>
        <IconButton
          size="sm"
          title="Checklist"
          disabled={!hasNote}
          onMouseDown={stopEditorBlur}
          onClick={() => insert("toolbar-checklist")}
        >
          <NotesChecklistIcon />
        </IconButton>
        <IconButton
          size="sm"
          title="Table"
          disabled={!hasNote}
          onMouseDown={stopEditorBlur}
          onClick={() => insert("toolbar-table")}
        >
          <NotesTableIcon />
        </IconButton>
        <IconButton
          size="sm"
          title="Photo"
          disabled={!hasNote}
          onMouseDown={stopEditorBlur}
          onClick={() => insert("slash-command-image")}
        >
          <NotesPhotoIcon />
        </IconButton>
      </div>

      <div className="notes-toolbar-group relative">
        <IconButton
          size="sm"
          title="Share"
          disabled={!hasNote}
          pressed={open === "share"}
          onMouseDown={stopEditorBlur}
          onClick={() => setOpen((value) => (value === "share" ? null : "share"))}
        >
          <NotesShareIcon />
        </IconButton>
        {open === "share" && (
          <div
            role="menu"
            aria-label="Share"
            className="spell-menu spell-popover absolute right-0 top-full z-50 mt-1 min-w-44 origin-top-right"
          >
            {SHARE_ACTIONS.map((action) => (
              <button
                key={action.event}
                type="button"
                role="menuitem"
                className="spell-menu-item cursor-pointer"
                onMouseDown={stopEditorBlur}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent(action.event));
                  setOpen(null);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useRef, useState, type MouseEvent } from "react";
import { type Editor } from "@tiptap/react";
import { useNotes } from "../../context/NotesContext";
import { AnchoredPopover, IconButton } from "../ui";
import {
  NotesAaIcon,
  NotesChecklistIcon,
  NotesPhotoIcon,
  NotesShareIcon,
  NotesTableIcon,
} from "../icons/notesToolbar";
import { FormatToolbar } from "../editor/FormatToolbar";
import { usePublishedNote } from "../../hooks/usePublishedNote";
import { mod, shift } from "../../lib/platform";

type OpenMenu = "format" | "share" | null;

function stopEditorBlur(event: MouseEvent) {
  event.preventDefault();
}

export function TitlebarTools({ editor = null }: { editor?: Editor | null }) {
  const { currentNote } = useNotes();
  const [open, setOpen] = useState<OpenMenu>(null);
  const formatRef = useRef<HTMLButtonElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const hasNote = Boolean(currentNote && editor);
  const { published } = usePublishedNote(currentNote?.id);

  const insert = (eventName: string) => {
    if (!hasNote) return;
    window.dispatchEvent(new CustomEvent(eventName));
  };

  return (
    <div
      className="notes-toolbar relative flex items-center"
      role="toolbar"
      aria-label="Note"
    >
      <div className="notes-toolbar-group">
        <div className="relative">
          <IconButton
            ref={formatRef}
            size="sm"
            title="Format"
            disabled={!hasNote}
            pressed={open === "format"}
            onMouseDown={stopEditorBlur}
            onClick={() => setOpen((value) => (value === "format" ? null : "format"))}
          >
            <NotesAaIcon />
          </IconButton>
          {editor && (
            <AnchoredPopover
              open={open === "format"}
              onClose={() => setOpen(null)}
              anchorRef={formatRef}
              align="center"
            >
              <FormatToolbar editor={editor} />
            </AnchoredPopover>
          )}
        </div>
        <IconButton
          size="sm"
          title={`Checklist (${mod}+${shift}+9)`}
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
          ref={shareRef}
          size="sm"
          title="Share"
          disabled={!hasNote}
          pressed={open === "share"}
          onMouseDown={stopEditorBlur}
          onClick={() => setOpen((value) => (value === "share" ? null : "share"))}
        >
          <NotesShareIcon />
        </IconButton>
        <AnchoredPopover
          open={open === "share"}
          onClose={() => setOpen(null)}
          anchorRef={shareRef}
          align="end"
          origin="top right"
          className="spell-menu min-w-44"
        >
          {published ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="spell-menu-item cursor-pointer"
                onMouseDown={stopEditorBlur}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("note-copy-published-link"));
                  setOpen(null);
                }}
              >
                Copy Link
              </button>
              <button
                type="button"
                role="menuitem"
                className="spell-menu-item spell-menu-item-danger cursor-pointer"
                onMouseDown={stopEditorBlur}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("note-stop-publishing"));
                  setOpen(null);
                }}
              >
                Stop Publishing
              </button>
            </>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="spell-menu-item cursor-pointer"
              onMouseDown={stopEditorBlur}
              onClick={() => {
                window.dispatchEvent(new CustomEvent("note-publish"));
                setOpen(null);
              }}
            >
              Publish
            </button>
          )}
        </AnchoredPopover>
      </div>
    </div>
  );
}

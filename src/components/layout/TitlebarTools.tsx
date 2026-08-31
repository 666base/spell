import { useRef, useState, type MouseEvent } from "react";
import { type Editor, useEditorState } from "@tiptap/react";
import { useNotes } from "../../context/NotesContext";
import { NOTE_HIGHLIGHTS } from "../../lib/noteColors";
import { AnchoredPopover, IconButton } from "../ui";
import {
  NotesAaIcon,
  NotesBoldIcon,
  NotesChecklistIcon,
  NotesHighlightIcon,
  NotesItalicIcon,
  NotesPhotoIcon,
  NotesUnderlineIcon,
  NotesShareIcon,
  NotesTableIcon,
} from "../icons/notesToolbar";
import { FormatToolbar } from "../editor/FormatToolbar";
import { usePublishedNote } from "../../hooks/usePublishedNote";
import { mod, shift } from "../../lib/platform";

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
  const formatRef = useRef<HTMLButtonElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const hasNote = Boolean(currentNote && editor);
  const { published } = usePublishedNote(currentNote?.id);
  const formatting = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      underline: current?.isActive("underline") ?? false,
      highlight: current?.isActive("highlight") ?? false,
    }),
  });

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
        <IconButton
          size="sm"
          title={`Bold (${mod}+B)`}
          disabled={!hasNote}
          pressed={formatting?.bold ?? false}
          onMouseDown={stopEditorBlur}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <NotesBoldIcon />
        </IconButton>
        <IconButton
          size="sm"
          title={`Italic (${mod}+I)`}
          disabled={!hasNote}
          pressed={formatting?.italic ?? false}
          onMouseDown={stopEditorBlur}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <NotesItalicIcon />
        </IconButton>
        <IconButton
          size="sm"
          title={`Underline (${mod}+U)`}
          disabled={!hasNote}
          pressed={formatting?.underline ?? false}
          onMouseDown={stopEditorBlur}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <NotesUnderlineIcon />
        </IconButton>
        <IconButton
          size="sm"
          title={`Highlight (${mod}+${shift}+H)`}
          disabled={!hasNote}
          pressed={formatting?.highlight ?? false}
          onMouseDown={stopEditorBlur}
          onClick={() => {
            if (!editor) return;
            if (editor.isActive("highlight")) {
              editor.chain().focus().unsetHighlight().run();
              return;
            }
            editor.chain().focus().setHighlight({ color: NOTE_HIGHLIGHTS[0].value }).run();
          }}
        >
          <NotesHighlightIcon />
        </IconButton>
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
      </div>

      <div className="notes-toolbar-group">
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
          <div className="spell-menu-separator" />
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
        </AnchoredPopover>
      </div>
    </div>
  );
}

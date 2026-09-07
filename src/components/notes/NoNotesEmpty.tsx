import { useNotes } from "../../context/NotesContext";
import { NOTE_CANVAS_EMPTY } from "../../lib/emptyNotes";
import { isJournalOnlyLibrary } from "../../lib/notesScope";

export function NoNotesEmpty({ onCreate }: { onCreate?: () => void }) {
  const { notes } = useNotes();
  const hint = isJournalOnlyLibrary(notes.map((note) => note.id))
    ? "Folders from your phone appear after you sign in there with this Spell Cloud account."
    : undefined;

  const mark = (
    <svg
      className="no-notes-empty-mark"
      viewBox="0 0 72 88"
      fill="none"
      aria-hidden="true"
    >
      <rect
        className="no-notes-page-shadow"
        x="16"
        y="14"
        width="44"
        height="56"
        rx="8"
      />
      <path
        className="no-notes-page"
        d="M12 14c0-4.4 3.6-8 8-8h22l14 14v36c0 4.4-3.6 8-8 8H20c-4.4 0-8-3.6-8-8V14z"
      />
      <path className="no-notes-fold-face" d="M42 6v14h14L42 6z" />
      <path className="no-notes-fold-crease" d="M42 6v14h14" />
      <g transform="rotate(-34 46 62)">
        <rect
          className="no-notes-pen-body"
          x="43"
          y="38"
          width="6.5"
          height="30"
          rx="2.2"
        />
        <rect
          className="no-notes-pen-band"
          x="43"
          y="44"
          width="6.5"
          height="3"
          rx="0.6"
        />
        <path className="no-notes-pen-nib" d="M43 68h6.5L46.25 78 43 68z" />
      </g>
    </svg>
  );

  const title = <span className="no-notes-empty-title">{NOTE_CANVAS_EMPTY}</span>;

  return (
    <div className="no-notes-empty" role={onCreate ? undefined : "status"}>
      {onCreate ? (
        <button type="button" className="no-notes-empty-action" onClick={onCreate}>
          {mark}
          {title}
        </button>
      ) : (
        <>
          {mark}
          {title}
        </>
      )}
      {hint ? <p className="no-notes-empty-hint">{hint}</p> : null}
    </div>
  );
}

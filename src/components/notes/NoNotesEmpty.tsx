export function NoNotesEmpty() {
  return (
    <div className="no-notes-empty" role="status">
      <svg
        className="no-notes-empty-mark"
        viewBox="0 0 72 88"
        fill="none"
        aria-hidden="true"
      >
        <rect
          className="no-notes-pad-shadow"
          x="12"
          y="10"
          width="50"
          height="70"
          rx="8"
        />
        <rect
          className="no-notes-pad-body"
          x="8"
          y="5"
          width="50"
          height="70"
          rx="8"
        />
        <path
          className="no-notes-pad-header"
          d="M8 13c0-4.4 3.6-8 8-8h34c4.4 0 8 3.6 8 8v9H8v-9z"
        />
        <line className="no-notes-pad-rule" x1="18" y1="36" x2="48" y2="36" />
        <line className="no-notes-pad-rule" x1="18" y1="46" x2="48" y2="46" />
        <line className="no-notes-pad-rule" x1="18" y1="56" x2="40" y2="56" />
      </svg>
      <h1>No Notes</h1>
    </div>
  );
}

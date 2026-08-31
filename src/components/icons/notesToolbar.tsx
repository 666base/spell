import type { SVGProps } from "react";
import { cn } from "../../lib/utils";

type GlyphProps = SVGProps<SVGSVGElement>;

function Glyph({ children, className, ...props }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("notes-glyph", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

/** SF Symbol `textformat` — letterforms, not an outlined Lucide pair. */
export function NotesAaIcon({ className }: { className?: string }) {
  return (
    <span className={cn("notes-aa", className)} aria-hidden="true">
      <span>A</span>
      <span>a</span>
    </span>
  );
}

/** Bold mark — same letterform language as `NotesAaIcon`. */
export function NotesBoldIcon({ className }: { className?: string }) {
  return (
    <span className={cn("notes-mark", className)} aria-hidden="true">
      B
    </span>
  );
}

/** Italic mark — same letterform language as `NotesAaIcon`. */
export function NotesItalicIcon({ className }: { className?: string }) {
  return (
    <span className={cn("notes-mark notes-mark-italic", className)} aria-hidden="true">
      I
    </span>
  );
}

/** Underline mark — same letterform language as `NotesAaIcon`. */
export function NotesUnderlineIcon({ className }: { className?: string }) {
  return (
    <span className={cn("notes-mark notes-mark-underline", className)} aria-hidden="true">
      U
    </span>
  );
}

/** SF Symbol `highlighter` — marker nib over a stroke of ink. */
export function NotesHighlightIcon(props: GlyphProps) {
  return (
    <Glyph className="notes-glyph" {...props}>
      <path
        d="M7.15 16.55 15.4 8.3l2.35 2.35-8.25 8.25H7.15v-2.35Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M14.55 7.45 16.9 5.1a1.7 1.7 0 0 1 2.4 0l1.65 1.65a1.7 1.7 0 0 1 0 2.4l-2.35 2.35"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M5.2 20.15h7.6"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
    </Glyph>
  );
}

/** SF Symbol `checklist` — ticks beside three lines. */
export function NotesChecklistIcon(props: GlyphProps) {
  return (
    <Glyph className="notes-glyph" {...props}>
      <path
        d="M3.1 6.15 5 8.05 8.55 4.2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.1 12.15 5 14.05 8.55 10.2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.2 6.2h9.3M11.2 12.2h9.3M11.2 18.2h6.6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </Glyph>
  );
}

/** SF Symbol `tablecells` — rounded grid with a heavier header row. */
export function NotesTableIcon(props: GlyphProps) {
  return (
    <Glyph className="notes-glyph" {...props}>
      <rect
        x="3.15"
        y="4.2"
        width="17.7"
        height="15.6"
        rx="2.4"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        fill="currentColor"
        opacity="0.45"
        d="M5.55 4.2h12.9a2.4 2.4 0 0 1 2.4 2.4v2.75H3.15V6.6a2.4 2.4 0 0 1 2.4-2.4Z"
      />
      <path
        d="M3.15 9.35h17.7M12 9.35v10.45"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </Glyph>
  );
}

/** SF Symbol `photo` — landscape inside a rounded frame. */
export function NotesPhotoIcon(props: GlyphProps) {
  return (
    <Glyph className="notes-glyph" {...props}>
      <defs>
        <clipPath id="notes-photo-frame">
          <rect x="3.1" y="5.1" width="17.8" height="13.8" rx="2.5" />
        </clipPath>
      </defs>
      <rect
        x="3.1"
        y="5.1"
        width="17.8"
        height="13.8"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <g clipPath="url(#notes-photo-frame)">
        <circle cx="8.35" cy="9.55" r="1.35" fill="currentColor" />
        <path
          d="M3.6 16.35 8.2 11.9l3.35 3.15 4.35-5.2 4.5 6.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </g>
    </Glyph>
  );
}

/** SF Symbol `square.and.arrow.up`. */
export function NotesShareIcon(props: GlyphProps) {
  return (
    <Glyph className="notes-glyph" {...props}>
      <path
        d="M8.4 9.2H6.7A2.55 2.55 0 0 0 4.15 11.75v6.7A2.55 2.55 0 0 0 6.7 21h10.6a2.55 2.55 0 0 0 2.55-2.55v-6.7A2.55 2.55 0 0 0 17.3 9.2h-1.7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M12 15.4V3.6M8.55 6.85 12 3.4l3.45 3.45"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

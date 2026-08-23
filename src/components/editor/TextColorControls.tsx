import { useEffect, useRef, useState, type MouseEvent } from "react";
import { type Editor, useEditorState } from "@tiptap/react";
import { cn } from "../../lib/utils";
import { NOTE_HIGHLIGHTS, sameNoteColor } from "../../lib/noteColors";
import { HighlightIcon } from "../icons/velocity";
import { ToolbarButton } from "../ui";

interface TextColorControlsProps {
  editor: Editor;
  placement?: "above" | "below";
}

function stopEditorBlur(event: MouseEvent) {
  event.preventDefault();
}

function ColorSwatch({
  name,
  value,
  selected,
  onPick,
}: {
  name: string;
  value: string;
  selected: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={selected}
      onMouseDown={stopEditorBlur}
      onClick={() => onPick(value)}
      className={cn(
        "size-6 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
        selected
          ? "ring-2 ring-text ring-offset-1 ring-offset-bg"
          : "ring-1 ring-black/10 dark:ring-white/15",
      )}
      style={{ backgroundColor: value }}
    />
  );
}

function NoneSwatch({
  label,
  selected,
  onPick,
}: {
  label: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onMouseDown={stopEditorBlur}
      onClick={onPick}
      className={cn(
        "relative size-6 shrink-0 overflow-hidden rounded-full bg-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
        selected
          ? "ring-2 ring-text ring-offset-1 ring-offset-bg"
          : "ring-1 ring-black/15 dark:ring-white/20",
      )}
    >
      <span className="absolute inset-[-20%] rotate-45 border-t border-rose-500" />
    </button>
  );
}

export function TextColorControls({ editor, placement = "above" }: TextColorControlsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const formatting = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      highlightColor: currentEditor?.getAttributes("highlight").color as string | undefined,
    }),
  });

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = NOTE_HIGHLIGHTS.find((color) =>
    sameNoteColor(formatting?.highlightColor, color.value),
  );
  const menuPosition =
    placement === "above" ? "bottom-full mb-1 origin-bottom" : "top-full mt-1 origin-top";

  return (
    <div ref={rootRef} className="relative flex items-center gap-px">
      <ToolbarButton
        title="Highlight"
        aria-expanded={open}
        isActive={open || Boolean(formatting?.highlightColor)}
        onMouseDown={stopEditorBlur}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="relative">
          <HighlightIcon />
          <span
            className="absolute right-0 bottom-0 left-0 mx-auto h-0.5 w-3 rounded-full"
            style={{ backgroundColor: current?.swatch ?? NOTE_HIGHLIGHTS[0].swatch }}
          />
        </span>
      </ToolbarButton>

      {open && (
        <div
          role="menu"
          aria-label="Highlight"
          className={cn("spell-menu absolute left-0 z-50 p-2", menuPosition)}
        >
          <div className="flex items-center gap-1.5">
            <NoneSwatch
              label="No highlight"
              selected={!formatting?.highlightColor}
              onPick={() => {
                editor.chain().focus().unsetHighlight().unsetColor().run();
                setOpen(false);
              }}
            />
            {NOTE_HIGHLIGHTS.map((color) => (
              <ColorSwatch
                key={color.value}
                name={`${color.name} highlight`}
                value={color.swatch}
                selected={sameNoteColor(formatting?.highlightColor, color.value)}
                onPick={() => {
                  editor.chain().focus().unsetColor().setHighlight({ color: color.value }).run();
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

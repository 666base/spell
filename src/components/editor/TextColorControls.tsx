import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Editor, useEditorState } from "@tiptap/react";
import { cn } from "../../lib/utils";
import {
  NOTE_HIGHLIGHTS,
  NOTE_INKS,
  sameNoteColor,
} from "../../lib/noteColors";
import { preserveEditorSelection } from "../../lib/dismiss";
import { isMobileApp } from "../../lib/platform";
import { HighlightIcon } from "../icons/velocity";
import { ToolbarButton } from "../ui";

interface TextColorControlsProps {
  editor: Editor;
  placement?: "above" | "below";
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
      onPointerDown={preserveEditorSelection}
      onMouseDown={preserveEditorSelection}
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
      onPointerDown={preserveEditorSelection}
      onMouseDown={preserveEditorSelection}
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
  const [menuPos, setMenuPos] = useState({ left: 0, bottom: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const formatting = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      highlightColor: currentEditor?.getAttributes("highlight").color as string | undefined,
      inkColor: currentEditor?.getAttributes("textStyle").color as string | undefined,
    }),
  });

  useLayoutEffect(() => {
    if (!open || !isMobileApp) return;
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setMenuPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 280)),
      bottom: Math.max(8, window.innerHeight - rect.top + 8),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      const target = "target" in event ? (event.target as Node | null) : null;
      if (target && (rootRef.current?.contains(target) || menuRef.current?.contains(target))) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("spell-close-color-menu", close);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("spell-close-color-menu", close);
    };
  }, [open]);

  const highlight = NOTE_HIGHLIGHTS.find((color) =>
    sameNoteColor(formatting?.highlightColor, color.value),
  );
  const ink = NOTE_INKS.find((color) => sameNoteColor(formatting?.inkColor, color.value));
  const menuPosition =
    placement === "above" ? "bottom-full mb-1 origin-bottom" : "top-full mt-1 origin-top";
  const hasColor = Boolean(formatting?.highlightColor || formatting?.inkColor);

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Color"
      className={cn(
        "spell-menu p-2",
        isMobileApp ? "mobile-color-menu" : cn("absolute left-0 z-50", menuPosition),
      )}
      style={
        isMobileApp
          ? { position: "fixed", left: menuPos.left, bottom: menuPos.bottom }
          : undefined
      }
    >
      <div className="flex items-center gap-1.5">
        <span className="w-4 text-center text-[11px] font-semibold text-text-muted">
          A
        </span>
        <NoneSwatch
          label="Default color"
          selected={!formatting?.inkColor}
          onPick={() => editor.chain().focus().unsetColor().run()}
        />
        {NOTE_INKS.map((color) => (
          <ColorSwatch
            key={color.value}
            name={color.name}
            value={color.value}
            selected={sameNoteColor(formatting?.inkColor, color.value)}
            onPick={() => editor.chain().focus().setColor(color.value).run()}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="flex w-4 justify-center text-text-muted">
          <HighlightIcon className="size-3.5" />
        </span>
        <NoneSwatch
          label="No highlight"
          selected={!formatting?.highlightColor}
          onPick={() => editor.chain().focus().unsetHighlight().run()}
        />
        {NOTE_HIGHLIGHTS.map((color) => (
          <ColorSwatch
            key={color.value}
            name={`${color.name} highlight`}
            value={color.swatch}
            selected={sameNoteColor(formatting?.highlightColor, color.value)}
            onPick={() => {
              editor.chain().focus().setHighlight({ color: color.value }).run();
            }}
          />
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative flex items-center gap-px">
      <ToolbarButton
        title="Color"
        aria-expanded={open}
        isActive={hasColor}
        tabIndex={-1}
        onPointerDown={preserveEditorSelection}
        onMouseDown={preserveEditorSelection}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="relative">
          <HighlightIcon />
          <span
            className="absolute right-0 bottom-0 left-0 mx-auto h-0.5 w-3 rounded-full"
            style={{
              backgroundColor:
                highlight?.swatch ?? ink?.value ?? NOTE_HIGHLIGHTS[0].swatch,
            }}
          />
        </span>
      </ToolbarButton>
      {isMobileApp && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}

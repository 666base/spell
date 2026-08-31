import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { type Editor, useEditorState } from "@tiptap/react";
import { cn } from "../../lib/utils";
import { CheckmarkIcon, ToolbarButton } from "../ui";
import { TypeSizeIcon } from "../icons/velocity";

export type NoteStyle = "title" | "heading" | "subheading" | "body" | "mono";

export const NOTE_STYLES: { id: NoteStyle; label: string }[] = [
  { id: "title", label: "Title" },
  { id: "heading", label: "Heading" },
  { id: "subheading", label: "Subheading" },
  { id: "body", label: "Body" },
  { id: "mono", label: "Monostyled" },
];

export function currentStyle(editor: Editor | null): NoteStyle {
  if (!editor) return "body";
  if (editor.isActive("heading", { level: 1 })) return "title";
  if (editor.isActive("heading", { level: 2 })) return "heading";
  if (editor.isActive("heading", { level: 3 })) return "subheading";
  if (editor.isActive("codeBlock")) return "mono";
  return "body";
}

export function applyStyle(editor: Editor, style: NoteStyle) {
  const chain = editor.chain().focus();
  if (style === "title") chain.setHeading({ level: 1 }).run();
  else if (style === "heading") chain.setHeading({ level: 2 }).run();
  else if (style === "subheading") chain.setHeading({ level: 3 }).run();
  else if (style === "mono") chain.setCodeBlock().run();
  else chain.setParagraph().run();
}

function stopEditorBlur(event: MouseEvent) {
  event.preventDefault();
}

interface TextStyleMenuProps {
  editor: Editor;
  placement?: "above" | "below";
}

export function TextStyleMenu({ editor, placement = "below" }: TextStyleMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => currentStyle(current),
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

  const menuPosition = placement === "above" ? "bottom-full mb-1" : "top-full mt-1";

  return (
    <div ref={rootRef} className="relative">
      <ToolbarButton
        title="Text style"
        aria-expanded={open}
        isActive={open}
        onMouseDown={stopEditorBlur}
        onClick={() => setOpen((value) => !value)}
      >
        <TypeSizeIcon />
      </ToolbarButton>
      {open && (
        <div
          role="menu"
          aria-label="Text style"
          className={cn("spell-menu spell-popover absolute left-0 z-50 min-w-36", menuPosition)}
          style={
            {
              "--transform-origin": placement === "above" ? "bottom center" : "top center",
            } as CSSProperties
          }
        >
          {NOTE_STYLES.map((style) => {
            const selected = active === style.id;
            return (
              <button
                key={style.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className="spell-menu-item cursor-pointer"
                onMouseDown={stopEditorBlur}
                onClick={() => {
                  applyStyle(editor, style.id);
                  setOpen(false);
                }}
              >
                <CheckmarkIcon checked={selected} className="h-4 w-4" />
                <span className={cn(style.id === "title" && "text-[15px] font-semibold", style.id === "heading" && "text-[13px] font-semibold", style.id === "subheading" && "text-[13px] font-medium", style.id === "mono" && "font-mono text-[12px]")}>
                  {style.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

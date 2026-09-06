import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Editor, useEditorState } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { toast } from "sonner";
import { preserveEditorSelection } from "../../lib/dismiss";
import { TextFormattingControls } from "./TextFormattingControls";
import { TextColorControls } from "./TextColorControls";
import { ToolbarButton, Button } from "../ui";
import {
  CheckIcon,
  InlineCodeIcon,
  LinkIcon,
  SpellCheckIcon,
  XIcon,
} from "../icons/velocity";
import {
  proofreadEditorSelection,
  restoreProofreadSelection,
} from "./proofreadSelection";

interface SelectionToolbarProps {
  editor: Editor;
  onAddLink: () => void;
}

type Anchor = { x: number; y: number; above: boolean };

function selectionAnchor(editor: Editor): Omit<Anchor, "above"> | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  try {
    const start = editor.view.domAtPos(from);
    const end = editor.view.domAtPos(to);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const rects = Array.from(range.getClientRects());
    const last = rects[rects.length - 1];
    const bounds = range.getBoundingClientRect();
    if (last && (last.width > 0 || last.height > 0)) {
      return {
        x: Math.round(bounds.left + bounds.width / 2),
        y: Math.round(last.bottom + 8),
      };
    }
    if (bounds.width > 0 || bounds.height > 0) {
      return {
        x: Math.round(bounds.left + bounds.width / 2),
        y: Math.round(bounds.bottom + 8),
      };
    }
    const coords = editor.view.coordsAtPos(to);
    return { x: Math.round(coords.left), y: Math.round(coords.bottom + 8) };
  } catch {
    return null;
  }
}

export const SelectionToolbar = memo(function SelectionToolbar({
  editor,
  onAddLink,
}: SelectionToolbarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [pointerSelecting, setPointerSelecting] = useState(false);
  const [pending, setPending] = useState<{
    from: number;
    original: string;
    text: string;
  } | null>(null);

  const selection = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) {
        return { from: 0, to: 0, hide: true };
      }
      const { from, to, empty } = current.state.selection;
      const nodePick = current.state.selection instanceof NodeSelection;
      return {
        from,
        to,
        hide: empty || nodePick || current.isActive("codeBlock"),
      };
    },
  });

  const place = useCallback(() => {
    const next = selectionAnchor(editor);
    const bar = barRef.current;
    if (!next) {
      setAnchor(null);
      return;
    }
    const width = bar?.offsetWidth ?? 280;
    const height = bar?.offsetHeight ?? 36;
    const pad = 8;
    const x = Math.max(pad + width / 2, Math.min(next.x, window.innerWidth - pad - width / 2));
    const overflowBottom = next.y + height > window.innerHeight - pad;
    if (overflowBottom) {
      const { from } = editor.state.selection;
      const top = editor.view.coordsAtPos(from).top;
      setAnchor({ x, y: Math.round(top - height - 8), above: true });
      return;
    }
    setAnchor({ x, y: next.y, above: false });
  }, [editor]);

  useLayoutEffect(() => {
    if (selection.hide || pointerSelecting) {
      if (!pending) setAnchor(null);
      return;
    }
    place();
  }, [selection.from, selection.to, selection.hide, pointerSelecting, pending, place]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (barRef.current?.contains(event.target as Node)) return;
      if (!editor.view.dom.contains(event.target as Node)) return;
      setPointerSelecting(true);
    };
    const onPointerUp = () => setPointerSelecting(false);
    const scrollRoot = editor.view.dom.closest("[data-editor-scroll]");
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("resize", place);
    scrollRoot?.addEventListener("scroll", place, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("resize", place);
      scrollRoot?.removeEventListener("scroll", place);
    };
  }, [editor, place]);

  const formatting = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      code: current?.isActive("code") ?? false,
      link: current?.isActive("link") ?? false,
    }),
  });

  const visible = Boolean(anchor) && !selection.hide && !pointerSelecting;

  const onProofread = () => {
    const result = proofreadEditorSelection(editor);
    if (!result.applied) {
      toast("No spelling issues");
      return;
    }
    setPending({
      from: result.from,
      original: result.original,
      text: result.text,
    });
  };

  if (!visible && !pending) return null;

  const content = pending ? (
    <>
      <Button
        type="button"
        variant="primary"
        size="xs"
        className="shrink-0 rounded-full"
        aria-label="Keep"
        onPointerDown={preserveEditorSelection}
        onMouseDown={preserveEditorSelection}
        onClick={() => setPending(null)}
      >
        <CheckIcon />
        Keep
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="shrink-0 rounded-full"
        aria-label="Discard"
        onPointerDown={preserveEditorSelection}
        onMouseDown={preserveEditorSelection}
        onClick={() => {
          restoreProofreadSelection(editor, pending);
          setPending(null);
        }}
      >
        <XIcon />
        Discard
      </Button>
    </>
  ) : (
    <>
      <TextFormattingControls editor={editor} />
      <ToolbarButton
        title="Code"
        isActive={formatting.code}
        onMouseDown={preserveEditorSelection}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <InlineCodeIcon />
      </ToolbarButton>
      <span className="selection-toolbar-sep" aria-hidden="true" />
      <TextColorControls editor={editor} placement={anchor?.above ? "below" : "above"} />
      <ToolbarButton
        title="Link"
        isActive={formatting.link}
        onMouseDown={preserveEditorSelection}
        onClick={onAddLink}
      >
        <LinkIcon />
      </ToolbarButton>
      <span className="selection-toolbar-sep" aria-hidden="true" />
      <ToolbarButton
        title="Fix spelling"
        onMouseDown={preserveEditorSelection}
        onClick={onProofread}
      >
        <SpellCheckIcon />
      </ToolbarButton>
    </>
  );

  return createPortal(
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Selection"
      className="selection-toolbar spell-popover"
      style={{
        transform: `translate3d(${anchor?.x ?? 0}px, ${anchor?.y ?? 0}px, 0) translateX(-50%)`,
        pointerEvents: visible || pending ? "auto" : "none",
        opacity: visible || pending ? 1 : 0,
      }}
      onPointerDown={preserveEditorSelection}
    >
      {content}
    </div>,
    document.body,
  );
});

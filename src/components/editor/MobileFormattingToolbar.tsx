import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { type Editor, useEditorState } from "@tiptap/react";
import { 
  BoldIcon, 
  ItalicIcon, 
  UnderlineIcon,
  StrikethroughIcon, 
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon, 
  ListOrderedIcon, 
  CheckSquareIcon,
  QuoteIcon,
  CodeIcon,
  RowsIcon,
  ColumnsIcon,
} from "../icons/velocity";
import { ToolbarButton } from "../ui";
import { TextColorControls } from "./TextColorControls";
import { useVisualViewportBottom } from "../layout/mobile/MobileChrome";
import { preserveEditorSelection } from "../../lib/dismiss";

interface MobileFormattingToolbarProps {
  editor: Editor | null;
}

const TAP_SLOP = 8;

export const MobileFormattingToolbar = memo(function MobileFormattingToolbar({
  editor,
}: MobileFormattingToolbarProps) {
  const [held, setHeld] = useState(false);
  const lastRunAt = useRef(new WeakMap<Element, number>());
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    scroll: number;
    moved: boolean;
  } | null>(null);
  const formatting = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) return null;

      return {
        focused: currentEditor.isFocused,
        heading1: currentEditor.isActive("heading", { level: 1 }),
        heading2: currentEditor.isActive("heading", { level: 2 }),
        heading3: currentEditor.isActive("heading", { level: 3 }),
        bold: currentEditor.isActive("bold"),
        italic: currentEditor.isActive("italic"),
        underline: currentEditor.isActive("underline"),
        strike: currentEditor.isActive("strike"),
        bulletList: currentEditor.isActive("bulletList"),
        orderedList: currentEditor.isActive("orderedList"),
        taskList: currentEditor.isActive("taskList"),
        blockquote: currentEditor.isActive("blockquote"),
        codeBlock: currentEditor.isActive("codeBlock"),
        table: currentEditor.isActive("table"),
      };
    },
  });

  const visible = Boolean(editor && (formatting?.focused || held));
  const toolbarRef = useVisualViewportBottom(visible);

  useEffect(() => {
    if (!visible) return;
    const node = toolbarRef.current;
    if (!node) return;
    const keepFocus = (event: Event) => event.preventDefault();
    node.addEventListener("pointerdown", keepFocus, { passive: false });
    node.addEventListener("mousedown", keepFocus);
    return () => {
      node.removeEventListener("pointerdown", keepFocus);
      node.removeEventListener("mousedown", keepFocus);
    };
  }, [toolbarRef, visible]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    preserveEditorSelection(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setHeld(true);
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scroll: event.currentTarget.scrollLeft,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = gesture.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    drag.moved = true;
    event.currentTarget.scrollLeft = drag.scroll - dx;
  };

  const endGesture = (event: ReactPointerEvent<HTMLDivElement>, apply: boolean) => {
    const drag = gesture.current;
    if (!drag || drag.id !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (apply && !drag.moved) {
      const target = event.target;
      const button = target instanceof Element ? target.closest("button") : null;
      if (button instanceof HTMLButtonElement && !button.disabled) {
        button.click();
        document.addEventListener(
          "click",
          (next) => {
            next.preventDefault();
            next.stopPropagation();
          },
          { capture: true, once: true },
        );
      }
    }
    requestAnimationFrame(() => setHeld(false));
  };

  if (!editor || !formatting || !visible) return null;

  const format = (run: () => void) => (event: { currentTarget: EventTarget }) => {
    const now = performance.now();
    const node = event.currentTarget instanceof Element ? event.currentTarget : null;
    if (node) {
      const previous = lastRunAt.current.get(node) ?? 0;
      if (now - previous < 80) return;
      lastRunAt.current.set(node, now);
    }
    run();
  };

  return createPortal(
    <div
      ref={toolbarRef}
      className="mobile-format-toolbar"
      data-pager-ignore
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endGesture(event, true)}
      onPointerCancel={(event) => endGesture(event, false)}
      onLostPointerCapture={(event) => endGesture(event, false)}
      onMouseDown={(event) => {
        preserveEditorSelection(event);
      }}
    >
      <div className="mobile-format-group">
        <ToolbarButton
          tabIndex={-1}
          onClick={format(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}
          isActive={formatting.heading1}
        >
          <Heading1Icon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          tabIndex={-1}
          onClick={format(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
          isActive={formatting.heading2}
        >
          <Heading2Icon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          tabIndex={-1}
          onClick={format(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
          isActive={formatting.heading3}
        >
          <Heading3Icon className="w-4 h-4" />
        </ToolbarButton>
      </div>
      <div className="mobile-format-group">
        <ToolbarButton
          tabIndex={-1}
          onClick={format(() => editor.chain().focus().toggleBold().run())}
          isActive={formatting.bold}
        >
          <BoldIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          tabIndex={-1}
          onClick={format(() => editor.chain().focus().toggleItalic().run())}
          isActive={formatting.italic}
        >
          <ItalicIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          tabIndex={-1}
          onClick={format(() => editor.chain().focus().toggleUnderline().run())}
          isActive={formatting.underline}
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          tabIndex={-1}
          onClick={format(() => editor.chain().focus().toggleStrike().run())}
          isActive={formatting.strike}
        >
          <StrikethroughIcon className="w-4 h-4" />
        </ToolbarButton>
        <TextColorControls editor={editor} />
      </div>
      <div className="mobile-format-group">
        <ToolbarButton
          tabIndex={-1}
          onClick={format(() => editor.chain().focus().toggleBulletList().run())}
          isActive={formatting.bulletList}
        >
          <ListIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          tabIndex={-1}
          onClick={format(() => editor.chain().focus().toggleOrderedList().run())}
          isActive={formatting.orderedList}
        >
          <ListOrderedIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          tabIndex={-1}
          onClick={format(() => editor.chain().focus().toggleTaskList().run())}
          isActive={formatting.taskList}
        >
          <CheckSquareIcon className="w-4 h-4" />
        </ToolbarButton>
      </div>
      <div className="mobile-format-group">
        <ToolbarButton
          tabIndex={-1}
          onClick={format(() => editor.chain().focus().toggleBlockquote().run())}
          isActive={formatting.blockquote}
        >
          <QuoteIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          tabIndex={-1}
          onClick={format(() => editor.chain().focus().toggleCodeBlock().run())}
          isActive={formatting.codeBlock}
        >
          <CodeIcon className="w-4 h-4" />
        </ToolbarButton>
      </div>
      {formatting.table && (
        <div className="mobile-format-group">
          <ToolbarButton
            tabIndex={-1}
            title="Add row"
            onClick={format(() => editor.chain().focus().addRowAfter().run())}
          >
            <RowsIcon className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            tabIndex={-1}
            title="Add column"
            onClick={format(() => editor.chain().focus().addColumnAfter().run())}
          >
            <ColumnsIcon className="w-4 h-4" />
          </ToolbarButton>
        </div>
      )}
    </div>,
    document.body,
  );
});

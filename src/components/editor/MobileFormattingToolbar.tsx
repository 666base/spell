import { memo } from "react";
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
  CodeIcon
} from "../icons/velocity";
import { ToolbarButton } from "../ui";
import { TextColorControls } from "./TextColorControls";
import { useVisualViewportBottom } from "../layout/mobile/MobileChrome";

interface MobileFormattingToolbarProps {
  editor: Editor | null;
}

export const MobileFormattingToolbar = memo(function MobileFormattingToolbar({
  editor,
}: MobileFormattingToolbarProps) {
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
      };
    },
  });

  const visible = Boolean(editor && formatting?.focused);
  const toolbarRef = useVisualViewportBottom(visible);

  if (!editor || !formatting?.focused) return null;

  return createPortal(
    <div
      ref={toolbarRef}
      className="mobile-format-toolbar"
      data-pager-ignore
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
    >
      <div className="mobile-format-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={formatting.heading1}
        >
          <Heading1Icon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={formatting.heading2}
        >
          <Heading2Icon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={formatting.heading3}
        >
          <Heading3Icon className="w-4 h-4" />
        </ToolbarButton>
      </div>
      <div className="mobile-format-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={formatting.bold}
        >
          <BoldIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={formatting.italic}
        >
          <ItalicIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={formatting.underline}
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={formatting.strike}
        >
          <StrikethroughIcon className="w-4 h-4" />
        </ToolbarButton>
        <TextColorControls editor={editor} />
      </div>
      <div className="mobile-format-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={formatting.bulletList}
        >
          <ListIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={formatting.orderedList}
        >
          <ListOrderedIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          isActive={formatting.taskList}
        >
          <CheckSquareIcon className="w-4 h-4" />
        </ToolbarButton>
      </div>
      <div className="mobile-format-group">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={formatting.blockquote}
        >
          <QuoteIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={formatting.codeBlock}
        >
          <CodeIcon className="w-4 h-4" />
        </ToolbarButton>
      </div>
    </div>,
    document.body,
  );
});

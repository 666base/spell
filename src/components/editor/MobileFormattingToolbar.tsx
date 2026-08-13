import { memo } from "react";
import { type Editor, useEditorState } from "@tiptap/react";
import { 
  BoldIcon, 
  ItalicIcon, 
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
        heading1: currentEditor.isActive("heading", { level: 1 }),
        heading2: currentEditor.isActive("heading", { level: 2 }),
        heading3: currentEditor.isActive("heading", { level: 3 }),
        bold: currentEditor.isActive("bold"),
        italic: currentEditor.isActive("italic"),
        strike: currentEditor.isActive("strike"),
        bulletList: currentEditor.isActive("bulletList"),
        orderedList: currentEditor.isActive("orderedList"),
        taskList: currentEditor.isActive("taskList"),
        blockquote: currentEditor.isActive("blockquote"),
        codeBlock: currentEditor.isActive("codeBlock"),
      };
    },
  });

  if (!editor || !formatting) return null;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-bg/90 backdrop-blur-xl px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] flex items-center gap-1 overflow-x-auto whitespace-nowrap z-40 shadow-[0_-12px_30px_rgba(28,25,23,0.08)] scrollbar-none">
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
      <div className="w-px h-5 bg-border mx-1 shrink-0" />
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
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={formatting.strike}
      >
        <StrikethroughIcon className="w-4 h-4" />
      </ToolbarButton>
      <div className="w-px h-5 bg-border mx-1 shrink-0" />
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
      <div className="w-px h-5 bg-border mx-1 shrink-0" />
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
  );
});

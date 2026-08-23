import { memo, type MouseEvent } from "react";
import { type Editor, useEditorState } from "@tiptap/react";
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from "../icons/velocity";
import { ToolbarButton } from "../ui";

interface TextFormattingControlsProps {
  editor: Editor;
}

function stopEditorBlur(event: MouseEvent) {
  event.preventDefault();
}

export const TextFormattingControls = memo(function TextFormattingControls({
  editor,
}: TextFormattingControlsProps) {
  const formatting = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive("bold") ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      underline: currentEditor?.isActive("underline") ?? false,
      strike: currentEditor?.isActive("strike") ?? false,
    }),
  });

  return (
    <div className="flex items-center gap-px">
      <ToolbarButton
        title="Bold"
        isActive={formatting.bold}
        onMouseDown={stopEditorBlur}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton
        title="Italic"
        isActive={formatting.italic}
        onMouseDown={stopEditorBlur}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon />
      </ToolbarButton>
      <ToolbarButton
        title="Underline"
        isActive={formatting.underline}
        onMouseDown={stopEditorBlur}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon />
      </ToolbarButton>
      <ToolbarButton
        title="Strikethrough"
        isActive={formatting.strike}
        onMouseDown={stopEditorBlur}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <StrikethroughIcon />
      </ToolbarButton>
    </div>
  );
});

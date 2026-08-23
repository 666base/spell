import { memo, type MouseEvent, type ReactNode } from "react";
import { type Editor, useEditorState } from "@tiptap/react";
import { cn } from "../../lib/utils";
import { NOTE_HIGHLIGHTS, sameNoteColor } from "../../lib/noteColors";
import { CheckmarkIcon } from "../ui";
import {
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  BoldIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from "../icons/velocity";
import { applyStyle, currentStyle, NOTE_STYLES } from "./TextStyleMenu";

interface FormatToolbarProps {
  editor: Editor;
}

function stopEditorBlur(event: MouseEvent) {
  event.preventDefault();
}

export const FormatToolbar = memo(function FormatToolbar({
  editor,
}: FormatToolbarProps) {
  const formatting = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      style: currentStyle(current),
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      underline: current?.isActive("underline") ?? false,
      strike: current?.isActive("strike") ?? false,
      bulletList: current?.isActive("bulletList") ?? false,
      orderedList: current?.isActive("orderedList") ?? false,
      highlightColor: current?.getAttributes("highlight").color as string | undefined,
    }),
  });

  return (
    <div className="format-panel spell-menu" role="menu" aria-label="Format">
      {NOTE_STYLES.map((style) => {
        const selected = formatting.style === style.id;
        return (
          <button
            key={style.id}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            className="spell-menu-item"
            onMouseDown={stopEditorBlur}
            onClick={() => applyStyle(editor, style.id)}
          >
            <CheckmarkIcon checked={selected} className="h-4 w-4" />
            <span
              className={cn(
                style.id === "title" && "text-[17px] font-semibold",
                style.id === "heading" && "text-[15px] font-semibold",
                style.id === "subheading" && "text-[13px] font-semibold",
                style.id === "mono" && "font-mono text-[12px]",
              )}
            >
              {style.label}
            </span>
          </button>
        );
      })}

      <div className="spell-menu-separator" />

      <div className="format-cluster">
        <ClusterButton
          label="Bold"
          active={formatting.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon />
        </ClusterButton>
        <ClusterButton
          label="Italic"
          active={formatting.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon />
        </ClusterButton>
        <ClusterButton
          label="Underline"
          active={formatting.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon />
        </ClusterButton>
        <ClusterButton
          label="Strikethrough"
          active={formatting.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <StrikethroughIcon />
        </ClusterButton>
      </div>

      <div className="format-cluster-row">
        <div className="format-cluster">
          <ClusterButton
            label="Bulleted list"
            active={formatting.bulletList}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <ListIcon />
          </ClusterButton>
          <ClusterButton
            label="Numbered list"
            active={formatting.orderedList}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrderedIcon />
          </ClusterButton>
        </div>
        <div className="format-cluster">
          <ClusterButton
            label="Outdent"
            active={false}
            onClick={() => {
              if (!editor.chain().focus().liftListItem("listItem").run()) {
                editor.chain().focus().liftListItem("taskItem").run();
              }
            }}
          >
            <ArrowLeftToLineIcon />
          </ClusterButton>
          <ClusterButton
            label="Indent"
            active={false}
            onClick={() => {
              if (!editor.chain().focus().sinkListItem("listItem").run()) {
                editor.chain().focus().sinkListItem("taskItem").run();
              }
            }}
          >
            <ArrowRightToLineIcon />
          </ClusterButton>
        </div>
      </div>

      <div className="spell-menu-separator" />

      <div className="format-swatches" role="group" aria-label="Highlight">
        <Swatch
          name="No highlight"
          value="var(--color-bg)"
          selected={!formatting.highlightColor}
          struck
          onPick={() => editor.chain().focus().unsetHighlight().unsetColor().run()}
        />
        {NOTE_HIGHLIGHTS.map((color) => (
          <Swatch
            key={color.value}
            name={`${color.name} highlight`}
            value={color.swatch}
            selected={sameNoteColor(formatting.highlightColor, color.value)}
            onPick={() => {
              editor.chain().focus().unsetColor().setHighlight({ color: color.value }).run();
            }}
          />
        ))}
      </div>
    </div>
  );
});

function ClusterButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-active={active ? "true" : "false"}
      className="format-cluster-btn"
      onMouseDown={stopEditorBlur}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Swatch({
  name,
  value,
  selected,
  struck = false,
  onPick,
}: {
  name: string;
  value: string;
  selected: boolean;
  struck?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={selected}
      className="format-swatch"
      data-selected={selected ? "true" : "false"}
      style={{ backgroundColor: value }}
      onMouseDown={stopEditorBlur}
      onClick={onPick}
    >
      {struck && <span className="format-swatch-slash" aria-hidden="true" />}
    </button>
  );
}

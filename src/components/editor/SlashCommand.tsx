import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { ReactNode } from "react";
import {
  PilcrowIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  CheckSquareIcon,
  QuoteIcon,
  CodeIcon,
  BlockMathIcon,
  SeparatorIcon,
  ImageIcon,
  TableIcon,
  BracketsIcon,
  WorkflowIcon,
} from "../icons/velocity";
import { SlashCommandList, type SlashCommandListRef } from "./SlashCommandList";

export interface SlashCommandItem {
  title: string;
  description: string;
  group: "style" | "list" | "insert";
  icon: ReactNode;
  aliases: string[];
  command: (editor: TiptapEditor) => void;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    title: "Title",
    description: "Note title",
    group: "style",
    icon: <Heading1Icon className="size-4" />,
    aliases: ["h1", "heading", "title"],
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    },
  },
  {
    title: "Heading",
    description: "Section heading",
    group: "style",
    icon: <Heading2Icon className="size-4" />,
    aliases: ["h2", "heading", "subtitle"],
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
  },
  {
    title: "Subheading",
    description: "Smaller heading",
    group: "style",
    icon: <Heading3Icon className="size-4" />,
    aliases: ["h3", "heading"],
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    },
  },
  {
    title: "Body",
    description: "Plain body text",
    group: "style",
    icon: <PilcrowIcon className="size-4" />,
    aliases: ["paragraph", "body", "plain", "normal", "text"],
    command: (editor) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    title: "Monostyled",
    description: "Monospace block",
    group: "style",
    icon: <CodeIcon className="size-4" />,
    aliases: ["code", "fenced", "pre", "mono"],
    command: (editor) => {
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
  {
    title: "Bulleted List",
    description: "Unordered list",
    group: "list",
    icon: <ListIcon className="size-4" />,
    aliases: ["ul", "unordered", "list"],
    command: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    group: "list",
    icon: <ListOrderedIcon className="size-4" />,
    aliases: ["ol", "ordered", "list", "numbered"],
    command: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    title: "Checklist",
    description: "List with checkboxes",
    group: "list",
    icon: <CheckSquareIcon className="size-4" />,
    aliases: ["todo", "checklist", "checkbox", "task"],
    command: (editor) => {
      editor.chain().focus().toggleTaskList().run();
    },
  },
  {
    title: "Quote",
    description: "Block quotation",
    group: "insert",
    icon: <QuoteIcon className="size-4" />,
    aliases: ["quote", "blockquote"],
    command: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    title: "Mermaid",
    description: "Diagram block",
    group: "insert",
    icon: <WorkflowIcon className="size-4" />,
    aliases: ["mermaid", "diagram", "flowchart", "chart"],
    command: (editor) => {
      editor.chain().focus().setCodeBlock({ language: "mermaid" }).run();
    },
  },
  {
    title: "Math",
    description: "Display math block",
    group: "insert",
    icon: <BlockMathIcon className="size-4" />,
    aliases: ["math", "equation"],
    command: (editor) => {
      editor.chain().focus().run();
      window.dispatchEvent(new CustomEvent("slash-command-block-math"));
    },
  },
  {
    title: "Separator",
    description: "Visual divider",
    group: "insert",
    icon: <SeparatorIcon className="size-4" />,
    aliases: ["divider", "separator", "hr", "line"],
    command: (editor) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
  {
    title: "Photo",
    description: "Insert from file",
    group: "insert",
    icon: <ImageIcon className="size-4" />,
    aliases: ["picture", "photo", "img", "image"],
    command: (editor) => {
      editor.chain().focus().run();
      window.dispatchEvent(new CustomEvent("slash-command-image"));
    },
  },
  {
    title: "Table",
    description: "Insert a 3×3 table",
    group: "insert",
    icon: <TableIcon className="size-4" />,
    aliases: ["grid"],
    command: (editor) => {
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    title: "Wikilink",
    description: "Link to another note",
    group: "insert",
    icon: <BracketsIcon className="size-4" />,
    aliases: ["link", "note", "wikilink", "[["],
    command: (editor) => {
      editor.chain().focus().insertContent("[[").run();
    },
  },
];

const slashCommandPluginKey = new PluginKey("slashCommand");

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        char: "/",
        pluginKey: slashCommandPluginKey,
        allowSpaces: false,
        startOfLine: true,

        allow: ({ editor }) => {
          return (
            !editor.isActive("codeBlock") && !editor.isActive("frontmatter")
          );
        },

        items: ({ query }) => {
          const q = query.toLowerCase();
          return SLASH_COMMANDS.filter(
            (item) =>
              item.title.toLowerCase().includes(q) ||
              item.description.toLowerCase().includes(q) ||
              item.aliases.some((alias) => alias.includes(q)),
          );
        },

        command: ({ editor, range, props: item }) => {
          editor.chain().focus().deleteRange(range).run();
          item.command(editor);
        },

        render: () => {
          let component: ReactRenderer<SlashCommandListRef> | null = null;
          let popup: TippyInstance | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashCommandList, {
                props: {
                  items: props.items,
                  command: props.command,
                },
                editor: props.editor,
              });

              popup = tippy(document.body, {
                getReferenceClientRect: () =>
                  props.clientRect?.() ?? new DOMRect(),
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
                offset: [0, 4],
                popperOptions: {
                  modifiers: [
                    {
                      name: "flip",
                      options: { fallbackPlacements: ["top-start"] },
                    },
                  ],
                },
              });
            },

            onUpdate: (props) => {
              component?.updateProps({
                items: props.items,
                command: props.command,
              });

              popup?.setProps({
                getReferenceClientRect: () =>
                  props.clientRect?.() ?? new DOMRect(),
              });
            },

            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                popup?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },

            onExit: () => {
              popup?.destroy();
              component?.destroy();
              popup = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});

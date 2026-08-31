import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { NOTE_HIGHLIGHTS } from "../../lib/noteColors";
import { isMac } from "../../lib/platform";

const nativeFormatInput: Record<string, FormatCommand> = {
  formatBold: "bold",
  formatItalic: "italic",
  formatUnderline: "underline",
  formatStrikeThrough: "strike",
};

const nativeEditInput: Record<string, EditCommand> = {
  historyUndo: "undo",
  historyRedo: "redo",
};

export type FormatCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "highlight"
  | "orderedList"
  | "bulletList"
  | "taskList";

export type EditCommand = "undo" | "redo" | "selectAll";

export type EditorCommand = FormatCommand | EditCommand;

function isFormatModifier(event: KeyboardEvent) {
  return isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function canHandleShortcut(event: KeyboardEvent) {
  return !event.isComposing && !event.altKey && !isTypingTarget(event.target);
}

/** Map a keydown to a formatting command. Uses `code` so Shift+digit shortcuts
 *  still match when the produced character is `&`, `*`, etc. */
export function formatCommandForKey(event: KeyboardEvent): FormatCommand | null {
  if (!canHandleShortcut(event) || !isFormatModifier(event)) return null;

  const { code, shiftKey } = event;
  if (!shiftKey && code === "KeyB") return "bold";
  if (!shiftKey && code === "KeyI") return "italic";
  if (!shiftKey && code === "KeyU") return "underline";
  if (!shiftKey && code === "KeyE") return "code";
  if (shiftKey && (code === "KeyX" || code === "KeyS")) return "strike";
  if (shiftKey && code === "KeyH") return "highlight";
  if (shiftKey && code === "Digit7") return "orderedList";
  if (shiftKey && code === "Digit8") return "bulletList";
  if (shiftKey && code === "Digit9") return "taskList";
  return null;
}

/** Undo / redo / select-all. Same `code` matching as format shortcuts. */
export function editCommandForKey(event: KeyboardEvent): EditCommand | null {
  if (!canHandleShortcut(event) || !isFormatModifier(event)) return null;

  const { code, shiftKey } = event;
  if (code === "KeyZ") return shiftKey ? "redo" : "undo";
  if (!shiftKey && !isMac && code === "KeyY") return "redo";
  if (!shiftKey && code === "KeyA") return "selectAll";
  return null;
}

export function formatCommandForInput(inputType: string): FormatCommand | null {
  return nativeFormatInput[inputType] ?? null;
}

export function editCommandForInput(inputType: string): EditCommand | null {
  return nativeEditInput[inputType] ?? null;
}

function commandForKey(event: KeyboardEvent): EditorCommand | null {
  return editCommandForKey(event) ?? formatCommandForKey(event);
}

function commandForInput(inputType: string): EditorCommand | null {
  return editCommandForInput(inputType) ?? formatCommandForInput(inputType);
}

export function runFormatCommand(editor: Editor, command: FormatCommand) {
  switch (command) {
    case "bold":
      return editor.commands.toggleBold();
    case "italic":
      return editor.commands.toggleItalic();
    case "underline":
      return editor.commands.toggleUnderline();
    case "strike":
      return editor.commands.toggleStrike();
    case "code":
      return editor.commands.toggleCode();
    case "highlight":
      if (editor.isActive("highlight")) return editor.commands.unsetHighlight();
      return editor.commands.setHighlight({ color: NOTE_HIGHLIGHTS[0].value });
    case "orderedList":
      return editor.commands.toggleOrderedList();
    case "bulletList":
      return editor.commands.toggleBulletList();
    case "taskList":
      return editor.commands.toggleTaskList();
  }
}

export function runEditCommand(editor: Editor, command: EditCommand) {
  switch (command) {
    case "undo":
      return editor.commands.undo();
    case "redo":
      return editor.commands.redo();
    case "selectAll":
      return editor.commands.selectAll();
  }
}

function runCommand(editor: Editor, command: EditorCommand) {
  if (command === "undo" || command === "redo" || command === "selectAll") {
    return runEditCommand(editor, command);
  }
  return runFormatCommand(editor, command);
}

/**
 * Makes Ctrl/Cmd editor shortcuts reliable on desktop WebViews.
 * WebKitGTK/WebView2 often fire native `formatBold` / `historyUndo` (etc.) on
 * contenteditable instead of delivering a keydown TipTap can handle, so we
 * catch both.
 */
export const FormatShortcuts = Extension.create({
  name: "formatShortcuts",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey("formatShortcuts"),
        view(editorView) {
          let handledByKey = false;

          const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target;
            const inEditor =
              target instanceof Node && editorView.dom.contains(target);
            if (!inEditor && !editorView.hasFocus()) return;
            const command = commandForKey(event);
            if (!command) return;
            event.preventDefault();
            event.stopPropagation();
            handledByKey = true;
            queueMicrotask(() => {
              handledByKey = false;
            });
            runCommand(editor, command);
          };

          const onBeforeInput = (event: Event) => {
            const input = event as InputEvent;
            const command = commandForInput(input.inputType);
            if (!command) return;
            event.preventDefault();
            if (handledByKey) return;
            runCommand(editor, command);
          };

          document.addEventListener("keydown", onKeyDown, true);
          editorView.dom.addEventListener("beforeinput", onBeforeInput, true);

          return {
            destroy() {
              document.removeEventListener("keydown", onKeyDown, true);
              editorView.dom.removeEventListener("beforeinput", onBeforeInput, true);
            },
          };
        },
      }),
    ];
  },
});

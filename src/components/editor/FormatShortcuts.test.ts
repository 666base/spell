import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Underline from "@tiptap/extension-underline";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { NOTE_HIGHLIGHTS } from "../../lib/noteColors";
import {
  FormatShortcuts,
  editCommandForInput,
  editCommandForKey,
  formatCommandForInput,
  formatCommandForKey,
  runFormatCommand,
} from "./FormatShortcuts";

beforeAll(() => {
  const rect = () => new DOMRect();
  const rects = () => [] as unknown as DOMRectList;
  for (const proto of [Element.prototype, Text.prototype, Range.prototype]) {
    const target = proto as typeof proto & {
      getBoundingClientRect: () => DOMRect;
      getClientRects: () => DOMRectList;
    };
    target.getBoundingClientRect = rect;
    target.getClientRects = rects;
  }
});

function keyEvent(init: KeyboardEventInit) {
  return new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    ...init,
  });
}

describe("formatCommandForKey", () => {
  it("maps Ctrl+B/I/U to marks", () => {
    expect(formatCommandForKey(keyEvent({ code: "KeyB", key: "b" }))).toBe("bold");
    expect(formatCommandForKey(keyEvent({ code: "KeyI", key: "i" }))).toBe("italic");
    expect(formatCommandForKey(keyEvent({ code: "KeyU", key: "u" }))).toBe("underline");
  });

  it("maps strikethrough and highlight with Shift", () => {
    expect(
      formatCommandForKey(keyEvent({ code: "KeyX", key: "x", shiftKey: true })),
    ).toBe("strike");
    expect(
      formatCommandForKey(keyEvent({ code: "KeyH", key: "h", shiftKey: true })),
    ).toBe("highlight");
  });

  it("maps list shortcuts by key code so Shift+7 still matches", () => {
    expect(
      formatCommandForKey(keyEvent({ code: "Digit7", key: "&", shiftKey: true })),
    ).toBe("orderedList");
    expect(
      formatCommandForKey(keyEvent({ code: "Digit8", key: "*", shiftKey: true })),
    ).toBe("bulletList");
    expect(
      formatCommandForKey(keyEvent({ code: "Digit9", key: "(", shiftKey: true })),
    ).toBe("taskList");
  });

  it("ignores keys without Ctrl/Cmd and keys typed in inputs", () => {
    expect(
      formatCommandForKey(keyEvent({ code: "KeyB", key: "b", ctrlKey: false })),
    ).toBeNull();

    const input = document.createElement("input");
    document.body.appendChild(input);
    const event = keyEvent({ code: "KeyB", key: "b" });
    input.dispatchEvent(event);
    expect(formatCommandForKey(event)).toBeNull();
    input.remove();
  });
});

describe("formatCommandForInput", () => {
  it("maps native contenteditable format commands", () => {
    expect(formatCommandForInput("formatBold")).toBe("bold");
    expect(formatCommandForInput("formatItalic")).toBe("italic");
    expect(formatCommandForInput("formatUnderline")).toBe("underline");
    expect(formatCommandForInput("formatStrikeThrough")).toBe("strike");
    expect(formatCommandForInput("insertText")).toBeNull();
  });
});

describe("editCommandForKey", () => {
  it("maps Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y to undo and redo", () => {
    expect(editCommandForKey(keyEvent({ code: "KeyZ", key: "z" }))).toBe("undo");
    expect(
      editCommandForKey(keyEvent({ code: "KeyZ", key: "Z", shiftKey: true })),
    ).toBe("redo");
    expect(editCommandForKey(keyEvent({ code: "KeyY", key: "y" }))).toBe("redo");
  });

  it("maps Ctrl+A to select all", () => {
    expect(editCommandForKey(keyEvent({ code: "KeyA", key: "a" }))).toBe(
      "selectAll",
    );
  });

  it("ignores edit keys without Ctrl and keys typed in inputs", () => {
    expect(
      editCommandForKey(keyEvent({ code: "KeyZ", key: "z", ctrlKey: false })),
    ).toBeNull();

    const input = document.createElement("input");
    document.body.appendChild(input);
    const event = keyEvent({ code: "KeyZ", key: "z" });
    input.dispatchEvent(event);
    expect(editCommandForKey(event)).toBeNull();
    input.remove();
  });
});

describe("editCommandForInput", () => {
  it("maps native contenteditable history commands", () => {
    expect(editCommandForInput("historyUndo")).toBe("undo");
    expect(editCommandForInput("historyRedo")).toBe("redo");
    expect(editCommandForInput("insertText")).toBeNull();
  });
});

describe("FormatShortcuts", () => {
  let editor: Editor;
  let element: HTMLDivElement;

  afterEach(() => {
    editor?.destroy();
    element?.remove();
  });

  function makeEditor() {
    element = document.createElement("div");
    document.body.appendChild(element);
    editor = new Editor({
      element,
      extensions: [
        StarterKit,
        Underline,
        Highlight.configure({ multicolor: true }),
        TaskList,
        TaskItem,
        FormatShortcuts,
      ],
    });
    editor.commands.setContent("<p>hello</p>");
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.view.focus();
    return editor;
  }

  function press(init: KeyboardEventInit) {
    editor.view.dom.dispatchEvent(keyEvent(init));
  }

  it("toggles bold from Ctrl+B on a selection", () => {
    makeEditor();
    press({ code: "KeyB", key: "b" });
    expect(editor.isActive("bold")).toBe(true);
    press({ code: "KeyB", key: "b" });
    expect(editor.isActive("bold")).toBe(false);
  });

  it("toggles italic, underline, and strike", () => {
    makeEditor();
    press({ code: "KeyI", key: "i" });
    expect(editor.isActive("italic")).toBe(true);
    press({ code: "KeyU", key: "u" });
    expect(editor.isActive("underline")).toBe(true);
    press({ code: "KeyX", key: "x", shiftKey: true });
    expect(editor.isActive("strike")).toBe(true);
  });

  it("applies the default highlight from Ctrl+Shift+H", () => {
    makeEditor();
    press({ code: "KeyH", key: "h", shiftKey: true });
    expect(editor.isActive("highlight")).toBe(true);
    expect(editor.getAttributes("highlight").color).toBe(
      NOTE_HIGHLIGHTS[0].value,
    );
  });

  it("applies bold from a native formatBold beforeinput", () => {
    makeEditor();
    const event = new Event("beforeinput", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "inputType", { value: "formatBold" });
    editor.view.dom.dispatchEvent(event);
    expect(editor.isActive("bold")).toBe(true);
  });

  it("runFormatCommand toggles marks on the current selection", () => {
    makeEditor();
    expect(runFormatCommand(editor, "bold")).toBe(true);
    expect(editor.isActive("bold")).toBe(true);
  });

  it("undoes and redoes from Ctrl+Z and Ctrl+Shift+Z", () => {
    makeEditor();
    editor.commands.insertContent(" world");
    const after = editor.getHTML();
    expect(after).toContain("world");

    press({ code: "KeyZ", key: "z" });
    expect(editor.getHTML()).not.toBe(after);

    press({ code: "KeyZ", key: "Z", shiftKey: true });
    expect(editor.getHTML()).toBe(after);
  });

  it("redoes from Ctrl+Y", () => {
    makeEditor();
    editor.commands.insertContent(" world");
    const after = editor.getHTML();
    press({ code: "KeyZ", key: "z" });
    expect(editor.getHTML()).not.toBe(after);

    press({ code: "KeyY", key: "y" });
    expect(editor.getHTML()).toBe(after);
  });

  it("undoes from a native historyUndo beforeinput", () => {
    makeEditor();
    editor.commands.insertContent(" world");
    const after = editor.getHTML();
    const event = new Event("beforeinput", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "inputType", { value: "historyUndo" });
    editor.view.dom.dispatchEvent(event);
    expect(editor.getHTML()).not.toBe(after);
  });

  it("selects the document from Ctrl+A", () => {
    makeEditor();
    press({ code: "KeyA", key: "a" });
    const { from, to } = editor.state.selection;
    expect(from).toBe(0);
    expect(to).toBe(editor.state.doc.content.size);
  });
});

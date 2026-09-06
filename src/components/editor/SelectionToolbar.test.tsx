import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { SelectionToolbar } from "./SelectionToolbar";

beforeAll(() => {
  const rect = () => new DOMRect(40, 80, 120, 18);
  const rectList = (): DOMRectList => {
    const value = rect();
    return {
      length: 1,
      item: (index: number) => (index === 0 ? value : null),
      [Symbol.iterator]: function* () {
        yield value;
      },
    } as DOMRectList;
  };
  for (const proto of [Element.prototype, Text.prototype, Range.prototype]) {
    const target = proto as typeof proto & {
      getBoundingClientRect: () => DOMRect;
      getClientRects: () => DOMRectList;
    };
    target.getBoundingClientRect = rect;
    target.getClientRects = rectList;
  }
});

describe("SelectionToolbar", () => {
  let editor: Editor;
  let element: HTMLDivElement;

  afterEach(() => {
    cleanup();
    editor?.destroy();
    element?.remove();
  });

  function makeEditor() {
    element = document.createElement("div");
    document.body.appendChild(element);
    editor = new Editor({
      element,
      extensions: [StarterKit],
      content: "<p>ше дойда утре</p>",
    });
    editor.commands.setTextSelection({
      from: 1,
      to: editor.state.doc.content.size - 1,
    });
    return editor;
  }

  it("shows formatting and a spelling action under a text selection", () => {
    makeEditor();
    render(<SelectionToolbar editor={editor} onAddLink={() => undefined} />);
    expect(screen.getByRole("toolbar", { name: "Selection" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bold" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fix spelling" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Improve" })).toBeNull();
  });

  it("fixes Bulgarian spelling on the selection and can discard it", () => {
    makeEditor();
    render(<SelectionToolbar editor={editor} onAddLink={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Fix spelling" }));
    expect(editor.getText()).toBe("Ще дойда утре");
    expect(screen.getByRole("button", { name: "Keep" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(editor.getText()).toBe("ше дойда утре");
  });
});

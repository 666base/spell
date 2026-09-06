import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import {
  proofreadEditorSelection,
  restoreProofreadSelection,
} from "./proofreadSelection";

describe("proofreadEditorSelection", () => {
  let editor: Editor;
  let element: HTMLDivElement;

  afterEach(() => {
    editor?.destroy();
    element?.remove();
  });

  function makeEditor(html: string) {
    element = document.createElement("div");
    document.body.appendChild(element);
    editor = new Editor({
      element,
      extensions: [StarterKit],
      content: html,
    });
    const from = 1;
    const to = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection({ from, to });
    return editor;
  }

  it("rewrites a selected Bulgarian mistake in one editor transaction", () => {
    makeEditor("<p>ше дойда</p>");
    const result = proofreadEditorSelection(editor);
    expect(result.applied).toBe(true);
    expect(editor.getText()).toBe("Ще дойда");
    expect(editor.state.selection.from).toBe(result.from);
  });

  it("does not dispatch when the selection is already correct", () => {
    makeEditor("<p>Днес времето е хубаво.</p>");
    const result = proofreadEditorSelection(editor);
    expect(result.applied).toBe(false);
    expect(editor.getText()).toBe("Днес времето е хубаво.");
  });

  it("restores the original selection after Discard", () => {
    makeEditor("<p>на столът</p>");
    const result = proofreadEditorSelection(editor);
    expect(editor.getText()).toBe("На стола");
    restoreProofreadSelection(editor, {
      from: result.from,
      original: result.original,
      text: result.text,
    });
    expect(editor.getText()).toBe("на столът");
  });
});

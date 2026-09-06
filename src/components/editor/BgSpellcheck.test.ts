import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { BgSpellcheck, bgSpellcheckKey } from "./BgSpellcheck";

describe("BgSpellcheck", () => {
  let editor: Editor;
  let element: HTMLDivElement;

  afterEach(() => {
    editor?.destroy();
    element?.remove();
  });

  it("underlines a Bulgarian misspelling after the caret leaves the word", async () => {
    element = document.createElement("div");
    document.body.appendChild(element);
    editor = new Editor({
      element,
      extensions: [
        StarterKit,
        BgSpellcheck.configure({
          delay: 0,
          isCorrect: (word) => word.toLowerCase() !== "ше",
        }),
      ],
      content: "<p>ще дойда ше утре</p>",
    });
    editor.commands.setTextSelection(1);

    await vi.waitFor(() => {
      const set = bgSpellcheckKey.getState(editor.state);
      const marks = set?.find() ?? [];
      expect(marks.length).toBeGreaterThan(0);
    });

    const set = bgSpellcheckKey.getState(editor.state);
    const underlined = (set?.find() ?? []).map((deco) =>
      editor.state.doc.textBetween(deco.from, deco.to),
    );
    expect(underlined).toContain("ше");
    expect(underlined).not.toContain("ще");
  });
});

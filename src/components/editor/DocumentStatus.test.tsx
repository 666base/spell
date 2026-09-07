import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DocumentStatus } from "./DocumentStatus";

describe("DocumentStatus", () => {
  let editor: Editor | undefined;
  const sourceRef = createRef<HTMLTextAreaElement>();

  afterEach(() => {
    cleanup();
    editor?.destroy();
  });

  it("stays off an empty note", () => {
    editor = new Editor({
      extensions: [StarterKit],
      content: "<p></p>",
    });
    render(
      <DocumentStatus
        editor={editor}
        sourceMode={false}
        sourceContent=""
        sourceRef={sourceRef}
      />,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows words and the current section while writing", () => {
    editor = new Editor({
      extensions: [StarterKit],
      content: "<h1>Book</h1><h2>Draft</h2><p>one two three four</p>",
    });
    editor.commands.focus("end");
    render(
      <DocumentStatus
        editor={editor}
        sourceMode={false}
        sourceContent=""
        sourceRef={sourceRef}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Draft · 6 words");
  });

  it("reads structured markdown in source mode", async () => {
    const markdown = "# Book\n\n## Draft\n\none two three four\n";
    const field = document.createElement("textarea");
    field.value = markdown;
    field.setSelectionRange(markdown.indexOf("one"), markdown.indexOf("one"));
    document.body.appendChild(field);
    sourceRef.current = field;
    render(
      <DocumentStatus
        editor={null}
        sourceMode
        sourceContent={markdown}
        sourceRef={sourceRef}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Draft · 6 words");
    });
    field.remove();
  });
});

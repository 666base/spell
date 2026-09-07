import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import {
  countWords,
  formatDocumentStatus,
  headingsFromDoc,
  parseMarkdownHeadings,
  readingMinutes,
  sectionForPosition,
  statusFromMarkdown,
} from "./documentStats";

describe("countWords", () => {
  it("counts English and Bulgarian tokens", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("една две три")).toBe(3);
    expect(countWords("Note 12")).toBe(2);
  });

  it("ignores punctuation and extra space", () => {
    expect(countWords("  well, then — ok.  ")).toBe(3);
    expect(countWords("")).toBe(0);
  });
});

describe("readingMinutes", () => {
  it("stays hidden until a full minute of reading", () => {
    expect(readingMinutes(0)).toBeNull();
    expect(readingMinutes(199)).toBeNull();
    expect(readingMinutes(200)).toBe(1);
    expect(readingMinutes(280)).toBe(1);
    expect(readingMinutes(500)).toBe(3);
  });
});

describe("parseMarkdownHeadings", () => {
  it("reads ATX headings and skips fences", () => {
    const headings = parseMarkdownHeadings(`# Book

## Draft

\`\`\`
# not a heading
\`\`\`

### Close
`);
    expect(headings.map((heading) => heading.text)).toEqual([
      "Book",
      "Draft",
      "Close",
    ]);
    expect(headings[1]?.level).toBe(2);
    expect(headings[1]?.from).toBeGreaterThan(headings[0]?.from ?? 0);
  });
});

describe("sectionForPosition", () => {
  const headings = parseMarkdownHeadings(`# Book

body

## Draft

more

## Close
`);

  it("waits for two headings before naming a section", () => {
    expect(sectionForPosition(parseMarkdownHeadings("# Only\n\nbody"), 20)).toBeNull();
  });

  it("tracks the heading at or above the caret", () => {
    const draft = headings.find((heading) => heading.text === "Draft");
    const close = headings.find((heading) => heading.text === "Close");
    expect(draft && close).toBeTruthy();
    expect(sectionForPosition(headings, 0)).toBe("Book");
    expect(sectionForPosition(headings, draft!.from)).toBe("Draft");
    expect(sectionForPosition(headings, close!.from + 1)).toBe("Close");
  });
});

describe("formatDocumentStatus", () => {
  it("hides on empty notes and grows with length", () => {
    expect(formatDocumentStatus(0, null, "en-US")).toBeNull();
    expect(formatDocumentStatus(1, null, "en-US")).toBe("1 word");
    expect(formatDocumentStatus(12, null, "en-US")).toBe("12 words");
    expect(formatDocumentStatus(1847, "Draft", "en-US")).toBe(
      "Draft · 1,847 words · 9 min",
    );
  });
});

describe("statusFromMarkdown", () => {
  it("combines section and words for a long structured note", () => {
    const body = Array.from({ length: 80 }, () => "word").join(" ");
    const markdown = `# Book\n\n## Draft\n\n${body}\n`;
    const caret = markdown.indexOf(body);
    expect(statusFromMarkdown(markdown, caret, "en-US")).toBe(
      "Draft · 82 words",
    );
  });
});

describe("headingsFromDoc", () => {
  let editor: Editor | undefined;

  afterEach(() => {
    editor?.destroy();
  });

  it("reads headings from the live editor document", () => {
    editor = new Editor({
      extensions: [StarterKit],
      content: "<h1>Book</h1><h2>Draft</h2><p>hello</p>",
    });
    expect(headingsFromDoc(editor.state.doc).map((heading) => heading.text)).toEqual([
      "Book",
      "Draft",
    ]);
  });
});

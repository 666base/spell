import type { Editor } from "@tiptap/react";

export function replaceMarkdownTitle(content: string, title: string): string {
  const next = title.trim() || "Untitled";
  if (/^#\s+/m.test(content)) {
    return content.replace(/^#\s+.*$/m, `# ${next}`);
  }
  if (!content.trim()) return `# ${next}\n\n`;
  return `# ${next}\n\n${content}`;
}

export function setEditorDocumentTitle(editor: Editor, title: string) {
  const next = title.trim() || "Untitled";
  const heading = editor.schema.nodes.heading.create(
    { level: 1 },
    next ? editor.schema.text(next) : null,
  );
  const first = editor.state.doc.firstChild;
  editor.view.dispatch(
    first?.type.name === "heading" && first.attrs.level === 1
      ? editor.state.tr.replaceWith(0, first.nodeSize, heading)
      : editor.state.tr.insert(0, heading),
  );
}

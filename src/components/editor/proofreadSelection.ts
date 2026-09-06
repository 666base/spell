import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { proofreadBulgarian, type ProofreadResult } from "../../lib/bgProofread";

export type ProofreadApplication = ProofreadResult & {
  from: number;
  original: string;
  applied: boolean;
};

function rangeForProofread(editor: Editor): { from: number; to: number } | null {
  const { from, to, empty, $from } = editor.state.selection;
  if (!empty) return { from, to };
  const start = $from.start();
  const end = $from.end();
  if (start >= end) return null;
  return { from: start, to: end };
}

export function proofreadEditorSelection(editor: Editor): ProofreadApplication {
  const range = rangeForProofread(editor);
  if (!range) {
    return { text: "", changes: [], from: 0, original: "", applied: false };
  }

  const original = editor.state.doc.textBetween(range.from, range.to, "\n");
  const result = proofreadBulgarian(original);
  if (result.text === original) {
    return { ...result, from: range.from, original, applied: false };
  }

  const insertAt = range.from;
  const nextTo = range.from + result.text.length;
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.insertText(result.text, range.from, range.to);
      tr.setSelection(TextSelection.create(tr.doc, insertAt, nextTo));
      return true;
    })
    .run();

  return { ...result, from: insertAt, original, applied: true };
}

export function restoreProofreadSelection(
  editor: Editor,
  pending: { from: number; original: string; text: string },
) {
  const to = pending.from + pending.text.length;
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.insertText(pending.original, pending.from, to);
      tr.setSelection(
        TextSelection.create(
          tr.doc,
          pending.from,
          pending.from + pending.original.length,
        ),
      );
      return true;
    })
    .run();
}

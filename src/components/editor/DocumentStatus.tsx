import { memo, useEffect, useState, type RefObject } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  countWords,
  formatDocumentStatus,
  headingsFromDoc,
  parseMarkdownHeadings,
  sectionForPosition,
} from "../../lib/documentStats";
import { plainTextFromMarkdown } from "../../lib/plainText";

interface DocumentStatusProps {
  editor: Editor | null;
  sourceMode: boolean;
  sourceContent: string;
  sourceRef: RefObject<HTMLTextAreaElement | null>;
}

export const DocumentStatus = memo(function DocumentStatus({
  editor,
  sourceMode,
  sourceContent,
  sourceRef,
}: DocumentStatusProps) {
  const [sourceCaret, setSourceCaret] = useState(
    () => sourceRef.current?.selectionStart ?? 0,
  );
  const liveLabel = useEditorState({
    editor: sourceMode ? null : editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      return formatDocumentStatus(
        countWords(current.getText()),
        sectionForPosition(
          headingsFromDoc(current.state.doc),
          current.state.selection.from,
        ),
      );
    },
  });

  useEffect(() => {
    if (!sourceMode) return;
    const field = sourceRef.current;
    if (!field) return;
    const sync = () => setSourceCaret(field.selectionStart ?? 0);
    const onSelection = () => {
      if (document.activeElement === field) sync();
    };
    document.addEventListener("selectionchange", onSelection);
    field.addEventListener("keyup", sync);
    field.addEventListener("pointerup", sync);
    sync();
    return () => {
      document.removeEventListener("selectionchange", onSelection);
      field.removeEventListener("keyup", sync);
      field.removeEventListener("pointerup", sync);
    };
  }, [sourceMode, sourceContent, sourceRef]);

  const label = sourceMode
    ? formatDocumentStatus(
        countWords(plainTextFromMarkdown(sourceContent)),
        sectionForPosition(parseMarkdownHeadings(sourceContent), sourceCaret),
      )
    : liveLabel;

  if (!label) return null;

  return (
    <p className="document-status" role="status">
      {label}
    </p>
  );
});

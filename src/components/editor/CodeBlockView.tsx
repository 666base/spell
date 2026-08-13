import { useState } from "react";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { SUPPORTED_LANGUAGES } from "./lowlight";
import { MermaidRenderer } from "./MermaidRenderer";
import { PencilIcon, EyeIcon } from "../icons/velocity";
import { CodeCopyButton, Select } from "../ui";

const btnClass =
  "code-block-mermaid-btn inline-flex items-center gap-1 text-xs h-6 px-1.5 text-text-muted rounded cursor-pointer transition-colors hover:text-text hover:bg-bg-emphasis";

export function CodeBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const language: string = node.attrs.language || "";
  const isMermaid = language === "mermaid";
  const [showSource, setShowSource] = useState(!node.textContent.trim());
  const codeContent = node.textContent;

  const toolbar = (
    <div className="code-block-language-selector" contentEditable={false}>
      <CodeCopyButton text={codeContent} className={btnClass} />
      {isMermaid && (
        <button
          contentEditable={false}
          onClick={() => setShowSource(!showSource)}
          className={btnClass}
          type="button"
        >
          {showSource ? (
            <>
              <EyeIcon className="w-3.5 h-3.5 stroke-[1.7]" />
              Preview
            </>
          ) : (
            <>
              <PencilIcon className="w-4 h-4 stroke-[1.6]" />
              Edit
            </>
          )}
        </button>
      )}
      <div className="flex items-center">
        <Select
          value={language}
          onValueChange={(value) => updateAttributes({ language: value })}
          aria-label="Code language"
          className="h-6 w-auto min-w-0 border-transparent bg-transparent py-0 pl-1.5 pr-6 text-xs text-text-muted hover:bg-bg-emphasis focus-visible:border-transparent focus-visible:ring-0"
          contentClassName="min-w-44"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );

  if (isMermaid && !showSource) {
    return (
      <NodeViewWrapper className="code-block-wrapper mermaid-wrapper" as="div">
        {toolbar}
        <div
          contentEditable={false}
          className="mermaid-preview rounded-lg bg-bg-muted p-4 my-1"
        >
          <MermaidRenderer code={codeContent} />
        </div>
        {/* Hidden but present for TipTap content tracking */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            overflow: "hidden",
            height: 0,
            opacity: 0,
          }}
        >
          <pre>
            {/* @ts-expect-error - "code" is a valid intrinsic element for NodeViewContent */}
            <NodeViewContent as="code" />
          </pre>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="code-block-wrapper" as="div">
      {toolbar}
      <pre>
        {/* @ts-expect-error - "code" is a valid intrinsic element for NodeViewContent */}
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

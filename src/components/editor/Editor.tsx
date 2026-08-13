import {
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import {
  useEditor,
  EditorContent,
  ReactRenderer,
  ReactNodeViewRenderer,
  type Editor as TiptapEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { lowlight } from "./lowlight";
import { CodeBlockView } from "./CodeBlockView";
import { Extension, InputRule } from "@tiptap/core";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
} from "@tiptap/pm/state";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { toast } from "sonner";
import { mod, isMac, isWindows } from "../../lib/platform";

// Prepend https:// if no protocol is present
function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// Validate URL scheme for safe opening
function isAllowedUrlScheme(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

import { useOptionalNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import { Frontmatter } from "./Frontmatter";
import { BlockMathEditor } from "./BlockMathEditor";
import { LinkEditor } from "./LinkEditor";
import { SearchToolbar } from "./SearchToolbar";
import { MobileFormattingToolbar } from "./MobileFormattingToolbar";
import { SlashCommand } from "./SlashCommand";
import { Wikilink, type WikilinkStorage } from "./Wikilink";
import { WikilinkSuggestion } from "./WikilinkSuggestion";
import { EditorWidthHandles } from "./EditorWidthHandle";
import { ScratchBlockMath, normalizeBlockMath } from "./MathExtensions";
import { cn } from "../../lib/utils";
import { plainTextFromMarkdown } from "../../lib/plainText";
import { Button, Tooltip } from "../ui";
import { downloadPdf, downloadMarkdown } from "../../services/pdf";
import {
  SpinnerIcon,
  RefreshCwIcon,
} from "../icons/velocity";

function focusAndSelectTitle(editor: TiptapEditor): boolean {
  let titleFrom = -1;
  let titleTo = -1;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading" || node.attrs.level !== 1) {
      return true;
    }
    titleFrom = pos + 1;
    titleTo = pos + node.nodeSize - 1;
    return false;
  });

  if (titleFrom < 0 || titleTo < 0) return false;

  editor
    .chain()
    .focus()
    .setTextSelection(
      titleFrom === titleTo ? titleFrom : { from: titleFrom, to: titleTo },
    )
    .run();

  return true;
}

// Standard number-field shortcuts for KaTeX (shared between inline and block math)
const katexMacros: Record<string, string> = {
  "\\R": "\\mathbb{R}",
  "\\N": "\\mathbb{N}",
  "\\Z": "\\mathbb{Z}",
  "\\Q": "\\mathbb{Q}",
  "\\C": "\\mathbb{C}",
};

// Search highlight extension - adds yellow backgrounds to search matches
const searchHighlightPluginKey = new PluginKey("searchHighlight");

interface SearchHighlightOptions {
  matches: Array<{ from: number; to: number }>;
  currentIndex: number;
}

const SearchHighlight = Extension.create<SearchHighlightOptions>({
  name: "searchHighlight",

  addOptions() {
    return {
      matches: [],
      currentIndex: 0,
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchHighlightPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, oldSet) => {
            // Map decorations through document changes
            const set = oldSet.map(tr.mapping, tr.doc);

            // Check if we need to update decorations (from transaction meta)
            const meta = tr.getMeta(searchHighlightPluginKey);
            if (meta !== undefined) {
              return meta.decorationSet;
            }

            return set;
          },
        },
        props: {
          decorations: (state) => {
            return searchHighlightPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});


// Data source for preview mode — bypasses NotesContext
export interface PreviewModeData {
  content: string | null;
  title: string;
  filePath: string;
  modified: number;
  hasExternalChanges: boolean;
  reloadVersion: number;
  save: (content: string) => Promise<void>;
  reload: () => Promise<void>;
}

interface EditorProps {
  sidebarVisible?: boolean;
  rightSidebarVisible?: boolean;
  focusMode?: boolean;
  hideTitleBar?: boolean;
  previewMode?: PreviewModeData;
  onEditorReady?: (editor: TiptapEditor | null) => void;
  onSaveToFolder?: () => void;
  saveToFolderDisabled?: boolean;
}

/**
 * Get character offsets where each top-level block starts in markdown.
 * Blocks are separated by blank lines, with awareness of code fences
 * and ATX headings.
 */
function getMarkdownBlockOffsets(md: string): number[] {
  const offsets: number[] = [];
  const lines = md.split("\n");
  let pos = 0;
  let prevBlank = true; // treat doc start as preceded by blank
  let inCodeFence = false;

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (inCodeFence) {
      // Only look for closing fence; don't start new blocks inside code
      if (trimmed.startsWith("```")) {
        inCodeFence = false;
      }
    } else if (trimmed.startsWith("```")) {
      // Opening fence is always a block start
      offsets.push(pos);
      inCodeFence = true;
      prevBlank = false;
    } else {
      const isBlank = trimmed === "";
      // Start a new block after a blank line, or for ATX headings
      if (!isBlank && (prevBlank || trimmed.startsWith("#"))) {
        offsets.push(pos);
      }
      prevBlank = isBlank;
    }

    pos += line.length + 1;
  }

  return offsets;
}

/** ProseMirror position at the start of the Nth top-level block. */
function blockIndexToPos(
  doc: { childCount: number; child: (i: number) => { nodeSize: number } },
  blockIndex: number,
): number {
  const idx = Math.max(0, Math.min(blockIndex, doc.childCount - 1));
  let pos = 1; // 1 for doc opening token
  for (let i = 0; i < idx; i++) {
    pos += doc.child(i).nodeSize;
  }
  return pos;
}

export function Editor({
  sidebarVisible,
  rightSidebarVisible,
  focusMode,
  hideTitleBar,
  onEditorReady,
  previewMode,
  onSaveToFolder: _onSaveToFolder,
  saveToFolderDisabled: _saveToFolderDisabled,
}: EditorProps) {
  // Always call the hook (rules of hooks), but it returns null outside NotesProvider
  const notesCtx = useOptionalNotes();

  const currentNote = previewMode
    ? previewMode.content !== null
      ? {
          id: previewMode.filePath,
          title: previewMode.title,
          content: previewMode.content,
          path: previewMode.filePath,
          modified: previewMode.modified,
        }
      : null
    : (notesCtx?.currentNote ?? null);

  const saveNote = previewMode
    ? async (content: string, _noteId?: string) => {
        await previewMode.save(content);
      }
    : notesCtx!.saveNote;

  const createNote = notesCtx?.createNote;
  const consumePendingNewNote = notesCtx?.consumePendingNewNote;
  const hasExternalChanges = previewMode
    ? previewMode.hasExternalChanges
    : notesCtx!.hasExternalChanges;
  const reloadCurrentNote = previewMode
    ? previewMode.reload
    : notesCtx!.reloadCurrentNote;
  const reloadVersion = previewMode
    ? previewMode.reloadVersion
    : notesCtx!.reloadVersion;
  const notes = notesCtx?.notes;
  const { textDirection } = useTheme();
  const [isSaving, setIsSaving] = useState(false);
  const [localTitle, setLocalTitle] = useState("");
  // Delay transition classes until after initial mount to avoid format bar height animation on note load
  const [hasTransitioned, setHasTransitioned] = useState(false);
  useEffect(() => {
    if (!hasTransitioned && currentNote) {
      const id = requestAnimationFrame(() => setHasTransitioned(true));
      return () => cancelAnimationFrame(id);
    }
  }, [hasTransitioned, currentNote]);

  // Delay format bar / header transitions only when the sidebar needs to animate closed
  const needsSidebarDelay = focusMode && sidebarVisible;
  const isSidebarActive = sidebarVisible && !focusMode;
  // Source mode state
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceContent, setSourceContent] = useState("");
  const sourceTimeoutRef = useRef<number | null>(null);
  const sourceModeTransitionRef = useRef<{
    topBlockIndex: number;
    cursorBlockIndex: number;
    md?: string;
  } | null>(null);
  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [tableContextMenu, setTableContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [searchMatches, setSearchMatches] = useState<
    Array<{ from: number; to: number }>
  >([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const linkPopupRef = useRef<TippyInstance | null>(null);
  const blockMathPopupRef = useRef<TippyInstance | null>(null);
  const isLoadingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<TiptapEditor | null>(null);
  const currentNoteIdRef = useRef<string | null>(null);
  // Track if we need to save (use ref to avoid computing markdown on every keystroke)
  const needsSaveRef = useRef(false);
  // Stable refs for wikilink click handler (avoids re-registering listener on every notes change)
  const notesRef = useRef(notes);
  const notesCtxRef = useRef(notesCtx);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    notesCtxRef.current = notesCtx;
  }, [notesCtx]);

  useEffect(() => {
    if (!tableContextMenu) return;
    const closeMenu = () => setTableContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [tableContextMenu]);

  // Keep ref in sync with the committed current note ID.
  useEffect(() => {
    currentNoteIdRef.current = currentNote?.id ?? null;
  }, [currentNote?.id]);

  // Get markdown from editor
  const getMarkdown = useCallback(
    (editorInstance: ReturnType<typeof useEditor>) => {
      if (!editorInstance) return "";
      let markdown = "";
      const manager = editorInstance.storage.markdown?.manager;
      if (manager) {
        markdown = manager.serialize(editorInstance.getJSON());
        // Clean up nbsp entities that TipTap inserts (especially in table cells)
        markdown = markdown.replace(/&nbsp;|&#160;/g, " ");
      } else {
        // Fallback to plain text
        markdown = editorInstance.getText();
      }
      
      // If we have a localTitle, prepend it as an H1
      const trimmedTitle = localTitle.trim();
      if (trimmedTitle) {
        // Don't double-prepend if it somehow already starts with an H1
        // though our strip logic should prevent this
        if (!markdown.startsWith(`# ${trimmedTitle}\n`)) {
          markdown = `# ${trimmedTitle}\n\n${markdown}`;
        }
      }
      return markdown;
    },
    [localTitle],
  );



  // Find all matches for search query (case-insensitive)
  const findMatches = useCallback(
    (query: string, editorInstance: TiptapEditor | null) => {
      if (!editorInstance || !query.trim()) return [];

      const doc = editorInstance.state.doc;
      const lowerQuery = query.toLowerCase();
      const matches: Array<{ from: number; to: number }> = [];

      // Search through each text node
      doc.descendants((node, nodePos) => {
        if (node.isText && node.text) {
          const text = node.text;
          const lowerText = text.toLowerCase();

          let searchPos = 0;
          while (searchPos < lowerText.length && matches.length < 500) {
            const index = lowerText.indexOf(lowerQuery, searchPos);
            if (index === -1) break;

            const matchFrom = nodePos + index;
            const matchTo = matchFrom + query.length;

            // Make sure the match doesn't extend beyond valid document bounds
            if (matchTo <= doc.content.size) {
              matches.push({
                from: matchFrom,
                to: matchTo,
              });
            }

            searchPos = index + 1;
          }
        }
      });

      return matches;
    },
    [],
  );

  // Update search decorations - applies yellow backgrounds to all matches
  const updateSearchDecorations = useCallback(
    (
      matches: Array<{ from: number; to: number }>,
      currentIndex: number,
      editorInstance: TiptapEditor | null,
    ) => {
      if (!editorInstance) return;

      try {
        const { state } = editorInstance;
        const decorations: Decoration[] = [];

        // Add decorations for all matches
        matches.forEach((match, index) => {
          const isActive = index === currentIndex;
          decorations.push(
            Decoration.inline(match.from, match.to, {
              class: isActive ? "search-match-active" : "search-match",
            }),
          );
        });

        const decorationSet = DecorationSet.create(state.doc, decorations);

        // Update decorations via transaction
        const tr = state.tr.setMeta(searchHighlightPluginKey, {
          decorationSet,
        });

        editorInstance.view.dispatch(tr);

        // Scroll to current match
        if (matches[currentIndex]) {
          const match = matches[currentIndex];
          const { node } = editorInstance.view.domAtPos(match.from);
          const element =
            node.nodeType === Node.ELEMENT_NODE
              ? (node as HTMLElement)
              : node.parentElement;

          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      } catch (error) {
        console.error("Failed to update search decorations:", error);
      }
    },
    [],
  );

  // Immediate save function (used for flushing)
  const saveImmediately = useCallback(
    async (noteId: string, content: string) => {
      setIsSaving(true);
      try {
        lastSaveRef.current = { noteId, content };
        await saveNote(content, noteId);
      } finally {
        setIsSaving(false);
      }
    },
    [saveNote],
  );

  // Flush any pending save immediately (saves to the note currently loaded in editor)
  const flushPendingSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Use loadedNoteIdRef (the note in the editor) not currentNoteIdRef (which may have changed)
    if (needsSaveRef.current && editorRef.current && loadedNoteIdRef.current) {
      needsSaveRef.current = false;
      const markdown = getMarkdown(editorRef.current);
      await saveImmediately(loadedNoteIdRef.current, markdown);
    }
  }, [saveImmediately, getMarkdown]);

  // Schedule a debounced save (markdown computed only when timer fires)
  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const savingNoteId = currentNote?.id;
    if (!savingNoteId) return;

    needsSaveRef.current = true;

    saveTimeoutRef.current = window.setTimeout(async () => {
      if (currentNoteIdRef.current !== savingNoteId || !needsSaveRef.current) {
        return;
      }

      // Compute markdown only now, when we actually save
      if (editorRef.current) {
        needsSaveRef.current = false;
        const markdown = getMarkdown(editorRef.current);
        await saveImmediately(savingNoteId, markdown);
      }
    }, 500);
  }, [saveImmediately, getMarkdown, currentNote?.id]);

  const closeBlockMathPopup = useCallback(() => {
    if (blockMathPopupRef.current) {
      blockMathPopupRef.current.destroy();
      blockMathPopupRef.current = null;
    }
  }, []);

  const handleEditBlockMath = useCallback(
    (pos: number) => {
      const currentEditor = editorRef.current;
      if (!currentEditor) return;

      if (linkPopupRef.current) {
        linkPopupRef.current.destroy();
        linkPopupRef.current = null;
      }
      closeBlockMathPopup();

      const node = currentEditor.state.doc.nodeAt(pos);
      if (!node || node.type.name !== "blockMath") {
        return;
      }

      const virtualElement = {
        getBoundingClientRect: () => {
          const nodeDom = currentEditor.view.nodeDOM(pos);
          if (nodeDom instanceof HTMLElement) {
            return nodeDom.getBoundingClientRect();
          }

          const start = currentEditor.view.coordsAtPos(pos);
          const end = currentEditor.view.coordsAtPos(pos + node.nodeSize);
          const left = Math.min(start.left, end.left);
          const top = Math.min(start.top, end.top);
          const right = Math.max(start.right, end.right);
          const bottom = Math.max(start.bottom, end.bottom);

          return {
            width: Math.max(2, right - left),
            height: Math.max(20, bottom - top),
            top,
            left,
            right,
            bottom,
            x: left,
            y: top,
            toJSON: () => ({}),
          } as DOMRect;
        },
      };

      const component = new ReactRenderer(BlockMathEditor, {
        props: {
          initialLatex: String(node.attrs.latex ?? ""),
          onSubmit: (latex: string) => {
            const trimmed = latex.trim();
            if (!trimmed) {
              toast.error("Please enter a formula.");
              return;
            }
            currentEditor
              .chain()
              .focus()
              .updateBlockMath({ pos, latex: trimmed })
              .setTextSelection(pos + node.nodeSize)
              .run();
            closeBlockMathPopup();
          },
          onCancel: () => {
            // Move cursor after the node instead of restoring the NodeSelection,
            // which would re-trigger native DOM selection highlight bleed
            currentEditor
              .chain()
              .focus()
              .setTextSelection(pos + node.nodeSize)
              .run();
            closeBlockMathPopup();
          },
        },
        editor: currentEditor,
      });

      blockMathPopupRef.current = tippy(document.body, {
        getReferenceClientRect: () =>
          virtualElement.getBoundingClientRect() as DOMRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
        offset: [0, 8],
        onDestroy: () => {
          component.destroy();
        },
      });
    },
    [closeBlockMathPopup],
  );

  const handleAddBlockMath = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;

    closeBlockMathPopup();
    if (linkPopupRef.current) {
      linkPopupRef.current.destroy();
      linkPopupRef.current = null;
    }
    const { selection, doc } = currentEditor.state;
    const { from, to, empty, $from } = selection;

    if (
      selection instanceof NodeSelection &&
      selection.node.type.name === "blockMath"
    ) {
      handleEditBlockMath(from);
      return;
    }

    if (!empty) {
      const selectedNode = doc.nodeAt(from);
      if (
        selectedNode?.type.name === "blockMath" &&
        from + selectedNode.nodeSize === to
      ) {
        handleEditBlockMath(from);
        return;
      }
    }

    if (empty) {
      const nodeBefore = $from.nodeBefore;
      if (nodeBefore?.type.name === "blockMath") {
        handleEditBlockMath(from - nodeBefore.nodeSize);
        return;
      }
      const nodeAfter = $from.nodeAfter;
      if (nodeAfter?.type.name === "blockMath") {
        handleEditBlockMath(from);
        return;
      }
    }

    const selectedText = empty ? "" : doc.textBetween(from, to, "\n");
    const initialLatex = normalizeBlockMath(selectedText);
    const targetRange = { from, to };
    const hasSelection = from !== to;

    const virtualElement = {
      getBoundingClientRect: () => {
        if (hasSelection) {
          const startPos = currentEditor.view.domAtPos(from);
          const endPos = currentEditor.view.domAtPos(to);

          if (startPos && endPos) {
            try {
              const range = document.createRange();
              range.setStart(startPos.node, startPos.offset);
              range.setEnd(endPos.node, endPos.offset);
              return range.getBoundingClientRect();
            } catch (error) {
              console.error("Block math range creation failed:", error);
            }
          }
        }

        const coords = currentEditor.view.coordsAtPos(from);
        return {
          width: 2,
          height: 20,
          top: coords.top,
          left: coords.left,
          right: coords.right,
          bottom: coords.bottom,
          x: coords.left,
          y: coords.top,
          toJSON: () => ({}),
        } as DOMRect;
      },
    };

    const component = new ReactRenderer(BlockMathEditor, {
      props: {
        initialLatex,
        onSubmit: (latex: string) => {
          const normalizedLatex = latex.trim();
          if (!normalizedLatex) {
            toast.error("Please enter a formula.");
            return;
          }

          const inserted = currentEditor
            .chain()
            .focus()
            .insertContentAt(targetRange, {
              type: "blockMath",
              attrs: { latex: normalizedLatex },
            })
            .command(({ state, tr, dispatch }) => {
              if (!dispatch) return true;

              const { $to } = tr.selection;
              if ($to.nodeAfter?.isTextblock) {
                tr.setSelection(TextSelection.create(tr.doc, $to.pos + 1));
                tr.scrollIntoView();
                return true;
              }

              const paragraphType =
                state.schema.nodes.paragraph ??
                $to.parent.type.contentMatch.defaultType;
              const paragraphNode = paragraphType?.create();
              const insertPos = $to.nodeAfter ? $to.pos : $to.end();

              if (paragraphNode) {
                const $insertPos = tr.doc.resolve(insertPos);
                if (
                  $insertPos.parent.canReplaceWith(
                    $insertPos.index(),
                    $insertPos.index(),
                    paragraphNode.type,
                  )
                ) {
                  tr.insert(insertPos, paragraphNode);
                  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
                  tr.scrollIntoView();
                  return true;
                }
              }

              tr.scrollIntoView();
              return true;
            })
            .run();

          if (inserted) {
            closeBlockMathPopup();
          }
        },
        onCancel: () => {
          currentEditor.commands.focus();
          closeBlockMathPopup();
        },
      },
      editor: currentEditor,
    });

    blockMathPopupRef.current = tippy(document.body, {
      getReferenceClientRect: () =>
        virtualElement.getBoundingClientRect() as DOMRect,
      appendTo: () => document.body,
      content: component.element,
      showOnCreate: true,
      interactive: true,
      trigger: "manual",
      placement: "bottom-start",
      offset: [0, 8],
      onDestroy: () => {
        component.destroy();
      },
    });
  }, [closeBlockMathPopup, handleEditBlockMath]);

  const editor = useEditor({
    textDirection,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        codeBlock: false,
      }),
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      }).configure({
        lowlight,
        defaultLanguage: null,
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "underline cursor-pointer",
        },
      }),
      // Convert markdown link syntax [text](url) into real links when typed
      Extension.create({
        name: "markdownLinkInputRule",
        addInputRules() {
          return [
            new InputRule({
              find: /\[([^\]]+)\]\(([^)]+)\)$/,
              handler: ({ state, range, match, commands }) => {
                const [, text, rawUrl] = match;
                const url = normalizeUrl(rawUrl);
                commands.command(({ tr }) => {
                  const linkMark = state.schema.marks.link.create({
                    href: url,
                  });
                  const textNode = state.schema.text(text, [linkMark]);
                  tr.replaceWith(range.from, range.to, textNode);
                  return true;
                });
              },
            }),
          ];
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      TableKit.configure({
        table: {
          resizable: false,
          HTMLAttributes: {
            class: "not-prose",
          },
        },
      }),
      Frontmatter,
      Markdown.configure({}),
      SearchHighlight.configure({
        matches: [],
        currentIndex: 0,
      }),
      SlashCommand,
      Wikilink,
      WikilinkSuggestion,
      ScratchBlockMath.configure({
        katexOptions: {
          throwOnError: false,
          displayMode: true,
          macros: katexMacros,
        },
        onClick: (_node, pos) => {
          handleEditBlockMath(pos);
        },
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose prose-lg dark:prose-invert max-w-3xl mx-auto focus:outline-none min-h-full px-6 pt-8 pb-24",
        spellcheck: "true",
        autocorrect: "on",
        autocapitalize: "sentences",
      },
      // Serialize copied text as markdown instead of plain text
      clipboardTextSerializer: (slice) => {
        const fallback = slice.content.textBetween(
          0,
          slice.content.size,
          "\n\n",
        );
        const currentEditor = editorRef.current;
        const manager = currentEditor?.storage.markdown?.manager;
        if (!currentEditor || !manager) return fallback;
        try {
          const doc = currentEditor.schema.topNodeType.create(
            null,
            slice.content,
          );
          return manager.serialize(doc.toJSON());
        } catch {
          return fallback;
        }
      },
      // Trap Tab key inside the editor
      handleKeyDown: (_view, event) => {
        if (event.key === "Tab") {
          // Allow default tab behavior (indent in lists, etc.)
          // but prevent focus from leaving the editor
          return false;
        }
        return false;
      },
      // Handle markdown and image paste
      handlePaste: (_view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        // Check for images first
        const items = Array.from(clipboardData.items);
        const imageItem = items.find((item) => item.type.startsWith("image/"));

        if (imageItem) {
          const blob = imageItem.getAsFile();
          if (blob) {
            // Convert blob to base64 and handle async operations
            const reader = new FileReader();
            reader.onload = async () => {
              const base64 = (reader.result as string).split(",")[1]; // Remove data:image/...;base64, prefix

              try {
                // Save clipboard image
                const relativePath = await invoke<string>(
                  "save_clipboard_image",
                  { base64Data: base64 },
                );

                // Get notes folder and construct absolute path using Tauri's join
                const notesFolder = await invoke<string>("get_notes_folder");
                const absolutePath = await join(notesFolder, relativePath);

                // Convert to Tauri asset URL
                const assetUrl = convertFileSrc(absolutePath);

                // Insert image
                editorRef.current
                  ?.chain()
                  .focus()
                  .setImage({ src: assetUrl })
                  .run();
              } catch (error) {
                console.error("Failed to paste image:", error);
                toast.error("Failed to paste image");
              }
            };
            reader.onerror = () => {
              console.error("Failed to read clipboard image:", reader.error);
              toast.error("Failed to read clipboard image");
            };
            reader.readAsDataURL(blob);
            return true; // Handled
          }
        }

        // Handle markdown text paste
        const text = clipboardData.getData("text/plain");
        if (!text) return false;

        // Check if text looks like markdown (has common markdown patterns)
        const markdownPatterns =
          /^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|```|^\s*\[.*\]\(.*\)|^\s*!\[|\*\*.*\*\*|__.*__|~~.*~~|^\s*[-*_]{3,}\s*$|^\|.+\||\$\$[\s\S]+?\$\$/m;
        if (!markdownPatterns.test(text)) {
          // Not markdown, let TipTap handle it normally
          return false;
        }

        // Parse markdown and insert using editor ref
        const currentEditor = editorRef.current;
        if (!currentEditor) return false;

        const manager = currentEditor.storage.markdown?.manager;
        if (manager && typeof manager.parse === "function") {
          try {
            const parsed = manager.parse(text);
            if (parsed) {
              currentEditor.commands.insertContent(parsed);
              return true;
            }
          } catch {
            // Fall back to default paste behavior
          }
        }

        return false;
      },
    },
    onCreate: ({ editor: editorInstance }) => {
      editorRef.current = editorInstance;
    },
    onUpdate: () => {
      if (isLoadingRef.current) return;
      scheduleSave();
    },
    // Keep keystrokes in ProseMirror's rendering path. UI that depends on
    // selection state subscribes to only the formatting values it needs.
    shouldRerenderOnTransaction: false,
    // Prevent flash of unstyled content during initial render
    immediatelyRender: false,
  });

  // Track which note's content is currently loaded in the editor
  const loadedNoteIdRef = useRef<string | null>(null);
  // Track the modified timestamp of the loaded content
  const loadedModifiedRef = useRef<number | null>(null);
  // Track the last save (note ID and content) to detect our own saves vs external changes
  const lastSaveRef = useRef<{ noteId: string; content: string } | null>(null);
  // Track reloadVersion to detect manual refreshes
  const lastReloadVersionRef = useRef(0);

  // Notify parent component when editor is ready
  useEffect(() => {
    onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  // Sync notes list into editor storage for wikilink autocomplete
  useEffect(() => {
    if (!editor || !notes) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = (editor.storage as any).wikilink as
      | WikilinkStorage
      | undefined;
    if (storage) storage.notes = notes;
  }, [editor, notes]);

  // Search navigation functions (defined after editor is created)
  const goToNextMatch = useCallback(() => {
    if (searchMatches.length === 0 || !editor) return;
    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIndex);
    updateSearchDecorations(searchMatches, nextIndex, editor);
  }, [searchMatches, currentMatchIndex, editor, updateSearchDecorations]);

  const goToPreviousMatch = useCallback(() => {
    if (searchMatches.length === 0 || !editor) return;
    const prevIndex =
      (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prevIndex);
    updateSearchDecorations(searchMatches, prevIndex, editor);
  }, [searchMatches, currentMatchIndex, editor, updateSearchDecorations]);

  // Handle search query change
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const replaceCurrent = useCallback((replaceText: string) => {
    if (!editor || !searchQuery.trim()) return;

    // Recompute from current doc state to avoid stale debounced matches.
    const currentMatches = findMatches(searchQuery, editor);
    if (currentMatches.length === 0) return;

    const safeIndex = Math.min(currentMatchIndex, currentMatches.length - 1);
    const match = currentMatches[safeIndex];
    if (!match) return;

    editor.view.dispatch(
      editor.state.tr.insertText(replaceText, match.from, match.to)
    );

    const newMatches = findMatches(searchQuery, editor);
    setSearchMatches(newMatches);

    if (newMatches.length > 0) {
      // Move to the first match after the replaced range.
      const nextPos = match.from + replaceText.length;
      const nextIndex = newMatches.findIndex((m) => m.from >= nextPos);
      const resolvedIndex = nextIndex === -1 ? 0 : nextIndex;
      setCurrentMatchIndex(resolvedIndex);
      updateSearchDecorations(newMatches, resolvedIndex, editor);
    } else {
      setCurrentMatchIndex(0);
      updateSearchDecorations([], 0, editor);
    }
  }, [editor, searchQuery, currentMatchIndex, findMatches, updateSearchDecorations]);

  const replaceAll = useCallback((replaceText: string) => {
    if (!editor || !searchQuery) return;
    const currentMatches = findMatches(searchQuery, editor);
    if (currentMatches.length === 0) return;

    const tr = editor.state.tr;
    for (let i = currentMatches.length - 1; i >= 0; i--) {
      const match = currentMatches[i];
      tr.insertText(replaceText, match.from, match.to);
    }
    editor.view.dispatch(tr);

    const newMatches = findMatches(searchQuery, editor);
    setSearchMatches(newMatches);
    setCurrentMatchIndex(0);
    updateSearchDecorations(newMatches, 0, editor);
  }, [editor, searchQuery, findMatches, updateSearchDecorations]);

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(0);
      // Clear decorations when search is empty
      if (editor) {
        updateSearchDecorations([], 0, editor);
      }
      return;
    }

    const timer = setTimeout(() => {
      if (!editor) return;
      const matches = findMatches(searchQuery, editor);
      setSearchMatches(matches);
      setCurrentMatchIndex(0);
      // Always update decorations (clears old highlights when no matches)
      updateSearchDecorations(matches, 0, editor);
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery, editor, findMatches, updateSearchDecorations]);

  // Handle clicks on wikilinks and external links
  useEffect(() => {
    if (!editor) return;

    const handleEditorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check for wikilink click first (no modifier key required)
      const wikilinkEl = target.closest("[data-wikilink]");
      if (wikilinkEl) {
        e.preventDefault();
        const noteTitle = wikilinkEl.getAttribute("data-note-title");
        const currentNotes = notesRef.current;
        if (noteTitle && currentNotes) {
          const note = currentNotes.find(
            (n) => n.title.toLowerCase() === noteTitle.toLowerCase(),
          );
          if (note) {
            notesCtxRef.current?.selectNote(note.id);
          } else {
            toast.info(`Note "${noteTitle}" does not exist yet`);
          }
        }
        return;
      }

      // Prevent links from opening unless Cmd/Ctrl+Click
      const link = target.closest("a");
      if (link) {
        e.preventDefault();
        if ((e.metaKey || e.ctrlKey) && link.href) {
          // Use raw href attribute and normalize to handle protocol-less URLs
          const rawHref = link.getAttribute("href") ?? "";
          const normalizedHref = normalizeUrl(rawHref);
          if (isAllowedUrlScheme(normalizedHref)) {
            openUrl(normalizedHref).catch((error) =>
              console.error("Failed to open link:", error),
            );
          } else {
            toast.error("Cannot open links with this URL scheme");
          }
        }
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener("click", handleEditorClick);

    return () => {
      editorElement.removeEventListener("click", handleEditorClick);
    };
  }, [editor]);

  // Load note content when the current note changes
  useEffect(() => {
    // Skip if no note or editor
    if (!currentNote || !editor) {
      return;
    }

    const isSameNote = currentNote.id === loadedNoteIdRef.current;

    // Detect rename BEFORE flush to prevent stale-ID saves from creating duplicates.
    // When a save renames the file (title changed), the ID changes but we're still
    // editing the same note. Update loadedNoteIdRef first so any flush uses the new ID.
    if (!isSameNote) {
      const lastSave = lastSaveRef.current;
      if (
        lastSave?.noteId === loadedNoteIdRef.current &&
        lastSave?.content === currentNote.content
      ) {
        loadedNoteIdRef.current = currentNote.id;
        loadedModifiedRef.current = currentNote.modified;
        lastSaveRef.current = null;
        // If user typed during the rename, flush with the now-correct ID
        if (needsSaveRef.current) {
          flushPendingSave();
        }
        return;
      }
    }

    // Flush any pending save before switching to a different note
    if (!isSameNote && needsSaveRef.current) {
      flushPendingSave();
    }
    // Reset source mode when genuinely switching notes (renames return early above)
    if (!isSameNote) {
      setSourceMode(false);
      if (sourceTimeoutRef.current) {
        clearTimeout(sourceTimeoutRef.current);
        sourceTimeoutRef.current = null;
      }
    }
    // Check if this is a manual reload (user clicked Refresh button or pressed Cmd+R)
    const isManualReload = reloadVersion !== lastReloadVersionRef.current;

    if (isSameNote) {
      if (isManualReload) {
        // Manual reload - update the editor content
        lastReloadVersionRef.current = reloadVersion;
        loadedModifiedRef.current = currentNote.modified;
        isLoadingRef.current = true;
        // Parse title and content
        let contentToLoad = currentNote.content;
        const lines = contentToLoad.split('\n');
        if (lines.length > 0 && lines[0].startsWith('# ')) {
          setLocalTitle(lines[0].substring(2).trim());
          contentToLoad = lines.slice(1).join('\n').replace(/^\n+/, '');
        } else {
          setLocalTitle(currentNote.title || "");
        }

        const manager = editor.storage.markdown?.manager;
        if (manager) {
          try {
            const parsed = manager.parse(contentToLoad);
            editor.commands.setContent(parsed);
          } catch {
            editor.commands.setContent(contentToLoad);
          }
        } else {
          editor.commands.setContent(contentToLoad);
        }
        isLoadingRef.current = false;
        return;
      }
      // Just a save - update refs but don't reload content
      loadedModifiedRef.current = currentNote.modified;
      return;
    }

    const loadingNoteId = currentNote.id;

    loadedNoteIdRef.current = loadingNoteId;
    loadedModifiedRef.current = currentNote.modified;

    isLoadingRef.current = true;

    // Blur editor before setting content to prevent ghost cursor
    editor.commands.blur();

    // Parse title and content
    let contentToLoad = currentNote.content;
    const lines = contentToLoad.split('\n');
    if (lines.length > 0 && lines[0].startsWith('# ')) {
      setLocalTitle(lines[0].substring(2).trim());
      contentToLoad = lines.slice(1).join('\n').replace(/^\n+/, '');
    } else {
      setLocalTitle(currentNote.title || "");
    }

    // Parse markdown and set content
    const manager = editor.storage.markdown?.manager;
    if (manager) {
      try {
        const parsed = manager.parse(contentToLoad);
        editor.commands.setContent(parsed);
      } catch {
        // Fallback to plain text if parsing fails
        editor.commands.setContent(contentToLoad);
      }
    } else {
      editor.commands.setContent(contentToLoad);
    }

    // Scroll to top after content is set (must be after setContent to work reliably)
    scrollContainerRef.current?.scrollTo(0, 0);

    // Capture note ID to check in RAF callback - prevents race condition
    // if user switches notes quickly before RAF fires
    requestAnimationFrame(() => {
      // Bail if a different note started loading
      if (loadedNoteIdRef.current !== loadingNoteId) {
        return;
      }

      // Scroll again in RAF to ensure it takes effect after DOM updates
      scrollContainerRef.current?.scrollTo(0, 0);

      isLoadingRef.current = false;

      if (consumePendingNewNote?.(loadingNoteId)) {
        if (!focusAndSelectTitle(editor)) {
          editor.commands.focus("start");
        }
        return;
      }

      // For brand new empty notes, focus and select all so user can start typing
      // Skip if the note list has focus (e.g. keyboard navigation with arrow keys)
      if (contentToLoad.trim() === "") {
        const noteListFocused =
          document.activeElement?.closest("[data-note-list]");
        if (!noteListFocused) {
          editor.commands.focus("start");
          editor.commands.selectAll();
        }
      }
      // For existing notes, don't auto-focus - let user click where they want
    });
  }, [
    currentNote,
    editor,
    flushPendingSave,
    reloadVersion,
    consumePendingNewNote,
  ]);

  // Scroll to top on mount (e.g., when returning from settings)
  useEffect(() => {
    scrollContainerRef.current?.scrollTo(0, 0);
  }, []);

  // Cleanup on unmount - flush pending saves
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Flush any pending save before unmounting
      if (needsSaveRef.current && editorRef.current) {
        needsSaveRef.current = false;
        const manager = editorRef.current.storage.markdown?.manager;
        const markdown = manager
          ? manager.serialize(editorRef.current.getJSON())
          : editorRef.current.getText();
        // Fire and forget - save will complete in background
        saveNote(markdown);
      }
      if (linkPopupRef.current) {
        linkPopupRef.current.destroy();
      }
      if (blockMathPopupRef.current) {
        blockMathPopupRef.current.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run cleanup on unmount, not when saveNote changes

  // Link handlers - show inline popup at cursor position
  const handleAddLink = useCallback(() => {
    if (!editor) return;

    // Close block math popup if open (popups are mutually exclusive)
    closeBlockMathPopup();

    // Destroy existing popup if any
    if (linkPopupRef.current) {
      linkPopupRef.current.destroy();
      linkPopupRef.current = null;
    }

    // Get existing link URL if cursor is on a link
    const existingUrl = editor.getAttributes("link").href || "";

    // Get selection bounds for popup placement using DOM Range for accurate multi-line support
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;

    // Create a virtual element at the selection for tippy to anchor to
    const virtualElement = {
      getBoundingClientRect: () => {
        // For selections with text, use DOM Range for accurate bounds
        if (hasSelection) {
          const startPos = editor.view.domAtPos(from);
          const endPos = editor.view.domAtPos(to);

          if (startPos && endPos) {
            try {
              const range = document.createRange();
              range.setStart(startPos.node, startPos.offset);
              range.setEnd(endPos.node, endPos.offset);
              return range.getBoundingClientRect();
            } catch (e) {
              // Fallback if range creation fails
              console.error("Range creation failed:", e);
            }
          }
        }

        // For collapsed cursor, use coordsAtPos with proper viewport positioning
        const coords = editor.view.coordsAtPos(from);

        // Create a DOMRect-like object with proper positioning
        return {
          width: 2,
          height: 20,
          top: coords.top,
          left: coords.left,
          right: coords.right,
          bottom: coords.bottom,
          x: coords.left,
          y: coords.top,
          toJSON: () => ({}),
        } as DOMRect;
      },
    };

    // Create the link editor component
    const component = new ReactRenderer(LinkEditor, {
      props: {
        initialUrl: existingUrl,
        // Only show text input if there's no selection AND not editing an existing link
        initialText: hasSelection || existingUrl ? undefined : "",
        onSubmit: (url: string, text?: string) => {
          const normalizedUrl = normalizeUrl(url);
          if (normalizedUrl) {
            if (text !== undefined) {
              // No selection case - insert new link with text
              if (text.trim()) {
                editor
                  .chain()
                  .focus()
                  .insertContent({
                    type: "text",
                    text: text.trim(),
                    marks: [{ type: "link", attrs: { href: normalizedUrl } }],
                  })
                  .run();
              }
            } else {
              // Has selection - apply link to selection
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: normalizedUrl })
                .run();
            }
          } else {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
          }
          linkPopupRef.current?.destroy();
          linkPopupRef.current = null;
        },
        onRemove: () => {
          editor.chain().focus().extendMarkRange("link").unsetLink().run();
          linkPopupRef.current?.destroy();
          linkPopupRef.current = null;
        },
        onCancel: () => {
          editor.commands.focus();
          linkPopupRef.current?.destroy();
          linkPopupRef.current = null;
        },
      },
      editor,
    });

    // Create tippy popup
    linkPopupRef.current = tippy(document.body, {
      getReferenceClientRect: () =>
        virtualElement.getBoundingClientRect() as DOMRect,
      appendTo: () => document.body,
      content: component.element,
      showOnCreate: true,
      interactive: true,
      trigger: "manual",
      placement: "bottom-start",
      offset: [0, 8],
      onDestroy: () => {
        component.destroy();
      },
    });
  }, [editor, closeBlockMathPopup]);

  // Image handler
  const handleAddImage = useCallback(async () => {
    if (!editor) return;
    const selected = await openDialog({
      multiple: false,
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
        },
      ],
    });
    if (selected) {
      try {
        // Copy image to assets folder and get relative path (assets/filename.ext)
        const relativePath = await invoke<string>("copy_image_to_assets", {
          sourcePath: selected as string,
        });

        // Get notes folder and construct absolute path using Tauri's join
        const notesFolder = await invoke<string>("get_notes_folder");
        const absolutePath = await join(notesFolder, relativePath);

        // Convert to Tauri asset URL
        const assetUrl = convertFileSrc(absolutePath);

        // Insert image with asset URL
        editor.chain().focus().setImage({ src: assetUrl }).run();
      } catch (error) {
        console.error("Failed to add image:", error);
      }
    }
  }, [editor]);

  // Listen for slash command image insertion
  useEffect(() => {
    const handler = () => handleAddImage();
    window.addEventListener("slash-command-image", handler);
    return () => window.removeEventListener("slash-command-image", handler);
  }, [handleAddImage]);

  // Listen for slash command block math insertion
  useEffect(() => {
    const handler = () => handleAddBlockMath();
    window.addEventListener("slash-command-block-math", handler);
    return () =>
      window.removeEventListener("slash-command-block-math", handler);
  }, [handleAddBlockMath]);

  // Keyboard shortcut for Cmd+K to add link (only when editor is focused)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        // Only handle if we're in the editor
        const target = e.target as HTMLElement;
        const isInEditor = target.closest(".ProseMirror");
        if (isInEditor && editor) {
          e.preventDefault();
          handleAddLink();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleAddLink, editor]);


  // Open and focus editor search (supports repeated Cmd/Ctrl+F)
  const openEditorSearch = useCallback(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  // Cmd/Ctrl+F to open search, ⌥⌘F (macOS) / Ctrl+H to open replace
  // (works when document/editor area is focused)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const openFind =
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "f";
      // Cmd+H is reserved by macOS (Hide), so replace uses the platform
      // convention: ⌥⌘F on macOS, Ctrl+H elsewhere. e.code is checked on
      // macOS because ⌥ changes e.key to a special character ("ƒ").
      const openReplace = isMac
        ? e.metaKey && e.altKey && !e.shiftKey && e.code === "KeyF"
        : e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "h";
      if (openFind || openReplace) {
        if (!currentNote || !editor) return;

        const target = e.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();

        // Don't intercept if user is in an input/textarea (except the editor itself or search toolbar)
        if (
          (tagName === "input" || tagName === "textarea") &&
          !target.closest(".ProseMirror") &&
          !target.closest(".search-toolbar-container")
        ) {
          return;
        }

        // Don't intercept if in sidebar
        if (target.closest('[class*="sidebar"]')) {
          return;
        }

        // Open search for the editor
        e.preventDefault();
        if (openReplace) {
          setIsReplaceOpen(true);
        }
        openEditorSearch();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editor, currentNote, openEditorSearch]);

  // Clear search on note switch
  useEffect(() => {
    if (currentNote?.id) {
      setSearchOpen(false);
      setSearchQuery("");
      setReplaceQuery("");
      setIsReplaceOpen(false);
      setSearchMatches([]);
      setCurrentMatchIndex(0);
      // Clear decorations
      if (editor) {
        updateSearchDecorations([], 0, editor);
      }
    }
  }, [currentNote?.id, editor, updateSearchDecorations]);

  // Copy handlers
  const handleCopyMarkdown = useCallback(async () => {
    if (!editor) return;
    try {
      const markdown = getMarkdown(editor);
      await invoke("copy_to_clipboard", { text: markdown });
      toast.success("Copied as Markdown");
    } catch (error) {
      console.error("Failed to copy markdown:", error);
      toast.error("Failed to copy");
    }
  }, [editor, getMarkdown]);

  const handleCopyPlainText = useCallback(async () => {
    if (!editor) return;
    try {
      const markdown = getMarkdown(editor);
      const plainText = plainTextFromMarkdown(markdown);
      await invoke("copy_to_clipboard", { text: plainText });
      toast.success("Copied as plain text");
    } catch (error) {
      console.error("Failed to copy plain text:", error);
      toast.error("Failed to copy");
    }
  }, [editor, getMarkdown]);

  const handleCopyHtml = useCallback(async () => {
    if (!editor) return;
    try {
      const html = editor.getHTML();
      await invoke("copy_to_clipboard", { text: html });
      toast.success("Copied as HTML");
    } catch (error) {
      console.error("Failed to copy HTML:", error);
      toast.error("Failed to copy");
    }
  }, [editor]);

  // Download handlers
  const handleDownloadPdf = useCallback(async () => {
    if (!editor || !currentNote) return;
    try {
      await downloadPdf(editor, currentNote.title);
    } catch (error) {
      console.error("Failed to open print dialog:", error);
      toast.error("Failed to open print dialog");
    }
  }, [editor, currentNote]);

  // Listen for Cmd+P print shortcut
  useEffect(() => {
    const handler = () => handleDownloadPdf();
    window.addEventListener("print-note", handler);
    return () => window.removeEventListener("print-note", handler);
  }, [handleDownloadPdf]);

  const handleDownloadMarkdown = useCallback(async () => {
    if (!editor || !currentNote) return;
    try {
      const markdown = getMarkdown(editor);
      const saved = await downloadMarkdown(markdown, currentNote.title);
      if (saved) {
        toast.success("Markdown saved successfully");
      }
    } catch (error) {
      console.error("Failed to download markdown:", error);
      toast.error("Failed to save markdown");
    }
  }, [editor, currentNote, getMarkdown]);

  // Shared export actions used by both the editor menu and the right sidebar.
  useEffect(() => {
    const actions: Array<[string, () => void]> = [
      ["export-copy-markdown", () => void handleCopyMarkdown()],
      ["export-copy-text", () => void handleCopyPlainText()],
      ["export-copy-html", () => void handleCopyHtml()],
      ["export-markdown", () => void handleDownloadMarkdown()],
      ["export-pdf", () => void handleDownloadPdf()],
    ];
    for (const [name, action] of actions) window.addEventListener(name, action);
    return () => {
      for (const [name, action] of actions) window.removeEventListener(name, action);
    };
  }, [
    handleCopyHtml,
    handleCopyMarkdown,
    handleCopyPlainText,
    handleDownloadMarkdown,
    handleDownloadPdf,
  ]);

  // Toggle source mode — computes anchor data and toggles state;
  // focus/scroll restoration happens in the useLayoutEffect below.
  const toggleSourceMode = useCallback(() => {
    if (!editor) return;
    const container = scrollContainerRef.current;

    if (!sourceMode) {
      // === Entering source mode (TipTap → textarea) ===
      const md = getMarkdown(editor);

      // Find which top-level block is at the viewport top
      let topBlockIndex = 0;
      if (container) {
        const rect = container.getBoundingClientRect();
        try {
          const topPos = editor.view.posAtCoords({
            left: rect.left + rect.width / 2,
            top: rect.top + 10,
          });
          if (topPos) {
            const resolved = editor.state.doc.resolve(
              Math.min(topPos.pos, editor.state.doc.content.size),
            );
            topBlockIndex = resolved.index(0);
          }
        } catch {
          // posAtCoords can fail at edges
        }
      }

      // Find which block the cursor is in
      let cursorBlockIndex = 0;
      try {
        const { from } = editor.state.selection;
        const resolved = editor.state.doc.resolve(
          Math.min(from, editor.state.doc.content.size),
        );
        cursorBlockIndex = resolved.index(0);
      } catch {
        // resolve can fail at edges
      }

      sourceModeTransitionRef.current = { topBlockIndex, cursorBlockIndex, md };
      setSourceContent(md);
      setSourceMode(true);
    } else {
      // === Exiting source mode (textarea → TipTap) ===
      const textarea = container?.querySelector(
        "textarea",
      ) as HTMLTextAreaElement | null;

      // Find which block is at the top of the textarea and which has the cursor
      let topBlockIndex = 0;
      let cursorBlockIndex = 0;
      if (textarea) {
        const blockOffsets = getMarkdownBlockOffsets(sourceContent);
        const lineHeight =
          parseFloat(getComputedStyle(textarea).lineHeight) || 20;
        const topLine = Math.floor(textarea.scrollTop / lineHeight);
        const lines = sourceContent.split("\n");
        let charOffset = 0;
        for (let i = 0; i < Math.min(topLine, lines.length); i++) {
          charOffset += lines[i].length + 1;
        }
        for (let i = 0; i < blockOffsets.length; i++) {
          if (blockOffsets[i] <= charOffset) topBlockIndex = i;
          if (blockOffsets[i] <= textarea.selectionStart) cursorBlockIndex = i;
        }
      }

      sourceModeTransitionRef.current = { topBlockIndex, cursorBlockIndex };

      // Parse and set content
      const manager = editor.storage.markdown?.manager;
      if (manager) {
        try {
          const parsed = manager.parse(sourceContent);
          editor.commands.setContent(parsed);
        } catch {
          editor.commands.setContent(sourceContent);
        }
      } else {
        editor.commands.setContent(sourceContent);
      }
      setSourceMode(false);
    }
  }, [editor, sourceMode, sourceContent, getMarkdown]);

  // Restore focus and scroll position after source mode transitions.
  // useLayoutEffect runs synchronously after React commits DOM changes,
  // guaranteeing the new textarea / EditorContent is mounted.
  useLayoutEffect(() => {
    let rafId: number | undefined;
    const transition = sourceModeTransitionRef.current;
    if (!transition) {
      return () => {};
    }
    sourceModeTransitionRef.current = null;

    const container = scrollContainerRef.current;

    if (sourceMode) {
      // Just entered source mode — focus textarea and scroll to anchor block
      const textarea = container?.querySelector(
        "textarea",
      ) as HTMLTextAreaElement | null;
      if (!textarea) return () => {};

      const md = transition.md || "";

      // Place cursor at the start of the same block in markdown
      const blockOffsets = getMarkdownBlockOffsets(md);
      const cursorPos =
        transition.cursorBlockIndex < blockOffsets.length
          ? blockOffsets[transition.cursorBlockIndex]
          : md.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
      textarea.focus();

      if (transition.topBlockIndex < blockOffsets.length) {
        const charOffset = blockOffsets[transition.topBlockIndex];
        const linesBefore = md.slice(0, charOffset).split("\n").length - 1;
        const lineHeight =
          parseFloat(getComputedStyle(textarea).lineHeight) || 20;
        textarea.scrollTop = linesBefore * lineHeight;
      }
    } else if (editor) {
      // Just exited source mode — focus editor and scroll to anchor block.
      // Use rAF because EditorContent reattaches the ProseMirror view in
      // its own useEffect, which hasn't run yet during useLayoutEffect.
      rafId = requestAnimationFrame(() => {
        if (!editor.view?.dom?.isConnected) return;
        const doc = editor.state.doc;
        editor.commands.focus(
          blockIndexToPos(doc, transition.cursorBlockIndex),
        );

        // Scroll to anchor block
        const el = scrollContainerRef.current;
        if (el) {
          try {
            el.scrollTop = 0;
            const coords = editor.view.coordsAtPos(
              blockIndexToPos(doc, transition.topBlockIndex),
            );
            const containerRect = el.getBoundingClientRect();
            el.scrollTop = coords.top - containerRect.top;
          } catch {
            // coordsAtPos can fail if view isn't fully rendered
          }
        }
      });
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [sourceMode, editor]);

  // Listen for toggle-source-mode custom event (from App.tsx shortcut / command palette)
  useEffect(() => {
    const handler = () => toggleSourceMode();
    window.addEventListener("toggle-source-mode", handler);
    return () => window.removeEventListener("toggle-source-mode", handler);
  }, [toggleSourceMode]);

  // Auto-save in source mode with debounce
  const handleSourceChange = useCallback(
    (value: string) => {
      setSourceContent(value);
      if (sourceTimeoutRef.current) {
        clearTimeout(sourceTimeoutRef.current);
      }
      sourceTimeoutRef.current = window.setTimeout(async () => {
        if (currentNote) {
          setIsSaving(true);
          try {
            lastSaveRef.current = { noteId: currentNote.id, content: value };
            await saveNote(value, currentNote.id);
          } catch (error) {
            console.error("Failed to save note:", error);
            toast.error("Failed to save note");
          } finally {
            setIsSaving(false);
          }
        }
      }, 300);
    },
    [currentNote, saveNote],
  );

  if (!currentNote) {
    // Preview mode: show loading state (content not yet loaded)
    if (previewMode) {
      return (
        <div className="flex-1 flex flex-col bg-bg">
          {!isWindows && (
            <div
              className="h-10 shrink-0 flex items-end px-4 pb-1"
              data-tauri-drag-region
            ></div>
          )}
          <div className="flex-1 flex items-center justify-center">
            <SpinnerIcon className="w-6 h-6 text-text-muted animate-spin" />
          </div>
        </div>
      );
    }

    // A note is selected but not yet loaded — show loading spinner to avoid empty state flash
    if (notesCtx?.selectedNoteId) {
      return (
        <div className="flex-1 flex flex-col bg-bg">
          {!isWindows && (
            <div
              className="h-10 shrink-0 flex items-center px-3 pr-36"
              data-tauri-drag-region
            >
            </div>
          )}
          <div className="flex-1 flex items-center justify-center">
            <SpinnerIcon className="w-6 h-6 text-text-muted animate-spin" />
          </div>
        </div>
      );
    }

    // Folder mode: show empty state with "New Note" button
    return (
      <div className="flex-1 flex flex-col bg-bg">
        {/* Drag region */}
        {!isWindows && (
          <div
            className="h-10 shrink-0 flex items-center px-3 pr-36"
            data-tauri-drag-region
          >
          </div>
        )}
        <div className="flex-1 flex items-center justify-center pb-8">
          <div className="text-center text-text-muted select-none">
            <h1 className="text-2xl text-text font-serif mb-1 tracking-[-0.01em] ">
              What's on your mind?
            </h1>
            <p className="text-sm">
              Pick up where you left off, or start something new
            </p>
            {createNote && (
              <Button
                onClick={createNote}
                variant="secondary"
                size="md"
                className="mt-4"
              >
                New Note{" "}
                <span className="text-text-muted ml-1">
                  {mod}
                  {isMac ? "" : "+"}N
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalTitle(e.target.value);
    scheduleSave();
  };

  return (
    <div className="flex-1 flex flex-col bg-bg overflow-hidden">
      {/* Drag region with sidebar toggle, date and save status */}
      {!hideTitleBar && (
        <div
          className={cn(
            "h-11 shrink-0 flex items-center justify-between px-3 border-b border-border",
            !isSidebarActive && isMac && "pl-22",
            !isWindows && !rightSidebarVisible && "pr-36",
          )}
          data-tauri-drag-region
        >
        <div
          className={`flex-1 flex justify-start titlebar-no-drag min-w-0 motion-interactive ${needsSidebarDelay ? "delay-100" : ""} ${focusMode ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        >
        </div>
        <div className={`flex items-center justify-center titlebar-no-drag motion-interactive ${needsSidebarDelay ? "delay-100" : ""} ${focusMode ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
          <input
            type="text"
            value={localTitle}
            onChange={handleTitleChange}
            aria-label="Note title"
            placeholder="Untitled"
            className="text-sm font-semibold text-text bg-transparent border-none outline-none text-center rounded px-2 py-0.5 min-w-[200px]"
            spellCheck={false}
          />
        </div>

        <div
          className={`flex-1 flex justify-end items-center gap-px shrink-0 titlebar-no-drag motion-interactive ${needsSidebarDelay ? "delay-100" : ""} ${focusMode ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        >
          {hasExternalChanges ? (
            <Tooltip
              content={`External changes detected (${mod}${isMac ? "" : "+"}R to refresh)`}
            >
              <button
                onClick={reloadCurrentNote}
                className="motion-interactive h-7 px-2 flex items-center gap-1 text-xs text-text-muted hover:bg-bg-emphasis rounded-lg font-medium"
              >
                <RefreshCwIcon className="w-4 h-4 stroke-[1.6]" />
                <span>Refresh</span>
              </button>
            </Tooltip>
          ) : isSaving ? (
            <Tooltip content="Saving...">
              <div className="h-7 w-7 flex items-center justify-center">
                <SpinnerIcon className="w-4.5 h-4.5 text-text-muted/40 stroke-[1.5] animate-spin" />
              </div>
            </Tooltip>
          ) : null}
        </div>
      </div>
      )}

      {/* Editor content area with resize handles overlay */}
      <div data-editor-content-area className="flex-1 relative overflow-hidden">
        {!focusMode && !sourceMode && (
          <EditorWidthHandles containerRef={scrollContainerRef} />
        )}
        <div
          data-editor-scroll
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-y-auto overflow-x-hidden"
          dir={textDirection}
          onClick={(e) => {
            if (editor && !editor.isFocused) {
              const target = e.target as HTMLElement;
              if (
                !target.closest(".ProseMirror") &&
                !target.closest("button") &&
                !target.closest("input") &&
                !target.closest("a")
              ) {
                editor.commands.focus("end");
              }
            }
          }}
        >
          {sourceMode ? (
            /* Markdown source textarea */
            <div className="h-full">
              <textarea
                value={sourceContent}
                onChange={(e) => handleSourceChange(e.target.value)}
                aria-label="Markdown source for current note"
                wrap="off"
                dir={textDirection}
                className="w-full h-full bg-transparent text-text focus:outline-none resize-none px-6 pt-8 pb-24 mx-auto block"
                style={{
                  maxWidth: "var(--editor-max-width, 48rem)",
                  fontFamily:
                    "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Monaco, 'Courier New', monospace",
                  fontSize: "0.875em",
                  lineHeight: "var(--editor-line-height)",
                  tabSize: 2,
                }}
                spellCheck={false}
              />
            </div>
          ) : (
            <>
              {searchOpen && (
                <div className="sticky top-2 z-10 pointer-events-none pr-2 flex justify-end">
                  <div className="pointer-events-auto">
                    <SearchToolbar
                      inputRef={searchInputRef}
                      query={searchQuery}
                      onChange={handleSearchChange}
                      onNext={goToNextMatch}
                      onPrevious={goToPreviousMatch}
                      onClose={() => {
                        setSearchOpen(false);
                        setSearchQuery("");
                        setReplaceQuery("");
                        setIsReplaceOpen(false);
                        setSearchMatches([]);
                        setCurrentMatchIndex(0);
                        // Clear decorations and refocus editor
                        if (editor) {
                          updateSearchDecorations([], 0, editor);
                          editor.commands.focus();
                        }
                      }}
                      currentMatch={
                        searchMatches.length === 0 ? 0 : currentMatchIndex + 1
                      }
                      totalMatches={searchMatches.length}
                      replaceQuery={replaceQuery}
                      onReplaceChange={setReplaceQuery}
                      onReplace={() => replaceCurrent(replaceQuery)}
                      onReplaceAll={() => replaceAll(replaceQuery)}
                      isReplaceOpen={isReplaceOpen}
                      onToggleReplace={() => setIsReplaceOpen(!isReplaceOpen)}
                    />
                  </div>
                </div>
              )}
              <div
                className="h-full relative"
                onContextMenu={(event) => {
                  if (!editor) return;
                  const target = event.target as HTMLElement;
                  if (!target.closest("table")) {
                    setTableContextMenu(null);
                    return;
                  }
                  const clickPosition = editor.view.posAtCoords({
                    left: event.clientX,
                    top: event.clientY,
                  });
                  if (!clickPosition) return;
                  editor
                    .chain()
                    .focus()
                    .setTextSelection(clickPosition.pos)
                    .run();
                  event.preventDefault();
                  event.stopPropagation();
                  setTableContextMenu({ x: event.clientX, y: event.clientY });
                }}
              >
                <EditorContent editor={editor} className="h-full text-text" />
                {tableContextMenu && (
                  <div
                    role="menu"
                    aria-label="Table actions"
                    className="spell-menu fixed z-[1000] min-w-44"
                    style={{
                      left: Math.min(tableContextMenu.x, window.innerWidth - 190),
                      top: Math.min(tableContextMenu.y, window.innerHeight - 250),
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {[
                      ["Add row above", () => editor!.chain().focus().addRowBefore().run()],
                      ["Add row below", () => editor!.chain().focus().addRowAfter().run()],
                      ["Add column left", () => editor!.chain().focus().addColumnBefore().run()],
                      ["Add column right", () => editor!.chain().focus().addColumnAfter().run()],
                    ].map(([label, action]) => (
                      <button
                        key={label as string}
                        type="button"
                        role="menuitem"
                        className="spell-menu-item"
                        onClick={() => {
                          (action as () => void)();
                          setTableContextMenu(null);
                        }}
                      >
                        {label as string}
                      </button>
                    ))}
                    <div className="spell-menu-separator" />
                    {[
                      ["Delete row", () => editor!.chain().focus().deleteRow().run()],
                      ["Delete column", () => editor!.chain().focus().deleteColumn().run()],
                      ["Delete table", () => editor!.chain().focus().deleteTable().run()],
                    ].map(([label, action]) => (
                      <button
                        key={label as string}
                        type="button"
                        role="menuitem"
                        className="spell-menu-item spell-menu-item-danger"
                        onClick={() => {
                          (action as () => void)();
                          setTableContextMenu(null);
                        }}
                      >
                        {label as string}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <MobileFormattingToolbar editor={editor} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

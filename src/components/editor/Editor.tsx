import {
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
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
import { SpellTaskItem } from "./SpellTaskItem";
import { TableKit } from "@tiptap/extension-table";
import { SpellTableView } from "./SpellTableView";
import { Markdown } from "@tiptap/markdown";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import CodeBlock from "@tiptap/extension-code-block";
import { CodeBlockView } from "./CodeBlockView";
import { parseTableGrid, tableContentFromGrid } from "../../lib/tablePaste";
import { highlightMarkdown, inkMarkdown } from "../../lib/noteColors";
import { Extension, InputRule, type Content } from "@tiptap/core";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
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
import { isMac, isMobileApp } from "../../lib/platform";

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
import { FormatShortcuts } from "./FormatShortcuts";
import { plainTextFromMarkdown } from "../../lib/plainText";
import { capturePendingEditorSave, isEditorRename } from "../../lib/editorSave";
import { downloadPdf, downloadMarkdown } from "../../services/pdf";
import {
  getPublishedToken,
  needsCloudSignIn,
  publishErrorMessage,
  publishNote,
  publishedNoteUrl,
  refreshPublishedPage,
  unpublishNote,
} from "../../services/notePublish";
import { SpinnerIcon } from "../icons/velocity";
import { NoteTitlebar } from "../layout/NoteTitlebar";
import { NoNotesEmpty } from "../notes/NoNotesEmpty";

function clearNativeSelection() {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) selection.removeAllRanges();
}

/** Cursor after a leading H1 so a hidden mobile title cannot bleed a DOM highlight. */
function bodyCaretPos(doc: PMNode): number {
  const size = doc.content.size;
  const first = doc.firstChild;
  if (first?.type.name === "heading" && first.attrs.level === 1) {
    return Math.min(first.nodeSize, size);
  }
  return Math.min(1, size);
}

function collapseNoteSelection(editor: TiptapEditor) {
  const { doc } = editor.state;
  const selection = TextSelection.near(doc.resolve(bodyCaretPos(doc)), 1);
  if (!editor.state.selection.eq(selection)) {
    editor.view.dispatch(editor.state.tr.setSelection(selection));
  }
  editor.commands.blur();
  editor.view.dom.blur();
  clearNativeSelection();
}

function loadNoteContent(editor: TiptapEditor, content: Content) {
  editor
    .chain()
    .setContent(content)
    .command(({ tr }) => {
      tr.setSelection(TextSelection.near(tr.doc.resolve(bodyCaretPos(tr.doc)), 1));
      return true;
    })
    .blur()
    .run();
  editor.view.dom.blur();
  clearNativeSelection();
}

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
  focusMode?: boolean;
  hideTitleBar?: boolean;
  previewMode?: PreviewModeData;
  onEditorReady?: (editor: TiptapEditor | null) => void;
  onSaveToFolder?: () => void;
  saveToFolderDisabled?: boolean;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  showWindowControls?: boolean;
  header?: ReactNode;
  titlebarCenter?: ReactNode;
  showCompose?: boolean;
  composePlus?: boolean;
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
  focusMode,
  hideTitleBar,
  onEditorReady,
  previewMode,
  onSaveToFolder: _onSaveToFolder,
  saveToFolderDisabled: _saveToFolderDisabled,
  onToggleSidebar,
  onNewNote,
  showWindowControls = false,
  header,
  titlebarCenter,
  showCompose,
  composePlus,
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

  const consumePendingNewNote = notesCtx?.consumePendingNewNote;
  const reloadVersion = previewMode
    ? previewMode.reloadVersion
    : notesCtx!.reloadVersion;
  const notes = notesCtx?.notes;
  const { textDirection } = useTheme();

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
  const currentNoteRef = useRef(currentNote);
  // Track which note's content is currently loaded in the editor
  const loadedNoteIdRef = useRef<string | null>(null);
  const lastSaveRef = useRef<{
    noteId: string;
    content: string;
    resultId?: string;
  } | null>(null);
  const sourceModeRef = useRef(false);
  const sourceContentRef = useRef("");
  const sourceDirtyRef = useRef(false);
  const flushPendingSaveRef = useRef<() => void>(() => {});
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
    currentNoteRef.current = currentNote;
  }, [currentNote]);

  useEffect(() => {
    sourceModeRef.current = sourceMode;
  }, [sourceMode]);

  useEffect(() => {
    sourceContentRef.current = sourceContent;
  }, [sourceContent]);

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
      return markdown;
    },
    [],
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
      lastSaveRef.current = { noteId, content };
      const updated = await saveNote(content, noteId);
      if (updated && lastSaveRef.current?.noteId === noteId) {
        lastSaveRef.current = {
          ...lastSaveRef.current,
          resultId: updated.id,
        };
      }
      const active = editorRef.current;
      const note = currentNoteRef.current;
      if (!active || active.isDestroyed || !note) return;
      void refreshPublishedPage(
        currentNoteIdRef.current ?? note.id,
        note.title,
        active.getHTML(),
      ).catch(() => {});
    },
    [saveNote],
  );

  // Flush any pending save immediately (saves to the note currently loaded in editor)
  const flushPendingSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (sourceTimeoutRef.current) {
      clearTimeout(sourceTimeoutRef.current);
      sourceTimeoutRef.current = null;
    }

    const editor = editorRef.current;
    const canReadEditor = Boolean(editor && !editor.isDestroyed);
    if (!sourceModeRef.current && !canReadEditor) return;
    const markdown = sourceModeRef.current
      ? sourceContentRef.current
      : getMarkdown(editor!);
    const snapshot = capturePendingEditorSave({
      needsSave: needsSaveRef.current || sourceDirtyRef.current,
      noteId: loadedNoteIdRef.current,
      markdown,
    });
    if (!snapshot) return;
    needsSaveRef.current = false;
    sourceDirtyRef.current = false;
    void saveImmediately(snapshot.noteId, snapshot.content);
  }, [saveImmediately, getMarkdown]);

  flushPendingSaveRef.current = flushPendingSave;

  // Schedule a debounced save (markdown computed only when timer fires)
  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const savingNoteId = loadedNoteIdRef.current ?? currentNoteIdRef.current;
    if (!savingNoteId) return;

    needsSaveRef.current = true;

    saveTimeoutRef.current = window.setTimeout(() => {
      const activeId = loadedNoteIdRef.current ?? currentNoteIdRef.current;
      if (activeId !== savingNoteId || !needsSaveRef.current) {
        return;
      }
      flushPendingSave();
    }, 300);
  }, [flushPendingSave]);

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
    autofocus: false,
    textDirection,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        codeBlock: false,
      }),
      CodeBlock.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      }).configure({
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
      TextStyle.extend({
        renderMarkdown: (node, helpers) =>
          inkMarkdown(helpers.renderChildren(node), node.attrs?.color),
      }),
      Color.configure({ types: ["textStyle"] }),
      Highlight.extend({
        renderMarkdown: (node, helpers) =>
          highlightMarkdown(helpers.renderChildren(node), node.attrs?.color),
      }).configure({ multicolor: true }),
      Underline,
      FormatShortcuts,
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
      SpellTaskItem.configure({
        nested: true,
      }),
      TableKit.configure({
        table: {
          resizable: true,
          lastColumnResizable: true,
          cellMinWidth: 120,
          handleWidth: 8,
          View: SpellTableView,
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
          "prose prose-lg dark:prose-invert max-w-3xl mx-auto focus:outline-none min-h-full px-6 pt-3 pb-24",
        spellcheck: "true",
        autocorrect: "on",
        autocapitalize: "sentences",
        ...(isMobileApp ? { tabindex: "-1" } : {}),
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

        // Spreadsheet and markdown tables paste as a real table, not a blob of text.
        const text = clipboardData.getData("text/plain");
        if (text && !editorRef.current?.isActive("table")) {
          const grid = parseTableGrid(text);
          if (grid) {
            editorRef.current
              ?.chain()
              .focus()
              .insertContent(tableContentFromGrid(grid))
              .run();
            return true;
          }
        }

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

  // Track the modified timestamp of the loaded content
  const loadedModifiedRef = useRef<number | null>(null);
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

    // A title save renames the file. Stay on this document: no blur, no
    // scroll-to-top, no re-parse that wipes keystrokes typed during the save.
    if (
      isEditorRename({
        loadedNoteId: loadedNoteIdRef.current,
        nextNoteId: currentNote.id,
        lastSavedNoteId: lastSaveRef.current?.noteId ?? null,
        lastSavedResultId: lastSaveRef.current?.resultId ?? null,
      })
    ) {
      loadedNoteIdRef.current = currentNote.id;
      loadedModifiedRef.current = currentNote.modified;
      if (lastSaveRef.current) {
        lastSaveRef.current = { ...lastSaveRef.current, noteId: currentNote.id };
      }
      currentNoteIdRef.current = currentNote.id;
      if (needsSaveRef.current) {
        flushPendingSave();
      }
      return;
    }

    // Flush any pending save before switching to a different note
    if (!isSameNote && (needsSaveRef.current || sourceDirtyRef.current)) {
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
        const contentToLoad = currentNote.content;

        const manager = editor.storage.markdown?.manager;
        if (manager) {
          try {
            loadNoteContent(editor, manager.parse(contentToLoad));
          } catch {
            loadNoteContent(editor, contentToLoad);
          }
        } else {
          loadNoteContent(editor, contentToLoad);
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

    const contentToLoad = currentNote.content;

    const manager = editor.storage.markdown?.manager;
    if (manager) {
      try {
        loadNoteContent(editor, manager.parse(contentToLoad));
      } catch {
        loadNoteContent(editor, contentToLoad);
      }
    } else {
      loadNoteContent(editor, contentToLoad);
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
        if (isMobileApp) {
          collapseNoteSelection(editor);
          window.dispatchEvent(new Event("focus-mobile-note-title"));
          return;
        }
        if (!focusAndSelectTitle(editor)) {
          editor.commands.focus("start");
        }
        return;
      }

      collapseNoteSelection(editor);
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
    const flush = () => flushPendingSaveRef.current();
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
      if (linkPopupRef.current) {
        linkPopupRef.current.destroy();
      }
      if (blockMathPopupRef.current) {
        blockMathPopupRef.current.destroy();
      }
    };
  }, []);

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
        // Copy image into Attachments and get a relative path
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

  // Insert from slash menu and the note toolbar
  useEffect(() => {
    const onImage = () => handleAddImage();
    const onChecklist = () => editor?.chain().focus().toggleTaskList().run();
    const onTable = () =>
      editor
        ?.chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    window.addEventListener("slash-command-image", onImage);
    window.addEventListener("toolbar-checklist", onChecklist);
    window.addEventListener("toolbar-table", onTable);
    return () => {
      window.removeEventListener("slash-command-image", onImage);
      window.removeEventListener("toolbar-checklist", onChecklist);
      window.removeEventListener("toolbar-table", onTable);
    };
  }, [editor, handleAddImage]);

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

  const handlePublish = useCallback(async () => {
    if (!editor || !currentNote) return;
    try {
      const url = await publishNote(
        currentNote.id,
        currentNote.title,
        editor.getHTML(),
      );
      await invoke("copy_to_clipboard", { text: url });
      toast.success("Published. Link copied — anyone with it can view this note.");
    } catch (error) {
      console.error("Failed to publish note:", error);
      if (needsCloudSignIn(error)) {
        toast.error(publishErrorMessage(error));
        window.dispatchEvent(new CustomEvent("open-account-settings"));
        return;
      }
      toast.error(publishErrorMessage(error));
    }
  }, [editor, currentNote]);

  const handleCopyPublishedLink = useCallback(async () => {
    if (!currentNote) return;
    try {
      const token = await getPublishedToken(currentNote.id);
      if (!token) {
        toast.error("This note isn't published");
        return;
      }
      await invoke("copy_to_clipboard", { text: publishedNoteUrl(token) });
      toast.success("Link copied");
    } catch (error) {
      console.error("Failed to copy published link:", error);
      toast.error(publishErrorMessage(error));
    }
  }, [currentNote]);

  const handleStopPublishing = useCallback(async () => {
    if (!currentNote) return;
    try {
      await unpublishNote(currentNote.id);
      toast.success("Note is no longer public");
    } catch (error) {
      console.error("Failed to stop publishing:", error);
      toast.error(publishErrorMessage(error));
    }
  }, [currentNote]);

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
      ["note-publish", () => void handlePublish()],
      ["note-copy-published-link", () => void handleCopyPublishedLink()],
      ["note-stop-publishing", () => void handleStopPublishing()],
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
    handlePublish,
    handleCopyPublishedLink,
    handleStopPublishing,
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
      sourceContentRef.current = value;
      sourceDirtyRef.current = true;
      if (sourceTimeoutRef.current) {
        clearTimeout(sourceTimeoutRef.current);
      }
      sourceTimeoutRef.current = window.setTimeout(async () => {
        const noteId = loadedNoteIdRef.current ?? currentNote?.id;
        if (!noteId) return;
        try {
          lastSaveRef.current = { noteId, content: value };
          sourceDirtyRef.current = false;
          const updated = await saveNote(value, noteId);
          if (updated && lastSaveRef.current?.noteId === noteId) {
            lastSaveRef.current = {
              ...lastSaveRef.current,
              resultId: updated.id,
            };
          }
        } catch (error) {
          console.error("Failed to save note:", error);
          toast.error("Failed to save note");
        }
      }, 300);
    },
    [currentNote, saveNote],
  );

  const titlebar = !hideTitleBar ? (
    <NoteTitlebar
      sidebarVisible={sidebarVisible}
      focusMode={focusMode}
      onToggleSidebar={onToggleSidebar}
      onNewNote={onNewNote}
      showCompose={showCompose ?? ((!sidebarVisible && !focusMode) || !currentNote)}
      composePlus={composePlus}
      showWindowControls={showWindowControls}
      editor={editor}
      center={titlebarCenter}
    />
  ) : null;

  if (!currentNote) {
    if (previewMode) {
      return (
        <div className="flex-1 flex flex-col bg-bg">
          {titlebar}
          <div className="flex-1 flex items-center justify-center">
            <SpinnerIcon className="w-6 h-6 text-text-muted animate-spin" />
          </div>
        </div>
      );
    }

    if (notesCtx?.selectedNoteId) {
      return (
        <div className="flex-1 flex flex-col bg-bg">
          {titlebar}
          <div className="flex-1 flex items-center justify-center">
            <SpinnerIcon className="w-6 h-6 text-text-muted animate-spin" />
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col bg-bg overflow-hidden">
        {titlebar}
        <NoNotesEmpty />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg overflow-hidden">
      {titlebar}

      {/* Editor content area with resize handles overlay */}
      <div data-editor-content-area className="relative min-h-0 flex-1 overflow-hidden">
        {!focusMode && !sourceMode && !isMobileApp && (
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
                !target.closest("a") &&
                !target.closest(".journal-calendar") &&
                !target.closest(".journal-note-calendar")
              ) {
                editor.commands.focus("end");
              }
            }
          }}
        >
          {header}
          {sourceMode ? (
            /* Markdown source textarea */
            <div className="flex h-full flex-col">
              <textarea
                value={sourceContent}
                onChange={(e) => handleSourceChange(e.target.value)}
                aria-label="Markdown source for current note"
                wrap="off"
                dir={textDirection}
                className="min-h-0 w-full flex-1 bg-transparent text-text focus:outline-none resize-none px-6 pt-8 pb-24 mx-auto block"
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
                    className="spell-menu spell-popover fixed z-[1000] min-w-44"
                    style={{
                      left: Math.min(tableContextMenu.x, window.innerWidth - 190),
                      top: Math.min(tableContextMenu.y, window.innerHeight - 250),
                      "--transform-origin": "top left",
                    } as CSSProperties}
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
              
              {isMobileApp && <MobileFormattingToolbar editor={editor} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

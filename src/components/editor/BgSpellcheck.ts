import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { lintBulgarian, type BgIssue } from "../../lib/bgProofread";
import type { SpellWorkerRequest, SpellWorkerResponse } from "../../lib/bgSpell.worker";

export const bgSpellcheckKey = new PluginKey<DecorationSet>("bgSpellcheck");

const SKIP_NODES = new Set(["codeBlock", "blockMath", "wikilink", "mermaid"]);
const IGNORE_KEY = "spell-ignored-bg";

export type BgSpellcheckOptions = {
  delay: number;
  isCorrect?: (word: string) => boolean;
  suggest?: (word: string) => string[];
};

type DictionaryChecker = {
  ready: Promise<void>;
  isBad: (word: string) => boolean;
  refresh: (words: string[]) => Promise<void>;
  suggest: (word: string) => Promise<string[]>;
  ignore: (word: string) => void;
  destroy: () => void;
};

function loadIgnored(): Set<string> {
  try {
    const raw = localStorage.getItem(IGNORE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveIgnored(words: Set<string>) {
  try {
    localStorage.setItem(IGNORE_KEY, JSON.stringify([...words]));
  } catch {
    /* private mode / test env */
  }
}

function collectCyrillicWords(text: string): string[] {
  const unique = new Set<string>();
  const re = /[А-Яа-яЁёЪъЬь]+(?:-[А-Яа-яЁёЪъЬь]+)*/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match[0].length >= 2) unique.add(match[0]);
  }
  return [...unique];
}

function wordAtCursor(doc: PMNode, pos: number): { from: number; to: number } | null {
  const $pos = doc.resolve(Math.min(pos, doc.content.size));
  const text = $pos.parent.textContent;
  if (!text) return null;
  const offset = $pos.parentOffset;
  const left = text.slice(0, offset).match(/[А-Яа-яЁёЪъЬь]+$/u);
  const fromLocal = left ? offset - left[0].length : offset;
  const right = text.slice(offset).match(/^[А-Яа-яЁёЪъЬь]*/u)?.[0].length ?? 0;
  const toLocal = offset + right;
  if (fromLocal === toLocal) return null;
  return { from: $pos.start() + fromLocal, to: $pos.start() + toLocal };
}

function createWorkerChecker(): DictionaryChecker | null {
  if (typeof Worker === "undefined") return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL("../../lib/bgSpell.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return null;
  }

  let nextId = 1;
  const pending = new Map<number, (value: SpellWorkerResponse) => void>();
  const bad = new Set<string>();
  let resolveReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  let isReady = false;
  const queued: Array<() => void> = [];

  worker.addEventListener("message", (event: MessageEvent<SpellWorkerResponse>) => {
    const data = event.data;
    if (data.type === "ready") {
      isReady = true;
      resolveReady();
      queued.splice(0).forEach((run) => run());
      return;
    }
    pending.get(data.id)?.(data);
    pending.delete(data.id);
  });

  const send = (
    message:
      | { type: "check"; words: string[] }
      | { type: "suggest"; word: string }
      | { type: "ignore"; word: string },
  ) => {
    const id = nextId++;
    const request = { id, ...message } as SpellWorkerRequest;
    return new Promise<SpellWorkerResponse>((resolve) => {
      pending.set(id, resolve);
      const post = () => worker.postMessage(request);
      if (isReady) post();
      else queued.push(post);
    });
  };

  return {
    ready,
    isBad: (word) => bad.has(word) || bad.has(word.toLowerCase()),
    refresh: async (words) => {
      const response = await send({ type: "check", words });
      if (response.type !== "check") return;
      bad.clear();
      for (const word of response.bad) bad.add(word);
    },
    suggest: async (word) => {
      const response = await send({ type: "suggest", word });
      return response.type === "suggest" ? response.suggestions : [];
    },
    ignore: (word) => {
      bad.delete(word);
      bad.delete(word.toLowerCase());
      void send({ type: "ignore", word });
    },
    destroy: () => worker.terminate(),
  };
}

let activeSuggest: (word: string) => Promise<string[]> = async () => [];

export function suggestBgWord(word: string): Promise<string[]> {
  return activeSuggest(word);
}

export function issueAtCoords(editor: Editor, x: number, y: number): (BgIssue & { from: number; to: number }) | null {
  const coords = editor.view.posAtCoords({ left: x, top: y });
  if (!coords) return null;
  const set = bgSpellcheckKey.getState(editor.state);
  if (!set) return null;
  const deco = set.find(coords.pos, coords.pos)[0];
  if (!deco) return null;
  const spec = deco.spec as { issue?: BgIssue };
  if (!spec.issue) return null;
  return { ...spec.issue, from: deco.from, to: deco.to };
}

export function ignoreBgWord(word: string) {
  const ignored = loadIgnored();
  ignored.add(word.toLowerCase());
  saveIgnored(ignored);
  window.dispatchEvent(new Event("spell-rescan"));
}

export const BgSpellcheck = Extension.create<BgSpellcheckOptions>({
  name: "bgSpellcheck",

  addOptions() {
    return { delay: 300 };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const ignored = loadIgnored();

    return [
      new Plugin({
        key: bgSpellcheckKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => {
            const mapped = set.map(tr.mapping, tr.doc);
            const meta = tr.getMeta(bgSpellcheckKey) as DecorationSet | undefined;
            return meta ?? mapped;
          },
        },
        props: {
          decorations: (state) => bgSpellcheckKey.getState(state),
        },
        view: (view) => {
          let timer: ReturnType<typeof setTimeout> | null = null;
          const dictionary = options.isCorrect ? null : createWorkerChecker();

          const isCorrect = (word: string) => {
            if (ignored.has(word.toLowerCase())) return true;
            if (options.isCorrect) return options.isCorrect(word);
            if (!dictionary) return true;
            return !dictionary.isBad(word);
          };

          activeSuggest = async (word: string) => {
            if (options.suggest) return options.suggest(word);
            if (dictionary) return dictionary.suggest(word);
            return [];
          };

          const scan = async () => {
            if (dictionary) await dictionary.ready;
            if (view.isDestroyed) return;
            const { doc, selection } = view.state;
            const current = wordAtCursor(doc, selection.head);
            const words: string[] = [];
            doc.descendants((node) => {
              if (SKIP_NODES.has(node.type.name)) return false;
              if (!node.isText || !node.text) return;
              if (node.marks.some((mark) => mark.type.name === "code")) return;
              for (const word of collectCyrillicWords(node.text)) words.push(word);
            });
            if (dictionary) {
              await dictionary.refresh([...new Set(words)]);
              if (view.isDestroyed) return;
            }

            const decorations: Decoration[] = [];
            doc.descendants((node, pos) => {
              if (SKIP_NODES.has(node.type.name)) return false;
              if (!node.isText || !node.text) return;
              if (node.marks.some((mark) => mark.type.name === "code")) return;
              for (const issue of lintBulgarian(node.text, isCorrect)) {
                const from = pos + issue.from;
                const to = pos + issue.to;
                if (current && from < current.to && to > current.from) continue;
                decorations.push(
                  Decoration.inline(
                    from,
                    to,
                    {
                      class: "spell-underline",
                      "data-spell-kind": issue.kind,
                      "data-spell-word": issue.word,
                      "data-spell-fix": issue.replacement ?? "",
                    },
                    { issue },
                  ),
                );
              }
            });
            view.dispatch(
              view.state.tr.setMeta(bgSpellcheckKey, DecorationSet.create(view.state.doc, decorations)).setMeta("addToHistory", false),
            );
          };

          const schedule = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              void scan();
            }, options.delay);
          };

          const onRescan = () => schedule();
          window.addEventListener("spell-rescan", onRescan);
          schedule();

          return {
            update: (current, previous) => {
              if (
                current.state.doc.eq(previous.doc) &&
                current.state.selection.eq(previous.selection)
              ) {
                return;
              }
              schedule();
            },
            destroy: () => {
              if (timer) clearTimeout(timer);
              window.removeEventListener("spell-rescan", onRescan);
              dictionary?.destroy();
              activeSuggest = async () => [];
            },
          };
        },
      }),
    ];
  },
});

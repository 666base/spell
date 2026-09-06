import { createBgSpell } from "./bgDictionary";
import { bgAffix, bgWords } from "./bgDictionaryData";

const spell = createBgSpell(bgAffix, bgWords);

export type SpellWorkerRequest =
  | { id: number; type: "check"; words: string[] }
  | { id: number; type: "suggest"; word: string }
  | { id: number; type: "ignore"; word: string };

export type SpellWorkerResponse =
  | { id: number; type: "check"; bad: string[] }
  | { id: number; type: "suggest"; suggestions: string[] }
  | { id: number; type: "ok" }
  | { type: "ready" };

self.postMessage({ type: "ready" } satisfies SpellWorkerResponse);

self.addEventListener("message", (event: MessageEvent<SpellWorkerRequest>) => {
  const data = event.data;
  if (data.type === "check") {
    const bad = data.words.filter((word) => !spell.correct(word));
    self.postMessage({ id: data.id, type: "check", bad } satisfies SpellWorkerResponse);
    return;
  }
  if (data.type === "suggest") {
    self.postMessage({
      id: data.id,
      type: "suggest",
      suggestions: spell.suggest(data.word),
    } satisfies SpellWorkerResponse);
    return;
  }
  if (data.type === "ignore") {
    spell.add(data.word);
    self.postMessage({ id: data.id, type: "ok" } satisfies SpellWorkerResponse);
  }
});

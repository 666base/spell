import nspell from "nspell";
import { WORD_FIXES } from "./bgProofread";

export type BgSpell = {
  correct: (word: string) => boolean;
  suggest: (word: string) => string[];
  add: (word: string) => void;
};

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function createBgSpell(aff: string, dic: string): BgSpell {
  const spell = nspell(aff, dic);
  const extra = new Set<string>();

  const correct = (word: string) => {
    if (extra.has(word.toLowerCase())) return true;
    if (spell.correct(word)) return true;
    const titled = titleCase(word);
    if (titled !== word && spell.correct(titled)) return true;
    const upper = word.toUpperCase();
    return upper !== word && spell.correct(upper);
  };

  return {
    correct,
    suggest: (word: string) => {
      const fromTable = WORD_FIXES[word.toLowerCase()];
      const hunspell = spell.suggest(word);
      const unique: string[] = [];
      for (const item of [fromTable ? titleCaseIfNeeded(word, fromTable) : "", ...hunspell]) {
        if (item && !unique.includes(item)) unique.push(item);
      }
      return unique.slice(0, 6);
    },
    add: (word: string) => {
      extra.add(word.toLowerCase());
      spell.add(word);
    },
  };
}

function titleCaseIfNeeded(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original.length > 1) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

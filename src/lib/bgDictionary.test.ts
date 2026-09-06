import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createBgSpell } from "./bgDictionary";
import { bgAffix, bgWords } from "./bgDictionaryData";

describe("createBgSpell", () => {
  it("loads Hunspell files as bundled text instead of package subpaths", () => {
    expect(bgAffix.startsWith("SET UTF-8")).toBe(true);
    expect(bgWords.split("\n", 1)[0]).toMatch(/^\d+$/);
    expect(readFileSync("src/lib/bgSpell.worker.ts", "utf8")).not.toMatch(
      /from ["']dictionary-bg\//,
    );
  });

  const spell = createBgSpell(bgAffix, bgWords);

  it("accepts standard Bulgarian words and rejects nearby misspellings", () => {
    expect(spell.correct("къща")).toBe(true);
    expect(spell.correct("ще")).toBe(true);
    expect(spell.correct("някой")).toBe(true);
    expect(spell.correct("България")).toBe(true);
    expect(spell.correct("българия")).toBe(true);
    expect(spell.correct("къша")).toBe(false);
    expect(spell.correct("некой")).toBe(false);
  });

  it("prefers the built-in Bulgarian fix table in suggestions", () => {
    expect(spell.suggest("ше")).toContain("ще");
    expect(spell.suggest("некой")).toContain("някой");
  });
});

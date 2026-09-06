import { describe, expect, it } from "vitest";
import { lintBulgarian, proofreadBulgarian } from "./bgProofread";

function proofread(text: string) {
  return proofreadBulgarian(text).text;
}

describe("proofreadBulgarian", () => {
  it("leaves clean Bulgarian text unchanged aside from sentence capital", () => {
    expect(proofread("Днес времето е хубаво.")).toBe("Днес времето е хубаво.");
  });

  it("does not invent a change when there is nothing to fix", () => {
    const result = proofreadBulgarian("Днес времето е хубаво.");
    expect(result.changes).toEqual([]);
  });

  it("fixes frequent misspellings", () => {
    expect(proofread("ше дойда оше некой ден")).toBe("Ще дойда още някой ден");
    expect(proofread("тряба ништо нешто")).toBe("Трябва нищо нещо");
    expect(proofread("некъде вабще")).toBe("Някъде въобще");
    expect(proofread("срце и слнце")).toBe("Сърце и слънце");
  });

  it("writes защо, защото, дали and откъде as one word", () => {
    expect(proofread("не знам за що")).toBe("Не знам защо");
    expect(proofread("дойде за щото късно е")).toBe("Дойде, защото късно е");
    expect(proofread("да ли ще дойде")).toBe("Дали ще дойде?");
    expect(proofread("от къде си")).toBe("Откъде си?");
  });

  it("hyphenates по- and най- for comparatives, but not по време", () => {
    expect(proofread("по добър и най голям")).toBe("По-добър и най-голям");
    expect(proofread("по време на урока")).toBe("По време на урока");
    expect(proofread("най вече по скоро")).toBe("Най-вече по-скоро");
  });

  it("uses със/във before matching consonants and the short form otherwise", () => {
    expect(proofread("с сълзи в Варна")).toBe("Със сълзи във Варна");
    expect(proofread("със мама във София")).toBe("С мама в София");
  });

  it("shortens the masculine article after a preposition", () => {
    expect(proofread("на столът в градът от човекът")).toBe(
      "На стола в града от човека",
    );
    expect(proofread("за учителят към денят")).toBe("За учителя към деня");
  });

  it("does not rewrite a full article that is not after a preposition", () => {
    expect(proofread("Човекът влезе.")).toBe("Човекът влезе.");
  });

  it("puts a comma before че, защото, но and relative pronouns", () => {
    expect(proofread("Каза че ще дойде защото късно е но ще почакаме")).toBe(
      "Каза, че ще дойде, защото късно е, но ще почакаме",
    );
    expect(proofread("Книгата която чета")).toBe("Книгата, която чета");
  });

  it("does not insert a comma before и or или", () => {
    expect(proofread("Хляб и мляко или вода")).toBe("Хляб и мляко или вода");
  });

  it("ends questions with a question mark", () => {
    expect(proofread("как си.")).toBe("Как си?");
    expect(proofread("дойде ли")).toBe("Дойде ли?");
    expect(proofread("защо не пишеш")).toBe("Защо не пишеш?");
  });

  it("does not turn a statement containing или into a question", () => {
    expect(proofread("Ще пия чай или кафе.")).toBe("Ще пия чай или кафе.");
  });

  it("normalizes punctuation spacing, ellipsis, quotes and dashes", () => {
    expect(proofread('Той каза "да" ... добре - или 1 - 2.')).toBe(
      "Той каза „да“ … Добре — или 1–2.",
    );
    expect(proofread("Чакай ,моля !!")).toBe("Чакай, моля!");
  });

  it("hyphenates ordinal numbers", () => {
    expect(proofread("на 1 ви и 2 ри етаж")).toBe("На 1-ви и 2-ри етаж");
  });

  it("writes не- adjectives as one word without touching не + verb", () => {
    expect(proofread("не щастен и не правилен")).toBe("Нещастен и неправилен");
    expect(proofread("не искам да дойда")).toBe("Не искам да дойда");
  });

  it("replaces Latin lookalikes inside Cyrillic words", () => {
    expect(proofread("кoлa")).toBe("Кола");
  });

  it("leaves URLs and emails untouched", () => {
    expect(proofread("виж https://example.com и mail@test.bg")).toBe(
      "Виж https://example.com и mail@test.bg",
    );
  });

  it("keeps a decimal comma", () => {
    expect(proofread("Струва 1,5 лева.")).toBe("Струва 1,5 лева.");
  });

  it("does not capitalize after a safe abbreviation", () => {
    expect(proofread("Живее на ул. пирин.")).toBe("Живее на ул. пирин.");
  });

  it("capitalizes after a real sentence end", () => {
    expect(proofread("Стоп. после тръгваме!")).toBe("Стоп. После тръгваме!");
  });
});

describe("lintBulgarian", () => {
  it("marks a known misspelling with a replacement", () => {
    const issues = lintBulgarian("ше дойда");
    const miss = issues.find((issue) => issue.word === "ше");
    expect(miss?.kind).toBe("spelling");
    expect(miss?.replacement).toBe("ще");
  });

  it("marks a missing comma before че", () => {
    const issues = lintBulgarian("Каза че ще дойде");
    expect(issues.some((issue) => issue.kind === "punctuation" && issue.replacement?.includes("че"))).toBe(
      true,
    );
  });

  it("uses the dictionary callback for unknown Cyrillic words", () => {
    const issues = lintBulgarian("кща дойде", (word) => word !== "кща");
    expect(issues.some((issue) => issue.word === "кща" && issue.kind === "spelling")).toBe(
      true,
    );
  });

  it("does not flag a correct sentence", () => {
    expect(lintBulgarian("Днес времето е хубаво.").filter((issue) => issue.kind === "spelling")).toEqual(
      [],
    );
  });
});

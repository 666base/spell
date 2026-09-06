/**
 * Local Bulgarian proofreader. Rule-based — no network, no model.
 * Covers orthography and punctuation that can be decided without a parser.
 * Full subject/object членуване still needs syntax; only the high-confidence
 * preposition → short-article case is rewritten automatically.
 */

export type ProofreadChange = {
  rule: string;
  message: string;
};

export type ProofreadResult = {
  text: string;
  changes: ProofreadChange[];
};

const URL_RE = /https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+@[^\s]+/gi;

/** JS `\b` is ASCII-only, so Cyrillic words need an explicit letter boundary. */
const NOT_LETTER = "(?<![A-Za-zА-Яа-яЁёЪъЬь0-9])";
const NOT_LETTER_AHEAD = "(?![A-Za-zА-Яа-яЁёЪъЬь0-9])";

function words(pattern: string, flags = "giu"): RegExp {
  return new RegExp(`${NOT_LETTER}(?:${pattern})${NOT_LETTER_AHEAD}`, flags);
}

const LATIN_IN_CYRILLIC: Record<string, string> = {
  a: "а",
  A: "А",
  e: "е",
  E: "Е",
  o: "о",
  O: "О",
  p: "р",
  P: "Р",
  c: "с",
  C: "С",
  x: "х",
  X: "Х",
  y: "у",
  T: "Т",
  H: "Н",
  M: "М",
  B: "В",
  K: "К",
};

/** Frequent misspellings and fused/split errors. Keys are lowercase. */
export const WORD_FIXES: Record<string, string> = {
  ше: "ще",
  ште: "ще",
  тряба: "трябва",
  оше: "още",
  некой: "някой",
  некоя: "някоя",
  некое: "някое",
  некои: "някои",
  некъде: "някъде",
  некак: "някак",
  неколко: "няколко",
  некакъв: "някакъв",
  некаква: "някоя",
  некакво: "някакво",
  некакви: "някакви",
  ништо: "нищо",
  нешто: "нещо",
  вабще: "въобще",
  въбще: "въобще",
  вобще: "въобще",
  срце: "сърце",
  слнце: "слънце",
  млеко: "мляко",
  хлеб: "хляб",
  чоек: "човек",
  благодара: "благодаря",
  извенявай: "извинявай",
};

const PHRASE_FIXES: Array<[RegExp, string, string, string]> = [
  [words("за\\s+що"), "защо", "split-word", "„защо“ се пише слято"],
  [words("за\\s+щото"), "защото", "split-word", "„защото“ се пише слято"],
  [words("да\\s+ли"), "дали", "split-word", "„дали“ се пише слято"],
  [words("от\\s+къде"), "откъде", "split-word", "„откъде“ се пише слято"],
  [words("на\\s+къде"), "накъде", "split-word", "„накъде“ се пише слято"],
  [words("до\\s+къде"), "докъде", "split-word", "„докъде“ се пише слято"],
  [words("най\\s+вече"), "най-вече", "hyphen", "„най-вече“ се пише с тире"],
  [words("най\\s+после"), "най-после", "hyphen", "„най-после“ се пише с тире"],
  [words("най\\s+напред"), "най-напред", "hyphen", "„най-напред“ се пише с тире"],
  [words("по\\s+скоро"), "по-скоро", "hyphen", "„по-скоро“ се пише с тире"],
  [words("по\\s+нататък"), "по-нататък", "hyphen", "„по-нататък“ се пише с тире"],
  [words("по\\s+добре"), "по-добре", "hyphen", "„по-добре“ се пише с тире"],
  [words("по\\s+зле"), "по-зле", "hyphen", "„по-зле“ се пише с тире"],
];

const NE_COMPOUNDS: Record<string, string> = {
  "не щастен": "нещастен",
  "не щастлив": "нещастлив",
  "не вежлив": "невежлив",
  "не правилен": "неправилен",
  "не верен": "неверен",
  "не известен": "неизвестен",
  "не възможен": "невъзможен",
  "не необходим": "ненужен",
  "не нужен": "ненужен",
  "не ясен": "неясен",
  "не точен": "неточен",
  "не пълен": "непълен",
  "не зависимо": "независимо",
  "не зависимост": "независимост",
};

const PO_NAI_EXCEPTIONS = new Set([
  "време",
  "този",
  "тази",
  "това",
  "тези",
  "принцип",
  "правило",
  "желание",
  "възможност",
  "същество",
  "отношение",
  "начин",
  "повод",
  "подразбиране",
  "подобен",
  "подобие",
  "поръчка",
  "поръка",
  "желанието",
  "подраздел",
  "подразбира",
  "подразбиране",
  "принципа",
  "правилото",
]);

const COMPARATIVE_STEM =
  /^(добър|добра|добро|добри|голям|голяма|голямо|големи|малък|малка|малко|малки|висок|висока|високо|високи|нисък|ниска|ниско|ниски|красив|красива|красиво|красиви|силен|силна|силно|силни|слаб|слаба|слабо|слаби|стар|стара|старо|стари|млад|млада|младо|млади|нов|нова|ново|нови|бърз|бърза|бързо|бързи|бавен|бавна|бавно|бавни|лесен|лесна|лесно|лесни|труден|трудна|трудно|трудни|важен|важна|важно|важни|интересен|хубав|хубава|хубаво|хубави|лош|лоша|лошо|лоши|топъл|топла|топло|топли|студен|студена|студено|студени|дълъг|дълга|дълго|дълги|къс|къса|късо|къси|широк|широка|широко|широки|тесен|тясна|тясно|тесни|тежък|тежка|тежко|тежки|лек|лека|леко|леки|умен|умна|умно|умни|богат|беден|весел|тъжен|светъл|тъмен|чист|мръсен|близък|далечен|ранен|късен|точен|ясен|пълен|празен|жив|мъртъв|прав|крив|мек|твърд|остър|тъп|сладък|горчив|кисел|солен|гладен|жаден|уморен|болен|здрав|щастлив|нещастен|спокоен|нервен|смел|страхлив|честен|честа|често|рядък|рядко|рано|късно|добре|зле)$/iu;

const PREPOSITIONS =
  "на|в|във|от|до|за|към|при|под|над|през|зад|пред|след|без|около|между|против|въпреки|заради|относно|върху|сред|из|покрай|вместо|освен|срещу|със|с";

const COMMA_CONJUNCTIONS =
  "но|ала|ама|обаче|пък|че|защото|понеже|тъй като|ако|когато|докато|щом|за да|въпреки че|макар че|който|която|което|които|чийто|чиято|чието|чиито|където|дали";

const QUESTION_HINT = new RegExp(
  `(?:^|[.!?…]\\s)(?:как|кой|коя|кое|кои|кого|кому|чий|чия|чие|чии|кога|къде|защо|колко|какъв|каква|какво|какви|откъде|накъде|докъде|дали|нима|нали)${NOT_LETTER_AHEAD}` +
    `|(?:^|[^A-Za-zА-Яа-яЁёЪъЬь])ли${NOT_LETTER_AHEAD}`,
  "iu",
);

const SENTENCE_ABBREV = new Set([
  "г",
  "гр",
  "ул",
  "пл",
  "др",
  "пр",
  "вж",
  "срв",
  "чл",
  "ал",
  "бр",
  "млн",
  "млрд",
  "лв",
  "с",
  "т",
  "н",
  "е",
  "св",
  "проф",
  "доц",
  "инж",
]);

const CYRILLIC_RE = /[А-Яа-яЁёЪъЬьЮюЯя]/;

function record(
  changes: ProofreadChange[],
  before: string,
  after: string,
  rule: string,
  message: string,
): string {
  if (before !== after) changes.push({ rule, message });
  return after;
}

function protectTokens(text: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const next = text.replace(URL_RE, (match) => {
    const index = tokens.length;
    tokens.push(match);
    return `\u0000${index}\u0000`;
  });
  return { text: next, tokens };
}

function restoreTokens(text: string, tokens: string[]): string {
  return text.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] ?? "");
}

function mapPreserveCase(from: string, to: string): string {
  if (from === from.toUpperCase() && from.length > 1) return to.toUpperCase();
  if (from[0] === from[0].toUpperCase()) {
    return to.charAt(0).toUpperCase() + to.slice(1);
  }
  return to;
}

function fixLatinHomoglyphs(text: string): string {
  return text.replace(/[A-Za-zА-Яа-яЁёЪъЬь]+/gu, (word) => {
    if (!CYRILLIC_RE.test(word)) return word;
    return word
      .split("")
      .map((char) => LATIN_IN_CYRILLIC[char] ?? char)
      .join("");
  });
}

function fixDictionaryWords(text: string): string {
  return text.replace(/[A-Za-zА-Яа-яЁёЪъЬь]+/gu, (word) => {
    const lower = word.toLowerCase();
    const fixed = WORD_FIXES[lower];
    if (!fixed || fixed === lower) return word;
    return mapPreserveCase(word, fixed);
  });
}

function fixNeCompounds(text: string): string {
  let next = text;
  for (const [wrong, right] of Object.entries(NE_COMPOUNDS)) {
    next = next.replace(words(wrong.replace(/ /g, "\\s+")), (match) =>
      mapPreserveCase(match, right),
    );
  }
  return next;
}

function fixSsVv(text: string): string {
  let next = text;
  next = next.replace(new RegExp(`${NOT_LETTER}с\\s+(?=[сзшщцСЗШЩЦ])`, "gu"), (match) =>
    match.replace(/с\s+$/u, "със "),
  );
  next = next.replace(new RegExp(`${NOT_LETTER}С\\s+(?=[сзшщцСЗШЩЦ])`, "gu"), (match) =>
    match.replace(/С\s+$/u, "Със "),
  );
  next = next.replace(new RegExp(`${NOT_LETTER}със\\s+(?![сзшщцСЗШЩЦ])`, "gu"), (match) =>
    match.replace(/със\s+$/u, "с "),
  );
  next = next.replace(new RegExp(`${NOT_LETTER}Със\\s+(?![сзшщцСЗШЩЦ])`, "gu"), (match) =>
    match.replace(/Със\s+$/u, "С "),
  );
  next = next.replace(new RegExp(`${NOT_LETTER}в\\s+(?=[вфВФ])`, "gu"), (match) =>
    match.replace(/в\s+$/u, "във "),
  );
  next = next.replace(new RegExp(`${NOT_LETTER}В\\s+(?=[вфВФ])`, "gu"), (match) =>
    match.replace(/В\s+$/u, "Във "),
  );
  next = next.replace(new RegExp(`${NOT_LETTER}във\\s+(?![вфВФ])`, "gu"), (match) =>
    match.replace(/във\s+$/u, "в "),
  );
  next = next.replace(new RegExp(`${NOT_LETTER}Във\\s+(?![вфВФ])`, "gu"), (match) =>
    match.replace(/Във\s+$/u, "В "),
  );
  return next;
}

function fixPoNai(text: string): string {
  return text.replace(
    new RegExp(`${NOT_LETTER}(по|най)\\s+([А-Яа-яЁёЪъЬь]+)`, "giu"),
    (full, prefix: string, word: string) => {
      const lead = full.slice(0, full.length - prefix.length - 1 - word.length);
      if (PO_NAI_EXCEPTIONS.has(word.toLowerCase())) return full;
      if (!COMPARATIVE_STEM.test(word)) return full;
      const hyphenated = `${prefix}-${word}`;
      const cased =
        prefix[0] === prefix[0].toUpperCase()
          ? hyphenated.charAt(0).toUpperCase() + hyphenated.slice(1)
          : hyphenated;
      return `${lead}${cased}`;
    },
  );
}

function fixOrdinals(text: string): string {
  return text.replace(
    new RegExp(`(\\d+)\\s*(ви|ри|ти|ми|и)${NOT_LETTER_AHEAD}`, "giu"),
    "$1-$2",
  );
}

function fixArticles(text: string): string {
  const pattern = new RegExp(
    `${NOT_LETTER}(${PREPOSITIONS}) (\\p{L}+)(ът|ят)${NOT_LETTER_AHEAD}`,
    "gu",
  );
  return text.replace(pattern, (full, prep: string, stem: string, ending: string) => {
    const lead = full.slice(0, full.indexOf(prep));
    const short = ending === "ът" ? "а" : "я";
    return `${lead}${prep} ${stem}${short}`;
  });
}

function fixQuotes(text: string): string {
  let open = true;
  return text.replace(/[„“”"]/g, (char, offset, whole: string) => {
    if (char === "„") {
      open = false;
      return "„";
    }
    if (char === "“" || char === "”") {
      open = true;
      return "“";
    }
    const prev = offset === 0 ? " " : whole[offset - 1];
    const useOpen = open || /[\s(\[{]/.test(prev);
    const next = useOpen ? "„" : "“";
    open = !useOpen;
    return next;
  });
}

function fixEllipsis(text: string): string {
  return text.replace(/\.{3,}/g, "…");
}

function fixDashes(text: string): string {
  let next = text.replace(/(\d+)\s*-\s*(\d+)/g, "$1–$2");
  next = next.replace(/(\p{L}) {1,2}-- {1,2}(\p{L})/gu, "$1 — $2");
  next = next.replace(/(\p{L}) {1,2}– {1,2}(\p{L})/gu, "$1 — $2");
  next = next.replace(/(\p{L}) {1,2}- {1,2}(\p{L})/gu, "$1 — $2");
  return next;
}

function fixRepeatedPunctuation(text: string): string {
  return text
    .replace(/!{2,}/g, "!")
    .replace(/\?{2,}/g, "?")
    .replace(/,{2,}/g, ",")
    .replace(/;{2,}/g, ";");
}

function fixPunctuationSpacing(text: string): string {
  let next = text.replace(/ +([,.;:!?])/g, "$1");
  next = next.replace(/([,;:])(?=[^\s\d])/g, "$1 ");
  next = next.replace(/([.!?…])(?=[^\s.!?…”“")\]])/g, "$1 ");
  next = next.replace(/„\s+/g, "„");
  next = next.replace(/\s+“/g, "“");
  next = next.replace(/([“”])(?=[^\s,.;:!?…])/g, "$1 ");
  next = next.replace(/([^\s(„“"])\(/g, "$1 (");
  next = next.replace(/\)(?=[\p{L}])/gu, ") ");
  next = next.replace(/[^\S\n]{2,}/g, " ");
  next = next.replace(/[^\S\n]+$/gm, "");
  return next;
}

function fixCommas(text: string): string {
  const pattern = new RegExp(
    `(?<![,;:\\n„(])\\s+(${COMMA_CONJUNCTIONS})${NOT_LETTER_AHEAD}`,
    "giu",
  );
  return text.replace(pattern, ", $1");
}

function splitSentences(text: string): string[] {
  const parts: string[] = [];
  const re = /[^.!?…]+(?:[.!?…]?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    parts.push(match[0]);
  }
  return parts.length > 0 ? parts : [text];
}

function looksLikeQuestion(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (!trimmed || /[?!]/.test(trimmed)) return false;
  return QUESTION_HINT.test(trimmed);
}

function fixQuestions(text: string): string {
  return splitSentences(text)
    .map((sentence) => {
      const body = sentence.trimEnd();
      if (!looksLikeQuestion(body)) return sentence;
      if (/[?!…]$/.test(body)) return sentence;
      if (/\.$/.test(body)) return `${body.slice(0, -1)}?`;
      if (/\p{L}$/u.test(body)) return `${body}?`;
      return sentence;
    })
    .join("");
}

function capitalizeLetter(letter: string): string {
  return letter.toUpperCase();
}

function fixCapitalization(text: string): string {
  if (!text) return text;
  let next = text.replace(/^(\s*)(\p{Ll})/u, (_, space: string, letter: string) => {
    return `${space}${capitalizeLetter(letter)}`;
  });
  next = next.replace(/([.!?…])(\s+)(\p{Ll})/gu, (full, punct: string, space: string, letter: string, offset: number) => {
    if (punct !== ".") return `${punct}${space}${capitalizeLetter(letter)}`;
    const before = next.slice(0, offset);
    const word = before.match(/(\p{L}+)$/u)?.[1]?.toLowerCase();
    if (word && SENTENCE_ABBREV.has(word)) return full;
    return `${punct}${space}${capitalizeLetter(letter)}`;
  });
  return next;
}

export function proofreadBulgarian(input: string): ProofreadResult {
  if (!input) return { text: input, changes: [] };

  const protectedInput = protectTokens(input);
  let text = protectedInput.text;
  const changes: ProofreadChange[] = [];

  const run = (
    fn: (value: string) => string,
    rule: string,
    message: string,
  ) => {
    text = record(changes, text, fn(text), rule, message);
  };

  run(fixLatinHomoglyphs, "homoglyphs", "Латински букви в кирилски думи");
  run(fixDictionaryWords, "spelling", "Често срещани правописни грешки");
  for (const [pattern, replacement, rule, message] of PHRASE_FIXES) {
    const before = text;
    text = text.replace(pattern, (match) => mapPreserveCase(match, replacement));
    if (text !== before) changes.push({ rule, message });
  }
  run(fixNeCompounds, "ne-compound", "„не“ с прилагателни се пише слято");
  run(fixSsVv, "s-v", "„с/със“ и „в/във“ според следващия звук");
  run(fixPoNai, "po-nai", "„по-“ и „най-“ при сравнителна степен");
  run(fixOrdinals, "ordinal", "Редни числителни с тире: 1-ви");
  run(fixArticles, "article", "Кратък член след предлог");
  run(fixQuotes, "quotes", "Български кавички „ “");
  run(fixEllipsis, "ellipsis", "Многоточие …");
  run(fixDashes, "dash", "Тире и интервално тире");
  run(fixRepeatedPunctuation, "repeat-punct", "Повтарящи се препинателни знаци");
  run(fixPunctuationSpacing, "spacing", "Интервали около препинателни знаци");
  run(fixCommas, "comma", "Запетая пред подчинителни и противопоставителни съюзи");
  run(fixQuestions, "question", "Въпросителна при въпрос");
  run(fixCapitalization, "caps", "Главна буква след край на изречение");

  text = restoreTokens(text, protectedInput.tokens);
  return { text, changes };
}

export type BgIssueKind = "spelling" | "grammar" | "punctuation";

export type BgIssue = {
  from: number;
  to: number;
  word: string;
  kind: BgIssueKind;
  message: string;
  replacement?: string;
};

const BG_WORD_RE = /[А-Яа-яЁёЪъЬь]+(?:-[А-Яа-яЁёЪъЬь]+)*/gu;

function overlaps(a: BgIssue, b: BgIssue): boolean {
  return a.from < b.to && b.from < a.to;
}

function pushIssue(issues: BgIssue[], issue: BgIssue) {
  if (issue.from === issue.to) return;
  if (issues.some((existing) => overlaps(existing, issue))) return;
  issues.push(issue);
}

function collectRegexIssues(
  text: string,
  pattern: RegExp,
  kind: BgIssueKind,
  message: string,
  replacementFor: (match: string, groups: string[]) => string | undefined,
): BgIssue[] {
  const issues: BgIssue[] = [];
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const value = match[0];
    issues.push({
      from: match.index,
      to: match.index + value.length,
      word: value,
      kind,
      message,
      replacement: replacementFor(value, match.slice(1)),
    });
    if (match.index === re.lastIndex) re.lastIndex += 1;
  }
  return issues;
}

/** Diagnostics for live underlines. Does not rewrite the text. */
export function lintBulgarian(
  text: string,
  isCorrect?: (word: string) => boolean,
): BgIssue[] {
  if (!text) return [];
  const masked = text.replace(URL_RE, (chunk) => " ".repeat(chunk.length));
  const issues: BgIssue[] = [];

  for (const [pattern, replacement, , message] of PHRASE_FIXES) {
    for (const issue of collectRegexIssues(
      masked,
      pattern,
      "spelling",
      message,
      (match) => mapPreserveCase(match, replacement),
    )) {
      pushIssue(issues, issue);
    }
  }

  for (const [wrong, right] of Object.entries(NE_COMPOUNDS)) {
    const pattern = words(wrong.replace(/ /g, "\\s+"));
    for (const issue of collectRegexIssues(
      masked,
      pattern,
      "grammar",
      "„не“ с прилагателни се пише слято",
      (match) => mapPreserveCase(match, right),
    )) {
      pushIssue(issues, issue);
    }
  }

  const wordRe = new RegExp(BG_WORD_RE.source, "gu");
  let wordMatch: RegExpExecArray | null;
  while ((wordMatch = wordRe.exec(masked))) {
    const word = wordMatch[0];
    const lower = word.toLowerCase();
    const fixed = WORD_FIXES[lower];
    if (fixed && fixed !== lower) {
      pushIssue(issues, {
        from: wordMatch.index,
        to: wordMatch.index + word.length,
        word,
        kind: "spelling",
        message: "Правописна грешка",
        replacement: mapPreserveCase(word, fixed),
      });
    }
  }

  const grammarMatchers: Array<[RegExp, BgIssueKind, string, (match: string, groups: string[]) => string | undefined]> = [
    [
      new RegExp(`${NOT_LETTER}с\\s+(?=[сзшщцСЗШЩЦ])`, "gu"),
      "grammar",
      "Пред „с/з/ш/щ/ц“ се пише „със“",
      (match) => match.replace(/с\s+$/u, "със "),
    ],
    [
      new RegExp(`${NOT_LETTER}в\\s+(?=[вфВФ])`, "gu"),
      "grammar",
      "Пред „в/ф“ се пише „във“",
      (match) => match.replace(/в\s+$/u, "във "),
    ],
    [
      new RegExp(`${NOT_LETTER}(по|най)\\s+([А-Яа-яЁёЪъЬь]+)`, "giu"),
      "grammar",
      "„по-“ и „най-“ при сравнителна степен",
      ( _match, groups) => {
        const word = groups[1];
        if (!word || PO_NAI_EXCEPTIONS.has(word.toLowerCase()) || !COMPARATIVE_STEM.test(word)) {
          return undefined;
        }
        return `${groups[0]}-${word}`;
      },
    ],
    [
      new RegExp(`(\\d+)\\s*(ви|ри|ти|ми|и)${NOT_LETTER_AHEAD}`, "giu"),
      "punctuation",
      "Редни числителни с тире",
      (_match, groups) => `${groups[0]}-${groups[1]}`,
    ],
    [
      new RegExp(`${NOT_LETTER}(${PREPOSITIONS}) (\\p{L}+)(ът|ят)${NOT_LETTER_AHEAD}`, "gu"),
      "grammar",
      "Кратък член след предлог",
      (_match, groups) => `${groups[0]} ${groups[1]}${groups[2] === "ът" ? "а" : "я"}`,
    ],
    [
      new RegExp(`(?<![,;:\\n„(])\\s+(${COMMA_CONJUNCTIONS})${NOT_LETTER_AHEAD}`, "giu"),
      "punctuation",
      "Липсва запетая пред съюза",
      (_match, groups) => `, ${groups[0]}`,
    ],
    [
      / +([,.;:!?])/g,
      "punctuation",
      "Без интервал преди препинателен знак",
      (_match, groups) => groups[0],
    ],
    [
      /([,;:])(?=[^\s\d])/g,
      "punctuation",
      "Липсва интервал след препинателен знак",
      (_match, groups) => `${groups[0]} `,
    ],
    [
      /\.{3,}/g,
      "punctuation",
      "Многоточие …",
      () => "…",
    ],
    [
      /"([^"]+)"/g,
      "punctuation",
      "Български кавички „ “",
      (_match, groups) => `„${groups[0]}“`,
    ],
  ];

  for (const [pattern, kind, message, replace] of grammarMatchers) {
    for (const issue of collectRegexIssues(masked, pattern, kind, message, replace)) {
      if (issue.replacement === undefined) continue;
      pushIssue(issues, issue);
    }
  }

  if (isCorrect) {
    const spellingRe = new RegExp(BG_WORD_RE.source, "gu");
    let match: RegExpExecArray | null;
    while ((match = spellingRe.exec(masked))) {
      const word = match[0];
      if (word.length < 2) continue;
      if (isCorrect(word)) continue;
      pushIssue(issues, {
        from: match.index,
        to: match.index + word.length,
        word,
        kind: "spelling",
        message: "Думата липсва в българския речник",
        replacement: undefined,
      });
    }
  }

  return issues.sort((a, b) => a.from - b.from || b.to - a.to);
}

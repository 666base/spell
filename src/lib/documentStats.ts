import { plainTextFromMarkdown } from "./plainText";

export const WORDS_PER_MINUTE = 200;

export interface DocHeading {
  level: number;
  text: string;
  from: number;
}

const WORD = /[\p{L}\p{N}]+/gu;

export function countWords(text: string): number {
  const matches = text.match(WORD);
  return matches?.length ?? 0;
}

export function readingMinutes(words: number): number | null {
  if (words < WORDS_PER_MINUTE) return null;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** ATX headings outside fenced code. `from` is the character offset of the line. */
export function parseMarkdownHeadings(markdown: string): DocHeading[] {
  const headings: DocHeading[] = [];
  let inFence = false;
  let offset = 0;
  for (const line of markdown.split("\n")) {
    const trimmed = line.trimStart();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
    } else if (!inFence) {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (match) {
        const text = match[2].replace(/\s+#+$/, "").trim();
        if (text) {
          headings.push({
            level: match[1].length,
            text,
            from: offset,
          });
        }
      }
    }
    offset += line.length + 1;
  }
  return headings;
}

export function headingsFromDoc(doc: {
  descendants: (
    fn: (
      node: { type: { name: string }; attrs: { level?: unknown }; textContent: string },
      pos: number,
    ) => boolean | void,
  ) => void;
}): DocHeading[] {
  const headings: DocHeading[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const text = node.textContent.trim();
    if (!text) return;
    const level = Number(node.attrs.level);
    headings.push({
      level: Number.isFinite(level) && level > 0 ? level : 1,
      text,
      from: pos,
    });
  });
  return headings;
}

/** Current section only when the note has real structure — two or more headings. */
export function sectionForPosition(
  headings: DocHeading[],
  pos: number,
): string | null {
  if (headings.length < 2) return null;
  let current: DocHeading | undefined;
  for (const heading of headings) {
    if (heading.from <= pos) current = heading;
    else break;
  }
  return current?.text ?? null;
}

export function formatDocumentStatus(
  words: number,
  section: string | null,
  locale?: string,
): string | null {
  if (words <= 0) return null;
  const parts: string[] = [];
  if (section) parts.push(section);
  const count = words.toLocaleString(locale);
  parts.push(`${count} ${words === 1 ? "word" : "words"}`);
  const minutes = readingMinutes(words);
  if (minutes != null) parts.push(`${minutes} min`);
  return parts.join(" · ");
}

export function statusFromMarkdown(
  markdown: string,
  caret: number,
  locale?: string,
): string | null {
  return formatDocumentStatus(
    countWords(plainTextFromMarkdown(markdown)),
    sectionForPosition(parseMarkdownHeadings(markdown), caret),
    locale,
  );
}

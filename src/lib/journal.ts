import { format, isValid } from "date-fns";
import { bg } from "date-fns/locale";
import { invoke } from "@tauri-apps/api/core";
import type { NoteMetadata } from "../types/note";

export const JOURNAL_FOLDER = "journals";
const JOURNAL_ID_PATTERN = /^journals\/(\d{4})-(\d{2})-(\d{2})$/;

export function journalIdForDate(date: Date): string {
  return `${JOURNAL_FOLDER}/${format(date, "yyyy-MM-dd")}`;
}

export function parseJournalDate(id: string): Date | null {
  const match = id.match(JOURNAL_ID_PATTERN);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isValid(date) ? date : null;
}

export function journalTitleForDate(date: Date): string {
  return format(date, "d MMMM yyyy", { locale: bg });
}

export function startOfLocalDay(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function journalDatesFromNotes(notes: NoteMetadata[]): Set<string> {
  const dates = new Set<string>();
  for (const note of notes) {
    const date = parseJournalDate(note.id);
    if (date) dates.add(format(date, "yyyy-MM-dd"));
  }
  return dates;
}

export function sortJournalNotes(notes: NoteMetadata[]): NoteMetadata[] {
  return [...notes].sort((left, right) => {
    const leftDate = parseJournalDate(left.id);
    const rightDate = parseJournalDate(right.id);
    if (leftDate && rightDate) return rightDate.getTime() - leftDate.getTime();
    if (leftDate) return -1;
    if (rightDate) return 1;
    return right.modified - left.modified;
  });
}

export async function createJournalNote(date: Date): Promise<string> {
  const id = journalIdForDate(date);
  await invoke("create_folder", { path: JOURNAL_FOLDER }).catch(() => {});
  await invoke("save_note", {
    id,
    content: `# ${journalTitleForDate(date)}\n\n`,
  });
  return id;
}

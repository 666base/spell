import { describe, expect, it } from "vitest";
import {
  journalIdForDate,
  journalTitleForDate,
  parseJournalDate,
  sortJournalNotes,
} from "./journal";

describe("journal helpers", () => {
  it("builds and parses dated journal ids", () => {
    const date = new Date(2026, 7, 23);
    const id = journalIdForDate(date);
    expect(id).toBe("journals/2026-08-23");
    expect(parseJournalDate(id)?.getTime()).toBe(date.getTime());
    expect(parseJournalDate("notes/hello")).toBeNull();
  });

  it("sorts journal notes by calendar date, newest first", () => {
    const sorted = sortJournalNotes([
      { id: "journals/2026-08-01", title: "1", preview: "", modified: 3 },
      { id: "journals/2026-08-23", title: "23", preview: "", modified: 1 },
      { id: "journals/2026-08-10", title: "10", preview: "", modified: 9 },
    ]);
    expect(sorted.map((note) => note.id)).toEqual([
      "journals/2026-08-23",
      "journals/2026-08-10",
      "journals/2026-08-01",
    ]);
  });

  it("uses the date as the empty daily-note title", () => {
    expect(journalTitleForDate(new Date(2026, 7, 23))).toContain("23");
  });
});

import { describe, expect, it } from "vitest";
import {
  isHomeTab,
  isJournalOnlyLibrary,
  notesInScope,
  noteMoveDestinations,
  parseCloudFolderIndex,
  scopeForNote,
  selectionAfterNotesChange,
  selectionAfterScopeChange,
  serializeCloudFolderIndex,
  hidesNotesList,
} from "./notesScope";

const notes = [
  { id: "Untitled", title: "Untitled", preview: "", modified: 1 },
  { id: "Inbox/Todo", title: "Todo", preview: "", modified: 2 },
  { id: "journals/2026-08-31", title: "31", preview: "", modified: 3 },
];

describe("notesInScope", () => {
  it("lists regular notes in All and none on Home", () => {
    expect(notesInScope(notes, { type: "all" }).map((note) => note.id)).toEqual([
      "Untitled",
      "Inbox/Todo",
    ]);
    expect(notesInScope(notes, { type: "home" })).toEqual([]);
    expect(isHomeTab({ type: "home" })).toBe(true);
    expect(hidesNotesList({ type: "home" })).toBe(true);
    expect(hidesNotesList({ type: "money" })).toBe(true);
    expect(hidesNotesList({ type: "moneyMonth", month: "2026-09" })).toBe(true);
    expect(hidesNotesList({ type: "subscriptions" })).toBe(true);
    expect(hidesNotesList({ type: "all" })).toBe(false);
  });
});

describe("scopeForNote", () => {
  it("opens a root note in All Notes", () => {
    expect(scopeForNote("Meeting")).toEqual({ type: "all" });
  });

  it("opens a nested note in its folder", () => {
    expect(scopeForNote("Inbox/Todo")).toEqual({ type: "folder", path: "Inbox" });
  });

  it("opens a journal in the journal view", () => {
    expect(scopeForNote("journals/2026-08-31")).toEqual({ type: "journal" });
  });
});

describe("selectionAfterNotesChange", () => {
  it("keeps a newly created note instead of jumping to the first list item", () => {
    const decision = selectionAfterNotesChange({
      selectedNoteId: "Meeting",
      noteIds: ["Inbox/Todo", "Meeting"],
      scopedIds: ["Inbox/Todo"],
    });
    expect(decision).toEqual({ type: "keep" });
  });

  it("keeps a renamed note after the sidebar id has been updated", () => {
    const decision = selectionAfterNotesChange({
      selectedNoteId: "My Title",
      noteIds: ["My Title", "Other"],
      scopedIds: ["My Title", "Other"],
    });
    expect(decision).toEqual({ type: "keep" });
  });

  it("does not steal selection when a rename has not landed in the list yet", () => {
    const decision = selectionAfterNotesChange({
      selectedNoteId: "Untitled",
      noteIds: ["Meeting", "Other"],
      scopedIds: ["Meeting", "Other"],
    });
    expect(decision).toEqual({ type: "keep" });
  });

  it("selects the first scoped note when nothing is selected", () => {
    const decision = selectionAfterNotesChange({
      selectedNoteId: null,
      noteIds: ["Untitled"],
      scopedIds: ["Untitled"],
    });
    expect(decision).toEqual({ type: "select", id: "Untitled" });
  });

  it("does not steal an empty selection toward the first row while hydrating", () => {
    const decision = selectionAfterNotesChange({
      selectedNoteId: null,
      noteIds: ["Untitled"],
      scopedIds: ["Untitled"],
      hydrating: true,
    });
    expect(decision).toEqual({ type: "keep" });
  });
});

describe("selectionAfterScopeChange", () => {
  it("selects the first note in a folder that does not contain the current note", () => {
    const scoped = notesInScope(notes, { type: "folder", path: "Inbox" });
    expect(
      selectionAfterScopeChange({
        selectedNoteId: "Untitled",
        scopedIds: scoped.map((note) => note.id),
      }),
    ).toEqual({ type: "select", id: "Inbox/Todo" });
  });

  it("keeps the current note when it belongs to the new scope", () => {
    const scoped = notesInScope(notes, { type: "all" });
    expect(
      selectionAfterScopeChange({
        selectedNoteId: "Untitled",
        scopedIds: scoped.map((note) => note.id),
      }),
    ).toEqual({ type: "keep" });
  });
});

describe("isJournalOnlyLibrary", () => {
  it("is true when the cloud vault only has daily journals", () => {
    expect(
      isJournalOnlyLibrary(["journals/2026-08-31", "journals/2026-09-01"]),
    ).toBe(true);
  });

  it("is false when a phone folder note is present", () => {
    expect(
      isJournalOnlyLibrary(["journals/2026-09-01", "Projects/Task"]),
    ).toBe(false);
  });
});

describe("cloud folder index", () => {
  it("round-trips folder names and skips the journals directory", () => {
    expect(parseCloudFolderIndex(serializeCloudFolderIndex(["Projects", "journals"]))).toEqual([
      "Projects",
    ]);
  });
});

describe("noteMoveDestinations", () => {
  it("offers existing folders for a root note", () => {
    expect(noteMoveDestinations("Meeting", ["Inbox", "Work/Ideas"])).toEqual([
      { path: "Inbox", label: "Inbox" },
      { path: "Work/Ideas", label: "Work/Ideas" },
    ]);
  });

  it("offers Notes and other folders for a nested note", () => {
    expect(noteMoveDestinations("Inbox/Todo", ["Inbox", "Work"])).toEqual([
      { path: "", label: "Notes" },
      { path: "Work", label: "Work" },
    ]);
  });

  it("does not offer move targets for journals", () => {
    expect(noteMoveDestinations("journals/2026-09-06", ["Inbox"])).toEqual([]);
  });
});

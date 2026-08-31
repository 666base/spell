import { describe, expect, it } from "vitest";
import {
  notesInScope,
  scopeForNote,
  selectionAfterNotesChange,
  selectionAfterScopeChange,
} from "./notesScope";

const notes = [
  { id: "Untitled", title: "Untitled", preview: "", modified: 1 },
  { id: "Inbox/Todo", title: "Todo", preview: "", modified: 2 },
  { id: "journals/2026-08-31", title: "31", preview: "", modified: 3 },
];

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

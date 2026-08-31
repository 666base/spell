import { describe, expect, it } from "vitest";
import { capturePendingEditorSave, isEditorRename, lastWriteWins } from "./editorSave";

describe("capturePendingEditorSave", () => {
  it("round-trips the loaded note id so reload can read what was saved", () => {
    const snapshot = capturePendingEditorSave({
      needsSave: true,
      noteId: "Untitled",
      markdown: "# Hello\n\nBody",
    });
    expect(snapshot).toEqual({ noteId: "Untitled", content: "# Hello\n\nBody" });
  });

  it("does not save when there is no loaded note id (unmount without an id was dropping edits)", () => {
    expect(
      capturePendingEditorSave({
        needsSave: true,
        noteId: null,
        markdown: "# Hello",
      }),
    ).toBeNull();
  });

  it("persists empty notes", () => {
    expect(
      capturePendingEditorSave({
        needsSave: true,
        noteId: "Empty",
        markdown: "",
      }),
    ).toEqual({ noteId: "Empty", content: "" });
  });

  it("persists very large notes", () => {
    const markdown = `# Large\n\n${"x".repeat(500_000)}`;
    expect(
      capturePendingEditorSave({
        needsSave: true,
        noteId: "Big",
        markdown,
      }),
    ).toEqual({ noteId: "Big", content: markdown });
  });
});

describe("lastWriteWins", () => {
  it("coalesces rapid repeated saves of the same note", () => {
    const saved = lastWriteWins([
      { noteId: "A", content: "one" },
      { noteId: "A", content: "two" },
      { noteId: "A", content: "three" },
    ]);
    expect(saved).toEqual([{ noteId: "A", content: "three" }]);
  });

  it("keeps the latest snapshot per note when switching during an in-flight save", () => {
    const saved = lastWriteWins([
      { noteId: "A", content: "draft-a" },
      { noteId: "B", content: "draft-b" },
      { noteId: "A", content: "final-a" },
    ]);
    expect(saved).toEqual([
      { noteId: "A", content: "final-a" },
      { noteId: "B", content: "draft-b" },
    ]);
  });

  it("coalesces a rapid burst of saves on the same note", () => {
    const pending = Array.from({ length: 20 }, (_, i) => ({
      noteId: "A",
      content: `edit-${i}`,
    }));
    expect(lastWriteWins(pending)).toEqual([{ noteId: "A", content: "edit-19" }]);
  });
});

describe("isEditorRename", () => {
  it("treats a title save as the same open note even if the user kept typing", () => {
    expect(
      isEditorRename({
        loadedNoteId: "Untitled",
        nextNoteId: "Meeting",
        lastSavedNoteId: "Untitled",
        lastSavedResultId: "Meeting",
      }),
    ).toBe(true);
  });

  it("does not treat picking another note as a rename", () => {
    expect(
      isEditorRename({
        loadedNoteId: "Untitled",
        nextNoteId: "Other",
        lastSavedNoteId: "Untitled",
        lastSavedResultId: "Untitled",
      }),
    ).toBe(false);
  });

  it("does not treat creating a new note after an autosave as a rename", () => {
    expect(
      isEditorRename({
        loadedNoteId: "My note",
        nextNoteId: "Untitled-2",
        lastSavedNoteId: "My note",
        lastSavedResultId: "My note",
      }),
    ).toBe(false);
  });

  it("does not treat a new note as a rename while the previous save is still in flight", () => {
    expect(
      isEditorRename({
        loadedNoteId: "My note",
        nextNoteId: "Untitled-2",
        lastSavedNoteId: "My note",
        lastSavedResultId: null,
      }),
    ).toBe(false);
  });
});

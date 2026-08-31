import { describe, expect, it } from "vitest";
import { applyNoteListDrag, applySavedNoteToList, holdOpenNotePosition, remapNoteIds, sortNotesForList } from "./noteListOrder";

const notes = [
  { id: "old", title: "Old", preview: "", modified: 1 },
  { id: "mid", title: "Mid", preview: "", modified: 2 },
  { id: "new", title: "New", preview: "", modified: 3 },
];

describe("sortNotesForList", () => {
  it("puts newly pinned notes first, not by date", () => {
    const sorted = sortNotesForList(notes, ["old"], []);
    expect(sorted.map((note) => note.id)).toEqual(["old", "new", "mid"]);
  });

  it("keeps pin order among pinned notes", () => {
    const sorted = sortNotesForList(notes, ["old", "new"], []);
    expect(sorted.map((note) => note.id)).toEqual(["old", "new", "mid"]);
  });

  it("uses custom order for unpinned notes before date", () => {
    const sorted = sortNotesForList(notes, [], ["mid", "old"]);
    expect(sorted.map((note) => note.id)).toEqual(["mid", "old", "new"]);
  });
});

describe("applyNoteListDrag", () => {
  const visibleIds = ["pin-a", "pin-b", "u1", "u2", "u3"];
  const pinnedIds = ["pin-a", "pin-b"];

  it("reorders pinned notes", () => {
    const next = applyNoteListDrag({
      visibleIds,
      fromId: "pin-b",
      toId: "pin-a",
      pinnedIds,
      noteOrder: ["u1", "u2", "u3"],
    });
    expect(next.pinnedNoteIds).toEqual(["pin-b", "pin-a"]);
    expect(next.noteOrder).toEqual(["u1", "u2", "u3"]);
  });

  it("reorders unpinned notes", () => {
    const next = applyNoteListDrag({
      visibleIds,
      fromId: "u3",
      toId: "u1",
      pinnedIds,
      noteOrder: ["u1", "u2", "u3"],
    });
    expect(next.pinnedNoteIds).toEqual(["pin-a", "pin-b"]);
    expect(next.noteOrder).toEqual(["u3", "u1", "u2"]);
  });

  it("pins a note dropped onto the pinned group, including first", () => {
    const next = applyNoteListDrag({
      visibleIds,
      fromId: "u2",
      toId: "pin-a",
      pinnedIds,
      noteOrder: ["u1", "u2", "u3"],
    });
    expect(next.pinnedNoteIds).toEqual(["u2", "pin-a", "pin-b"]);
    expect(next.noteOrder).toEqual(["u1", "u3"]);
  });

  it("unpins a note dropped into the unpinned group", () => {
    const next = applyNoteListDrag({
      visibleIds,
      fromId: "pin-b",
      toId: "u1",
      pinnedIds,
      noteOrder: ["u1", "u2", "u3"],
    });
    expect(next.pinnedNoteIds).toEqual(["pin-a"]);
    expect(next.noteOrder).toEqual(["u1", "pin-b", "u2", "u3"]);
  });
});

describe("remapNoteIds", () => {
  it("rewrites a matching id", () => {
    expect(remapNoteIds(["a", "b"], "a", "a2")).toEqual(["a2", "b"]);
  });
});

describe("applySavedNoteToList", () => {
  it("renames the saved note in place so a title save does not look like a missing note", () => {
    const next = applySavedNoteToList(notes, "old", {
      id: "Renamed",
      title: "Renamed",
      modified: 9,
    });
    expect(next.map((note) => note.id)).toEqual(["Renamed", "mid", "new"]);
    expect(next[0].title).toBe("Renamed");
    expect(next[0].modified).toBe(1);
  });
});

describe("holdOpenNotePosition", () => {
  it("does not let the open note jump to the top after its own save", () => {
    const previous = notes;
    const incoming = [
      { id: "old", title: "Old", preview: "", modified: 99 },
      { id: "mid", title: "Mid", preview: "", modified: 2 },
      { id: "new", title: "New", preview: "", modified: 3 },
    ];
    const held = holdOpenNotePosition(previous, incoming, "old");
    expect(sortNotesForList(held, [], []).map((note) => note.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });
});

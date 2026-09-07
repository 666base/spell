import { describe, expect, it } from "vitest";
import {
  NOTE_CANVAS_EMPTY,
  NOTE_LIST_EMPTY,
  NOTE_LIST_NO_RESULTS,
  noteListEmptyLabel,
} from "./emptyNotes";

describe("empty note copy", () => {
  it("keeps the list status and the canvas invitation as different sentences", () => {
    expect(NOTE_LIST_EMPTY).toBe("Empty");
    expect(NOTE_CANVAS_EMPTY).toBe("Start a note");
    expect(NOTE_LIST_EMPTY).not.toBe(NOTE_CANVAS_EMPTY);
    expect(NOTE_LIST_NO_RESULTS).not.toBe(NOTE_CANVAS_EMPTY);
  });

  it("labels a vacant folder Empty and a failed search No Results", () => {
    expect(noteListEmptyLabel("")).toBe("Empty");
    expect(noteListEmptyLabel("   ")).toBe("Empty");
    expect(noteListEmptyLabel("alpha")).toBe("No Results");
    expect(noteListEmptyLabel("", "Nothing here")).toBe("Nothing here");
  });
});

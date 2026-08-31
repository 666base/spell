import { describe, expect, it } from "vitest";
import {
  dropModeFor,
  folderParentPath,
  isInsideFolder,
  noteParentFolder,
  parseLibraryId,
} from "./libraryDnd";

describe("parseLibraryId", () => {
  it("parses notes, folders, and root targets", () => {
    expect(parseLibraryId("note:Work/Ideas")).toEqual({ kind: "note", id: "Work/Ideas" });
    expect(parseLibraryId("folder:Work")).toEqual({ kind: "folder", path: "Work" });
    expect(parseLibraryId("drop-root")).toEqual({ kind: "root" });
    expect(parseLibraryId("drop-all")).toEqual({ kind: "root" });
  });
});

describe("library path helpers", () => {
  it("finds parents and containment", () => {
    expect(noteParentFolder("Work/Ideas")).toBe("Work");
    expect(noteParentFolder("Inbox")).toBe("");
    expect(folderParentPath("Work/Clients")).toBe("Work");
    expect(isInsideFolder("Work/Clients", "Work")).toBe(true);
    expect(isInsideFolder("Work", "Work/Clients")).toBe(false);
  });
});

describe("dropModeFor", () => {
  it("files notes into the hovered folder", () => {
    expect(
      dropModeFor({
        activeType: "note",
        overKind: "folder",
        overPath: "Work",
        pointerY: 40,
        overRect: { top: 0, height: 32 },
      }),
    ).toBe("into");
  });

  it("reorders top-level folders at the edges", () => {
    expect(
      dropModeFor({
        activeType: "folder",
        overKind: "folder",
        overPath: "B",
        activePath: "A",
        pointerY: 4,
        overRect: { top: 0, height: 32 },
      }),
    ).toBe("before");
    expect(
      dropModeFor({
        activeType: "folder",
        overKind: "folder",
        overPath: "B",
        activePath: "A",
        pointerY: 28,
        overRect: { top: 0, height: 32 },
      }),
    ).toBe("after");
  });
});

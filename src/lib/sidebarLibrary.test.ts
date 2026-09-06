import { describe, expect, it } from "vitest";
import { togglePinned, type SidebarLibrary } from "./sidebarLibrary";

const library: SidebarLibrary = {
  pinned: ["folder:Work"],
  pinOrder: ["folder:Work"],
  hidden: [],
  folderOrder: [],
  itemOrder: [],
  collapsedFolders: [],
  collapsed: [],
  showHidden: [],
};

describe("togglePinned", () => {
  it("puts a newly pinned item first", () => {
    const next = togglePinned(library, "folder:Personal");
    expect(next.pinned).toEqual(["folder:Personal", "folder:Work"]);
    expect(next.pinOrder).toEqual(["folder:Personal", "folder:Work"]);
  });

  it("unpins without leaving a hole in pin order", () => {
    const next = togglePinned(library, "folder:Work");
    expect(next.pinned).toEqual([]);
    expect(next.pinOrder).toEqual([]);
  });
});

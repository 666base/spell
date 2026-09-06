import { describe, expect, it } from "vitest";
import type { FolderNode } from "../types/note";
import { filterFolderTree, filterNotesByTitle, findFolderNode } from "./folderTree";

function folder(name: string, children: FolderNode[] = []): FolderNode {
  return { name, path: name, children, notes: [] };
}

describe("filterFolderTree", () => {
  const tree = [
    folder("Work", [folder("Work/Clients"), folder("Work/Internal")]),
    folder("Personal"),
  ];

  it("returns the original tree when the query is empty", () => {
    expect(filterFolderTree(tree, "  ")).toBe(tree);
  });

  it("keeps a matching parent and all of its children", () => {
    const next = filterFolderTree(tree, "work");
    expect(next.map((item) => item.path)).toEqual(["Work"]);
    expect(next[0].children.map((item) => item.path)).toEqual(["Work/Clients", "Work/Internal"]);
  });

  it("keeps ancestors of a matching nested folder", () => {
    const next = filterFolderTree(tree, "cli");
    expect(next.map((item) => item.path)).toEqual(["Work"]);
    expect(next[0].children.map((item) => item.path)).toEqual(["Work/Clients"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterFolderTree(tree, "zzz")).toEqual([]);
  });
});

describe("findFolderNode", () => {
  const tree = [
    folder("Work", [folder("Work/Clients"), folder("Work/Internal")]),
    folder("Personal"),
  ];

  it("finds nested folders by path", () => {
    expect(findFolderNode(tree, "Work/Clients")?.path).toBe("Work/Clients");
    expect(findFolderNode(tree, "Personal")?.path).toBe("Personal");
    expect(findFolderNode(tree, "Missing")).toBeUndefined();
  });
});

describe("filterNotesByTitle", () => {
  const notes = [
    { title: "Inbox" },
    { title: "Weekly review" },
  ];

  it("filters notes by title without touching empty queries", () => {
    expect(filterNotesByTitle(notes, "")).toBe(notes);
    expect(filterNotesByTitle(notes, "week").map((note) => note.title)).toEqual(["Weekly review"]);
  });
});

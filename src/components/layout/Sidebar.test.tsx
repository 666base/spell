import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

vi.mock("./LibraryDnd", () => ({
  useLibrarySelection: () => ({
    selectedNoteIds: new Set(),
    setSelectedNoteIds: vi.fn(),
    lastClickedNoteId: null,
    setLastClickedNoteId: vi.fn(),
  }),
}));

vi.mock("../notes/NoteList", () => ({
  NoteList: ({ filter }: { filter?: string }) => (
    <div data-testid="note-list" data-filter={filter} />
  ),
}));

vi.mock("../kanban/ProjectList", () => ({
  ProjectList: () => <div data-testid="project-list" />,
}));

vi.mock("../finance/MoneyList", () => ({
  MoneyList: () => <div data-testid="money-list" />,
}));

describe("Sidebar", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows created projects in the notes column when Projects is selected", () => {
    render(
      <Sidebar
        panel="notes"
        onSelectPanel={vi.fn()}
        scope={{ type: "projects" }}
        onSelectScope={vi.fn()}
      />,
    );
    expect(screen.getByTestId("project-list")).toBeTruthy();
    expect(screen.queryByTestId("note-list")).toBeNull();
  });

  it("shows money items in the notes column when Money is selected", () => {
    render(
      <Sidebar
        panel="notes"
        onSelectPanel={vi.fn()}
        scope={{ type: "money" }}
        onSelectScope={vi.fn()}
      />,
    );
    expect(screen.getByTestId("money-list")).toBeTruthy();
    expect(screen.queryByTestId("note-list")).toBeNull();
  });

  it("shows journal notes in the notes column when Journal is selected", () => {
    render(
      <Sidebar
        panel="journal"
        onSelectPanel={vi.fn()}
        scope={{ type: "journal" }}
        onSelectScope={vi.fn()}
      />,
    );
    expect(screen.getByTestId("note-list").getAttribute("data-filter")).toBe("journal");
    expect(screen.queryByTestId("project-list")).toBeNull();
  });

  it("shows notes when a folder is selected", () => {
    render(
      <Sidebar
        panel="notes"
        onSelectPanel={vi.fn()}
        scope={{ type: "folder", path: "Work" }}
        onSelectScope={vi.fn()}
      />,
    );
    expect(screen.getByTestId("note-list")).toBeTruthy();
  });

  it("does not leave an empty titlebar when folders are hidden", () => {
    render(
      <Sidebar
        panel="notes"
        onSelectPanel={vi.fn()}
        foldersVisible={false}
        scope={{ type: "all" }}
        onSelectScope={vi.fn()}
      />,
    );
    expect(document.querySelector(".folder-titlebar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Show folders" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hide folders" })).toBeNull();
  });
});

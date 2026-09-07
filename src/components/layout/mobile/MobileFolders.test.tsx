import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileFolders } from "./MobileFolders";

vi.mock("../../../context/NotesContext", () => ({
  useNotes: () => ({
    notes: [],
    createFolder: vi.fn(),
    createNoteInFolder: vi.fn(),
    selectNote: vi.fn(),
    pinNote: vi.fn(),
    unpinNote: vi.fn(),
    deleteNote: vi.fn(),
    deleteNotes: vi.fn(),
    deleteFolder: vi.fn(),
    duplicateNote: vi.fn(),
    moveNote: vi.fn(),
    isCreatingNote: false,
  }),
}));

vi.mock("../../../services/notes", () => ({
  listFolders: vi.fn(async () => []),
  getSettings: vi.fn(async () => ({ pinnedNoteIds: [] })),
}));

describe("MobileFolders chrome", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps New Folder out of the crowded nav and in the list", () => {
    render(
      <MobileFolders
        onOpenNote={() => undefined}
        onOpenJournal={() => undefined}
        onOpenHome={() => undefined}
        onOpenWorkspace={() => undefined}
        onCompose={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "New Note" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Workspace" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New Folder" })?.closest(".mobile-nav")).toBeNull();
    expect(screen.getByRole("button", { name: "New Folder" }).closest(".mobile-scroll")).toBeTruthy();
  });

  it("opens the folder dialog from the list row", () => {
    render(
      <MobileFolders
        onOpenNote={() => undefined}
        onOpenJournal={() => undefined}
        onOpenHome={() => undefined}
        onOpenWorkspace={() => undefined}
        onCompose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New Folder" }));
    expect(screen.getByText("Create New Folder")).toBeTruthy();
  });
});

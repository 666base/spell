import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { NoteList } from "./NoteList";

const { notesState } = vi.hoisted(() => ({
  notesState: {
    notes: [] as Array<{ id: string; title: string; preview: string; modified: number }>,
    selectedNoteId: null as string | null,
    selectNote: vi.fn(),
    deleteNote: vi.fn(),
    duplicateNote: vi.fn(),
    pinNote: vi.fn(),
    unpinNote: vi.fn(),
    moveNote: vi.fn(),
    reorderNotes: vi.fn(),
    isLoading: false,
  },
}));

vi.mock("../../context/NotesContext", () => ({
  useNotes: () => notesState,
}));

vi.mock("../../services/notes", () => ({
  getSettings: vi.fn(async () => ({ pinnedNoteIds: [], noteOrder: [] })),
  listFolders: vi.fn(async () => ["Boring Resident"]),
}));

vi.mock("../journal/useOpenJournal", () => ({
  useOpenJournal: () => vi.fn(),
}));

vi.mock("./VirtualizedNoteList", () => ({
  NOTE_LIST_ROW_INSET_CLASS: "px-3",
  NOTE_ROW_ESTIMATE_PX: 64,
  VirtualizedNoteList: ({
    count,
    renderRow,
  }: {
    count: number;
    renderRow: (index: number) => ReactNode;
  }) => (
    <div data-note-list>
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>{renderRow(index)}</div>
      ))}
    </div>
  ),
}));

function renderList(props?: { folderPath?: string | null; query?: string }) {
  return render(
    <NoteList
      folderPath={props?.folderPath ?? "Boring Resident"}
      query={props?.query ?? ""}
      multiSelectedNoteIds={new Set()}
      setMultiSelectedNoteIds={vi.fn()}
      lastClickedNoteId={null}
      setLastClickedNoteId={vi.fn()}
    />,
  );
}

describe("NoteList", () => {
  beforeEach(() => {
    notesState.notes = [];
    notesState.selectedNoteId = null;
    notesState.isLoading = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("labels an empty folder instead of leaving the notes column blank", () => {
    renderList();
    expect(screen.getByRole("status").textContent).toBe("Empty");
    expect(screen.queryByText("No Notes")).toBeNull();
    expect(screen.queryByText("Start a note")).toBeNull();
    expect(screen.queryByText("Untitled")).toBeNull();
  });

  it("says No Results when a search matches nothing", () => {
    notesState.notes = [
      { id: "Boring Resident/alpha", title: "Alpha", preview: "", modified: 1 },
    ];
    renderList({ query: "zzzz" });
    expect(screen.getByRole("status").textContent).toBe("No Results");
  });

  it("uses the canvas empty on mobile instead of a second Empty label", () => {
    render(
      <NoteList
        folderPath="Boring Resident"
        showEmptyCanvas
        multiSelectedNoteIds={new Set()}
        setMultiSelectedNoteIds={vi.fn()}
        lastClickedNoteId={null}
        setLastClickedNoteId={vi.fn()}
      />,
    );
    expect(screen.getByText("Start a note")).toBeTruthy();
    expect(screen.queryByText("Empty")).toBeNull();
    expect(screen.queryByText("No Notes")).toBeNull();
  });

  it("lists notes when the selected folder has some", () => {
    notesState.notes = [
      { id: "Boring Resident/alpha", title: "Alpha", preview: "", modified: 1 },
    ];
    renderList();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

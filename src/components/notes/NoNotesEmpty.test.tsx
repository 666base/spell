import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoNotesEmpty } from "./NoNotesEmpty";

const { notesState } = vi.hoisted(() => ({
  notesState: {
    notes: [] as Array<{ id: string }>,
  },
}));

vi.mock("../../context/NotesContext", () => ({
  useNotes: () => notesState,
}));

describe("NoNotesEmpty", () => {
  afterEach(() => {
    cleanup();
    notesState.notes = [];
  });

  it("invites writing instead of repeating No Notes, with a page-and-pen mark", () => {
    render(<NoNotesEmpty />);
    expect(screen.getByText("Start a note")).toBeTruthy();
    expect(screen.queryByText("No Notes")).toBeNull();
    expect(screen.queryByText("Empty")).toBeNull();
    expect(document.querySelector(".no-notes-pen-body")).toBeTruthy();
    expect(document.querySelector(".no-notes-fold-face")).toBeTruthy();
    expect(document.querySelector(".no-notes-pad-header")).toBeNull();
  });

  it("creates a note from the canvas when a create handler is passed", () => {
    const onCreate = vi.fn();
    render(<NoNotesEmpty onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: "Start a note" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("explains a journal-only library under the invitation", () => {
    notesState.notes = [{ id: "journals/2026-09-01" }];
    render(<NoNotesEmpty />);
    expect(
      screen.getByText(
        "Folders from your phone appear after you sign in there with this Spell Cloud account.",
      ),
    ).toBeTruthy();
  });
});

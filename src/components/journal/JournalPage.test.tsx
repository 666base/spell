import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JournalPage } from "./JournalPage";

vi.mock("../../context/NotesContext", () => ({
  useNotes: () => ({
    notes: [{ id: "journals/2026-09-07", title: "7", preview: "", modified: 1 }],
    currentNote: { id: "journals/2026-09-07", title: "7", preview: "", modified: 1 },
    clearSelection: vi.fn(),
  }),
}));

vi.mock("./useOpenJournal", () => ({
  useOpenJournal: () => vi.fn(),
}));

vi.mock("../editor/Editor", () => ({
  Editor: ({ header }: { header?: ReactNode }) => (
    <div data-testid="journal-editor">{header}</div>
  ),
}));

describe("JournalPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 7));
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("puts the calendar into the journal editor, not a separate pane", () => {
    render(
      <JournalPage
        sidebarVisible
        focusMode={false}
        onEditorReady={vi.fn()}
      />,
    );

    const editor = screen.getByTestId("journal-editor");
    expect(within(editor).getByRole("region", { name: "Journal calendar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "8" }));
    const today = screen.getByRole("button", { name: "Today" });
    expect(today.className).toContain("journal-titlebar-today");
    expect(editor.contains(today)).toBe(false);
  });
});

describe("journal calendar divider spacing", () => {
  it("keeps more space under the week strip than between the dates and the notes", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
    const calendar = css.match(/\.journal-note-calendar \{[^}]+\}/)?.[0] ?? "";
    const viewport = css.match(/\.journal-calendar-viewport \{[^}]+\}/)?.[0] ?? "";
    const notes = css.match(/\[data-journal-page\] \.ProseMirror \{[^}]+\}/)?.[0] ?? "";
    const empty = css.match(/\.journal-empty-page \{[^}]+\}/)?.[0] ?? "";

    expect(calendar).toMatch(/padding: 0\.15rem 0;/);
    expect(calendar).not.toMatch(/0\.5rem/);
    expect(viewport).toMatch(/padding-bottom: 0\.25rem;/);
    expect(notes).toMatch(/padding-top: 1rem;/);
    expect(empty).toMatch(/padding: 1rem 1\.5rem 6rem;/);
  });

  it("separates journal chrome from the note with a tinted surface, not a divider", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
    const page = css.match(/\[data-journal-page\] \{[^}]+\}/)?.[0] ?? "";
    const titlebar = css.match(/\[data-journal-page\] \.note-titlebar \{[^}]+\}/)?.[0] ?? "";
    const calendar = css.match(/\.journal-note-calendar \{[^}]+\}/)?.[0] ?? "";

    expect(page).toMatch(
      /--journal-chrome: color-mix\(in srgb, var\(--color-text\) 7%, var\(--color-bg\)\);/,
    );
    expect(titlebar).toMatch(/background: var\(--journal-chrome\);/);
    expect(calendar).toMatch(/background: var\(--journal-chrome, var\(--color-bg\)\);/);
    expect(calendar).not.toMatch(/border-bottom/);
  });
});

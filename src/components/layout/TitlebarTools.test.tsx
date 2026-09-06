import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { TitlebarTools } from "./TitlebarTools";

vi.mock("../../context/NotesContext", () => ({
  useNotes: () => ({ currentNote: { id: "note" } }),
}));

vi.mock("../../hooks/usePublishedNote", () => ({
  usePublishedNote: () => ({ published: false }),
}));

describe("TitlebarTools", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps format and insert in one cluster without duplicate bold marks", () => {
    render(<TitlebarTools editor={{} as Editor} />);
    const toolbar = screen.getByRole("toolbar", { name: "Note" });
    const labels = [...toolbar.querySelectorAll("button")].map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "Format",
      expect.stringMatching(/^Checklist/),
      "Table",
      "Photo",
      "Share",
    ]);
    expect(screen.queryByRole("button", { name: /Bold/ })).toBeNull();
  });
});

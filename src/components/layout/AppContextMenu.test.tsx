import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppContextMenu } from "./AppContextMenu";

describe("AppContextMenu", () => {
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

  it("only offers new note and new folder on empty canvas", () => {
    render(<AppContextMenu getEditor={() => null} onCreateNote={() => {}} />);
    fireEvent.contextMenu(document.body);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "New Note",
      "New Folder",
    ]);
  });

  it("offers cut copy paste on an editable field", () => {
    render(
      <div>
        <input aria-label="Title" />
        <AppContextMenu getEditor={() => null} onCreateNote={() => {}} />
      </div>,
    );
    fireEvent.contextMenu(screen.getByRole("textbox", { name: "Title" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Cut",
      "Copy",
      "Paste",
      "Select All",
    ]);
  });
});

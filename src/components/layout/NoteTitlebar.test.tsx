import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NoteTitlebar } from "./NoteTitlebar";

describe("NoteTitlebar", () => {
  afterEach(() => {
    cleanup();
  });
  it("does not put the note format toolbar on the desktop titlebar", () => {
    render(<NoteTitlebar />);
    expect(screen.queryByRole("toolbar", { name: "Note" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Format" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });

  it("lets empty chrome and the title drag the desktop window", () => {
    render(
      <NoteTitlebar
        onToggleSidebar={() => undefined}
        center={<span className="titlebar-title">Home</span>}
      />,
    );
    const bar = document.querySelector(".note-titlebar");
    const title = document.querySelector(".titlebar-title");
    expect(bar?.hasAttribute("data-tauri-drag-region")).toBe(true);
    expect(title?.closest(".titlebar-no-drag")).toBeNull();
    expect(screen.getByRole("button", { name: "Hide folders" }).closest(".titlebar-no-drag")).toBeTruthy();
  });

  it("keeps the folder toggle in the note titlebar and morphs open vs closed", () => {
    const { rerender } = render(
      <NoteTitlebar onToggleSidebar={() => undefined} foldersVisible sidebarVisible />,
    );
    const hide = screen.getByRole("button", { name: "Hide folders" });
    expect(hide.closest(".note-titlebar")).toBeTruthy();
    expect(hide.querySelector(".panel-toggle-icon")?.getAttribute("data-open")).toBe("true");

    rerender(
      <NoteTitlebar onToggleSidebar={() => undefined} foldersVisible={false} sidebarVisible />,
    );
    const show = screen.getByRole("button", { name: "Show folders" });
    expect(show.closest(".note-titlebar")).toBeTruthy();
    expect(show.querySelector(".panel-toggle-icon")?.getAttribute("data-open")).toBe("false");
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanPage } from "./KanbanPage";

vi.mock("../../context/KanbanWorkspaceContext", () => ({
  useKanbanWorkspace: () => ({
    activeProject: {
      id: "p1",
      name: "Alpha",
      client: "",
      icon: "board",
      view: "list",
      createdAt: 1,
      updatedAt: 1,
      board: { version: 1, columns: [], cards: [] },
    },
    isLoading: false,
    updateProject: vi.fn(),
    patchActiveBoard: vi.fn(),
  }),
}));

describe("KanbanPage", () => {
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

  it("shows the project name in the desktop titlebar without making it editable", () => {
    render(<KanbanPage />);

    const title = document.querySelector(".note-titlebar .titlebar-title");
    expect(title?.textContent).toBe("Alpha");
    expect(title?.tagName).toBe("SPAN");
    expect(screen.queryByRole("textbox", { name: "Project title" })).toBeNull();
  });
});

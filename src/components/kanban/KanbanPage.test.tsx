import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KanbanBoard, KanbanCard } from "../../types/note";
import { KanbanPage } from "./KanbanPage";

const { activeProject } = vi.hoisted(() => ({
  activeProject: {
    id: "p1",
    name: "Alpha",
    client: "",
    icon: "board" as const,
    view: "list" as const,
    createdAt: 1,
    updatedAt: 1,
    board: { version: 1, columns: [], cards: [] } as KanbanBoard,
  },
}));

function emptyBoard(): KanbanBoard {
  return { version: 1, columns: [], cards: [] };
}

function card(id: string, title: string, completed = false): KanbanCard {
  return {
    id,
    title,
    client: "",
    dueDate: "",
    priority: "medium",
    description: "",
    todos: [],
    completed,
    createdAt: 1,
    updatedAt: 1,
  };
}

function weekBoard(): KanbanBoard {
  return {
    version: 1,
    columns: [
      { id: "today", title: "Today", cardIds: ["c1", "c2"] },
      { id: "week", title: "This week", cardIds: ["c3"] },
      { id: "later", title: "Later", cardIds: [] },
      { id: "done", title: "Done", cardIds: [] },
    ],
    cards: [
      card("c1", "Alpha", true),
      card("c2", "Beta"),
      card("c3", "Gamma"),
    ],
  };
}

vi.mock("../../context/KanbanWorkspaceContext", () => ({
  useKanbanWorkspace: () => ({
    activeProject,
    isLoading: false,
    updateProject: vi.fn(),
    patchActiveBoard: vi.fn(),
    workspace: {
      version: 2,
      activeProjectId: "p1",
      projects: [activeProject],
    },
  }),
}));

describe("KanbanPage", () => {
  beforeEach(() => {
    activeProject.board = emptyBoard();
    activeProject.view = "list";
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

  it("keeps the project view icons and settings on mobile chrome", () => {
    render(<KanbanPage hideTitleBar />);

    expect(document.querySelector(".note-titlebar")).toBeNull();
    const group = screen.getByRole("tablist", { name: "Project view" });
    expect(group.className).toContain("mobile-project-views");
    expect(screen.getByRole("tab", { name: "List" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Board" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Gallery" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Project settings" })).toBeTruthy();
  });

  it("lets you set a client from project settings", () => {
    render(<KanbanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Project settings" }));
    expect(screen.getByRole("textbox", { name: "Client" })).toBeTruthy();
  });

  it("puts list, board, and gallery on the dashboard canvas", () => {
    render(<KanbanPage />);

    expect(document.querySelector(".kanban-page")).toBeTruthy();
    expect(document.querySelector(".kanban-list")).toBeTruthy();
    expect(screen.getByRole("button", { name: "This week" })).toBeTruthy();
    expect(document.querySelector(".kanban-list .money-group-card")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Board" }));
    expect(document.querySelector(".kanban-page .kanban-board")).toBeTruthy();
    expect(screen.getByRole("button", { name: "This week" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add column" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    expect(document.querySelector(".kanban-page .kanban-gallery")).toBeTruthy();
    expect(screen.getByRole("button", { name: "This week" })).toBeTruthy();
  });

  it("keeps list chips above grouped cards and treats Add a list as an action", () => {
    activeProject.board = weekBoard();
    render(<KanbanPage />);

    const today = screen.getByRole("button", { name: "Today color" });
    expect(today.closest(".money-group-title")).toBeTruthy();
    expect(today.closest(".money-group-card")).toBeNull();
    expect(document.querySelectorAll(".kanban-list .money-group-card")).toHaveLength(4);

    const addList = screen.getByRole("button", { name: "Add a list" });
    expect(addList.className).toContain("kanban-list-add");
    expect(addList.closest(".money-group-card")).toBeNull();
    expect(screen.getAllByRole("textbox", { name: "Add" })).toHaveLength(4);
  });

  it("puts gallery composer and cards on one shared canvas", () => {
    activeProject.board = weekBoard();
    render(<KanbanPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));

    expect(document.querySelector(".kanban-gallery-inner")).toBeTruthy();
    expect(document.querySelector(".kanban-gallery-composer")).toBeTruthy();
    expect(document.querySelectorAll(".kanban-gallery-card")).toHaveLength(3);
    expect(document.querySelector(".kanban-gallery-card .kanban-status")?.textContent).toBe("Today");
    expect(screen.getByRole("textbox", { name: "Add" })).toBeTruthy();
  });

  it("lifts project surfaces with fill instead of outlined boxes", () => {
    const css = readFileSync("src/App.css", "utf8");
    expect(css).toMatch(/\.kanban-gallery-card \{[^}]*border: 0;[^}]*background: var\(--color-bg\);/s);
    expect(css).toMatch(/\.kanban-gallery-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s);
    expect(css).toMatch(/\.kanban-board-column \{[^}]*border: 0;[^}]*background: var\(--color-bg\);/s);
    expect(css).toMatch(
      /\.dark \.kanban-list \.money-group-card,\s*\.dark \.kanban-gallery-card,\s*\.dark \.kanban-gallery-composer,\s*\.dark \.kanban-board-column,\s*\.dark \.kanban-board-add \{\s*background: var\(--material-menu\);/s,
    );
    expect(css).toMatch(/\.kanban-add-input::placeholder \{[^}]*color-mix\(in srgb, var\(--color-text-muted\) 78%, transparent\)/s);
    expect(css).toMatch(/\.kanban-list-add \{[^}]*color: var\(--color-text-muted\);/s);
  });
});

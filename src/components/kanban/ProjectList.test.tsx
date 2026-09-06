import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTE_LIST_ROW_INSET_CLASS } from "../notes/VirtualizedNoteList";
import { ProjectList } from "./ProjectList";

vi.mock("../../context/KanbanWorkspaceContext", () => ({
  useKanbanWorkspace: () => ({
    workspace: {
      version: 2,
      activeProjectId: "p1",
      projects: [
        {
          id: "p1",
          name: "Alpha",
          client: "",
          icon: "kanban",
          view: "list",
          createdAt: 1,
          updatedAt: 1,
          board: { version: 1, columns: [], cards: [] },
        },
        {
          id: "p2",
          name: "Beta",
          client: "",
          icon: "kanban",
          view: "list",
          createdAt: 2,
          updatedAt: 2,
          board: { version: 1, columns: [], cards: [] },
        },
      ],
    },
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
  }),
}));

describe("ProjectList", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses the folder-rail glide highlight on project rows", () => {
    const { container } = render(
      <ProjectList
        selectedId="p1"
        overviewSelected={false}
        onSelect={vi.fn()}
        onSelectOverview={vi.fn()}
        onCreated={vi.fn()}
        onDeletedSelected={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-glide]")).not.toBeNull();
    expect(screen.getByRole("button", { name: /overview/i }).hasAttribute("data-row")).toBe(true);
    expect(screen.getByRole("button", { name: /overview/i }).querySelector(".overview-glyph")).toBeTruthy();
    expect(screen.getByRole("button", { name: /alpha/i }).hasAttribute("data-row")).toBe(true);
  });

  it("uses the same horizontal inset as the journal note list", () => {
    const { container } = render(
      <ProjectList
        selectedId="p1"
        overviewSelected={false}
        onSelect={vi.fn()}
        onSelectOverview={vi.fn()}
        onCreated={vi.fn()}
        onDeletedSelected={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-project-list]")).not.toBeNull();
    const gutter = container.querySelector("[data-project-list-row]");
    expect(gutter?.className).toContain(NOTE_LIST_ROW_INSET_CLASS);

    const row = screen.getByRole("button", { name: /overview/i });
    expect(row.classList.contains("px-3.5")).toBe(true);
    expect(row.classList.contains("rounded-[10px]")).toBe(true);
  });

  it("puts a newly pinned project first, not in original workspace order", () => {
    window.localStorage.setItem(
      "spell:sidebar-library",
      JSON.stringify({ pinned: ["project:p2", "project:p1"] }),
    );
    render(
      <ProjectList
        selectedId="p1"
        overviewSelected={false}
        onSelect={vi.fn()}
        onSelectOverview={vi.fn()}
        onCreated={vi.fn()}
        onDeletedSelected={vi.fn()}
      />,
    );

    const alpha = screen.getByRole("button", { name: /alpha/i });
    const beta = screen.getByRole("button", { name: /beta/i });
    expect(beta.compareDocumentPosition(alpha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

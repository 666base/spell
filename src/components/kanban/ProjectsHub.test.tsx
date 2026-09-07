import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsHub } from "./ProjectsHub";

const patchProjectBoard = vi.fn();

vi.mock("../../lib/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/platform")>();
  return { ...actual, isMobileApp: true };
});

vi.mock("../../context/KanbanWorkspaceContext", () => ({
  useKanbanWorkspace: () => ({
    workspace: {
      version: 2,
      activeProjectId: "p1",
      projects: [
        {
          id: "p1",
          name: "Site",
          client: "Acme",
          icon: "board",
          view: "list",
          createdAt: 1,
          updatedAt: 2,
          board: {
            version: 1,
            columns: [{ id: "today", title: "Today", cardIds: ["c1"] }],
            cards: [{
              id: "c1",
              title: "Draft home",
              priority: "medium",
              completed: false,
              dueDate: "2026-09-08",
              createdAt: 1,
              updatedAt: 1,
            }],
          },
        },
        {
          id: "p2",
          name: "Brand",
          client: "Acme",
          icon: "board",
          view: "list",
          createdAt: 1,
          updatedAt: 3,
          board: { version: 1, columns: [], cards: [] },
        },
        {
          id: "p3",
          name: "Personal",
          client: "",
          icon: "board",
          view: "list",
          createdAt: 1,
          updatedAt: 1,
          board: { version: 1, columns: [], cards: [] },
        },
      ],
    },
    isLoading: false,
    patchProjectBoard,
  }),
}));

describe("ProjectsHub", () => {
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

  it("uses the journal calendar as the surface instead of KPI cards", () => {
    const onOpenProject = vi.fn();
    render(<ProjectsHub onOpenProject={onOpenProject} />);

    expect(screen.getByRole("region", { name: "Project due dates" })).toBeTruthy();
    expect(screen.getByText("September 7")).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Activity" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Projects" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Work by stage" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Open by project" })).toBeNull();
    expect(screen.queryByText("Total results")).toBeNull();
    expect(screen.getByRole("heading", { name: "Due" })).toBeTruthy();
    expect(screen.getByText("Draft home")).toBeTruthy();
    expect(document.querySelector(".project-hub-task .kanban-task")).toBeTruthy();
    expect(document.querySelector(".project-hub-task .money-row")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /acme/i }));
    fireEvent.click(screen.getByRole("button", { name: /^site/i }));
    expect(onOpenProject).toHaveBeenCalledWith("p1");
  });

  it("filters the table to clients with open work", () => {
    render(<ProjectsHub />);

    fireEvent.click(screen.getByRole("radio", { name: "Open" }));

    expect(screen.getByRole("button", { name: /acme/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /no client/i })).toBeNull();
  });

  it("opens a due day from the calendar", () => {
    render(<ProjectsHub />);

    fireEvent.click(screen.getByRole("button", { name: "8" }));
    expect(screen.getByRole("heading", { name: "September 8" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Due" })).toBeNull();
    expect(screen.getByText("Draft home")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Today" })).toBeTruthy();
  });

  it("puts the date on the page when the titlebar is hidden", () => {
    render(<ProjectsHub hideTitleBar />);
    expect(screen.getByRole("heading", { name: "September 7" })).toBeTruthy();
  });
});

describe("project hub calendar chrome", () => {
  it("tints the titlebar and calendar the same way journal does", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
    const page = css.match(/\[data-calendar-page\] \{[^}]+\}/)?.[0] ?? "";
    const titlebar = css.match(/\[data-calendar-page\] \.note-titlebar \{[^}]+\}/)?.[0] ?? "";
    const calendar = css.match(/\.journal-note-calendar \{[^}]+\}/)?.[0] ?? "";

    expect(page).toMatch(
      /--journal-chrome: color-mix\(in srgb, var\(--color-text\) 7%, var\(--color-bg\)\);/,
    );
    expect(titlebar).toMatch(/background: var\(--journal-chrome\);/);
    expect(calendar).toMatch(/background: var\(--journal-chrome, var\(--color-bg\)\);/);
  });

  it("aligns hub tasks with the calendar column, not money-row cards", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
    const task = css.match(/\.project-hub-task \{[^}]+\}/)?.[0] ?? "";
    expect(task).toMatch(/padding: 8px 0;/);
    expect(task).not.toMatch(/16px/);
  });
});

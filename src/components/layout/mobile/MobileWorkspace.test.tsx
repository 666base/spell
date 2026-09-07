import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileWorkspace } from "./MobileWorkspace";

vi.mock("../../../context/KanbanWorkspaceContext", () => ({
  useKanbanWorkspace: () => ({
    workspace: {
      projects: [
        {
          id: "p1",
          name: "Alpha",
          icon: "board",
          view: "list",
          createdAt: 1,
          updatedAt: 1,
          board: { version: 1, columns: [], cards: [] },
        },
      ],
    },
    activeProject: {
      id: "p1",
      name: "Alpha",
      icon: "board",
      view: "list",
      createdAt: 1,
      updatedAt: 1,
      board: { version: 1, columns: [], cards: [] },
    },
    selectProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
  }),
}));

vi.mock("../../../context/FinanceContext", () => ({
  useFinance: () => ({
    workspace: { version: 1, currency: "EUR", subscriptions: [], transactions: [], months: [] },
    addMonth: vi.fn(),
  }),
}));

vi.mock("../../kanban/KanbanPage", () => ({
  KanbanPage: () => <div>Project board</div>,
}));

vi.mock("../../kanban/ProjectsHub", () => ({
  ProjectsHub: () => <div>Overview</div>,
}));

vi.mock("../../finance/FinancePage", () => ({
  FinancePage: () => <div>Money page</div>,
}));

describe("MobileWorkspace", () => {
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

  it("puts Projects and Money icons in the nav title and keeps the daily toggle alone on the trailing edge", () => {
    render(<MobileWorkspace onBackToDaily={() => undefined} onOpenFolders={() => undefined} />);

    const switcher = screen.getByRole("tablist", { name: "Workspace" });
    expect(switcher.className).toContain("mobile-workspace-switch");
    expect(switcher.closest(".mobile-nav-title")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Projects" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Workspace" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Folders" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Money" }));
    expect(screen.getByText("Money page")).toBeTruthy();
  });

  it("opens the Money pane when Home asks for it", () => {
    render(<MobileWorkspace onBackToDaily={() => undefined} onOpenFolders={() => undefined} />);
    act(() => {
      window.dispatchEvent(new CustomEvent("spell-mobile-workspace", { detail: { type: "money" } }));
    });
    expect(screen.getByRole("tab", { name: "Money" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Money page")).toBeTruthy();
  });

  it("drops the workspace switch after drilling into a project", () => {
    render(<MobileWorkspace onBackToDaily={() => undefined} onOpenFolders={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(screen.getByText("Project board")).toBeTruthy();
    expect(document.querySelector(".mobile-nav-title-text")?.textContent).toBe("Alpha");
    expect(screen.queryByRole("tablist", { name: "Workspace" })).toBeNull();
    expect(screen.getByRole("button", { name: "Projects" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Workspace" })).toBeTruthy();
  });

  it("asks for a client when creating a project", () => {
    render(<MobileWorkspace onBackToDaily={() => undefined} onOpenFolders={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "New Project" }));
    expect(screen.getByRole("textbox", { name: "Client" })).toBeTruthy();
  });
});

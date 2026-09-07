import { describe, expect, it } from "vitest";
import type { KanbanBoard, KanbanCard, KanbanProject, KanbanWorkspace } from "../types/note";
import {
  appendCardToColumn,
  clientListSubtitle,
  columnStatusKind,
  createBoardFromTemplate,
  doneColumn,
  dueDateKeys,
  formatUpdatedAt,
  knownClientNames,
  matchesActivity,
  normalizeBoard,
  openByProject,
  overdueTaskCount,
  projectListSubtitle,
  projectsForClient,
  resolvedColumnColor,
  tasksOnDate,
  withCardCompleted,
  withCardInColumn,
  withProjectChrome,
  workByStage,
  workspaceClients,
} from "./kanban";

function card(id: string, extra: Partial<KanbanCard> = {}): KanbanCard {
  return {
    id,
    title: id,
    priority: "medium",
    completed: false,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function weekBoard(cards: KanbanCard[], placement: Record<string, string[]>): KanbanBoard {
  const template = createBoardFromTemplate("week");
  return {
    ...template,
    cards,
    columns: template.columns.map((column) => ({
      ...column,
      cardIds: placement[column.id] ?? [],
    })),
  };
}

describe("resolvedColumnColor", () => {
  it("uses default colors from the stage name", () => {
    expect(resolvedColumnColor("Today")).toBe("gray");
    expect(resolvedColumnColor("This week")).toBe("gray");
    expect(resolvedColumnColor("In progress")).toBe("blue");
    expect(resolvedColumnColor("Waiting")).toBe("orange");
    expect(resolvedColumnColor("Done")).toBe("green");
  });

  it("lets a picked color override the default", () => {
    expect(resolvedColumnColor("To Do", "pink")).toBe("pink");
    expect(resolvedColumnColor("Done", "default")).toBe("green");
  });
});

describe("columnStatusKind", () => {
  it("maps common project stages", () => {
    expect(columnStatusKind("Today")).toBe("inbox");
    expect(columnStatusKind("This week")).toBe("todo");
    expect(columnStatusKind("Next week")).toBe("todo");
    expect(columnStatusKind("Later")).toBe("todo");
    expect(columnStatusKind("Inbox")).toBe("inbox");
    expect(columnStatusKind("Doing")).toBe("progress");
    expect(columnStatusKind("In progress")).toBe("progress");
    expect(columnStatusKind("Waiting")).toBe("waiting");
    expect(columnStatusKind("Done")).toBe("done");
    expect(columnStatusKind("Complete")).toBe("done");
    expect(columnStatusKind("Research")).toBe("other");
  });
});

describe("createBoardFromTemplate", () => {
  it("builds a week board by time, and a blank board from scratch", () => {
    expect(createBoardFromTemplate("week").columns.map((column) => column.title)).toEqual([
      "Today",
      "This week",
      "Later",
      "Done",
    ]);
    expect(createBoardFromTemplate("blank").columns).toEqual([]);
  });
});

describe("withCardCompleted", () => {
  it("marks a task done without moving it", () => {
    const board = weekBoard(
      [card("a")],
      { today: ["a"], week: [], later: [], done: [] },
    );
    const next = withCardCompleted(board, "a", true, 9);
    expect(next.columns.find((column) => column.id === "today")?.cardIds).toEqual(["a"]);
    expect(doneColumn(next)?.cardIds).toEqual([]);
    expect(next.cards[0]?.completed).toBe(true);
    expect(next.cards[0]?.updatedAt).toBe(9);
  });
});

describe("withCardInColumn", () => {
  it("moves a task without changing its completed flag", () => {
    const board = weekBoard(
      [card("a")],
      { today: ["a"], week: [], later: [], done: [] },
    );
    const next = withCardInColumn(board, "a", "done");
    expect(next.cards[0]?.completed).toBe(false);
    expect(doneColumn(next)?.cardIds).toEqual(["a"]);
  });
});

describe("appendCardToColumn", () => {
  it("keeps every card when adding from the latest board", () => {
    const empty = weekBoard([], { today: [], week: [], later: [], done: [] });
    const first = appendCardToColumn(empty, "today", card("a"));
    const second = appendCardToColumn(first, "today", card("b"));
    expect(second.cards.map((item) => item.id)).toEqual(["a", "b"]);
    expect(second.columns.find((column) => column.id === "today")?.cardIds).toEqual(["a", "b"]);
  });

  it("drops the first card if both adds start from the same snapshot", () => {
    const empty = weekBoard([], { today: [], week: [], later: [], done: [] });
    const first = appendCardToColumn(empty, "today", card("a"));
    const second = appendCardToColumn(empty, "today", card("b"));
    expect(first.cards.map((item) => item.id)).toEqual(["a"]);
    expect(second.cards.map((item) => item.id)).toEqual(["b"]);
  });
});

function project(id: string, extra: Partial<KanbanProject> = {}): KanbanProject {
  return {
    id,
    name: id,
    client: "",
    icon: "briefcase",
    view: "list",
    createdAt: 1,
    updatedAt: 1,
    board: createBoardFromTemplate("blank"),
    ...extra,
  };
}

describe("project clients", () => {
  it("puts the client on the project row, grouped case-insensitively", () => {
    const alpha = project("alpha", {
      client: "Acme",
      updatedAt: 2,
      board: weekBoard([card("a")], { today: ["a"], week: [], later: [], done: [] }),
    });
    const brand = project("brand", {
      client: "acme",
      updatedAt: 8,
      board: weekBoard([card("b"), card("c")], { today: ["b"], week: ["c"], later: [], done: [] }),
    });
    const personal = project("personal", { client: "  ", updatedAt: 9 });
    const workspace: KanbanWorkspace = {
      version: 2,
      activeProjectId: alpha.id,
      projects: [alpha, brand, personal],
    };

    expect(projectListSubtitle(alpha)).toBe("Acme · 1 open");
    expect(projectListSubtitle(personal)).toBe("Empty");

    const clients = workspaceClients(workspace);
    expect(clients).toEqual([
      { name: "Acme", projectCount: 2, openCount: 3, updatedAt: 8 },
    ]);
    expect(clientListSubtitle(clients[0])).toBe("2 projects · 3 open");
    expect(knownClientNames(workspace)).toEqual(["Acme"]);
    expect(projectsForClient(workspace, "ACME").map((item) => item.id)).toEqual(["alpha", "brand"]);
    expect(formatUpdatedAt(Number.NaN)).toBe("");
    expect(formatUpdatedAt(Date.UTC(2026, 8, 5, 12)).length).toBeGreaterThan(0);
    expect(matchesActivity("open", 0, true)).toBe(false);
    expect(matchesActivity("due", 0, true)).toBe(true);
  });
});

describe("withProjectChrome", () => {
  it("keeps the current board when a project is renamed", () => {
    const board = appendCardToColumn(
      weekBoard([], { today: [], week: [], later: [], done: [] }),
      "today",
      card("a"),
    );
    const project = {
      id: "p1",
      name: "Old",
      client: "",
      icon: "briefcase" as const,
      view: "list" as const,
      createdAt: 1,
      updatedAt: 1,
      board,
    };
    const next = withProjectChrome(project, { ...project, name: "New" });
    expect(next.name).toBe("New");
    expect(next.board).toBe(board);
    expect(next.board.cards.map((item) => item.id)).toEqual(["a"]);
  });
});

describe("normalizeBoard", () => {
  it("leaves completed tasks in their current column", () => {
    const board = normalizeBoard(weekBoard(
      [card("a", { completed: true })],
      { today: ["a"], week: [], later: [], done: [] },
    ));
    expect(board.columns.find((column) => column.id === "today")?.cardIds).toEqual(["a"]);
    expect(doneColumn(board)?.cardIds).toEqual([]);
    expect(board.cards[0]?.completed).toBe(true);
  });

  it("keeps a custom column color", () => {
    const source = weekBoard([card("a")], { today: ["a"], week: [], later: [], done: [] });
    source.columns = source.columns.map((column) => (
      column.id === "today" ? { ...column, color: "purple" } : column
    ));
    const board = normalizeBoard(source);
    expect(board.columns.find((column) => column.id === "today")?.color).toBe("purple");
  });
});

describe("workByStage", () => {
  it("groups open cards by column stage and ranks projects by load", () => {
    const workspace: KanbanWorkspace = {
      version: 2,
      activeProjectId: "p1",
      projects: [
        {
          id: "p1",
          name: "Site",
          client: "Acme",
          createdAt: 1,
          updatedAt: 2,
          board: weekBoard(
            [card("a"), card("b", { dueDate: "2020-01-01" })],
            { today: ["a"], week: ["b"], later: [], done: [] },
          ),
        },
        {
          id: "p2",
          name: "Brand",
          createdAt: 1,
          updatedAt: 1,
          board: weekBoard([card("c")], { today: [], week: [], later: ["c"], done: [] }),
        },
      ],
    };
    expect(workByStage(workspace)).toEqual([
      expect.objectContaining({ kind: "inbox", label: "Inbox", count: 1 }),
      expect.objectContaining({ kind: "todo", label: "Ready", count: 2 }),
    ]);
    expect(openByProject(workspace).map((project) => project.name)).toEqual(["Site", "Brand"]);
    expect(overdueTaskCount(workspace)).toBe(1);
    expect(dueDateKeys(workspace)).toEqual(new Set(["2020-01-01"]));
    expect(tasksOnDate(workspace, "2020-01-01").map((item) => item.card.id)).toEqual(["b"]);
    expect(workByStage(workspace, new Set(["p2"]))).toEqual([
      expect.objectContaining({ kind: "todo", count: 1 }),
    ]);
  });
});

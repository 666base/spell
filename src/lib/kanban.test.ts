import { describe, expect, it } from "vitest";
import type { KanbanBoard, KanbanCard } from "../types/note";
import {
  columnStatusKind,
  createBoardFromTemplate,
  doneColumn,
  normalizeBoard,
  resolvedColumnColor,
  withCardCompleted,
  withCardInColumn,
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

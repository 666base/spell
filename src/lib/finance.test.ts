import { describe, expect, it } from "vitest";
import type { FinanceTransaction, FinanceWorkspace } from "../types/note";
import {
  cashFlowSankey,
  categoryLabel,
  collapseNamedTotals,
  filterTransactions,
  formatPercentChange,
  formatShare,
  heatmapWeekLabels,
  layoutSankey,
  listedTransactions,
  matchesAmountFilter,
  pagerItems,
  percentChange,
  recurringScatter,
  selectableMonths,
  shiftMonth,
  sortTransactions,
  spendingByCategory,
  spendingHeatmap,
  uniqueCategories,
  knownCategories,
} from "./finance";

function workspace(transactions: Partial<FinanceTransaction>[]): FinanceWorkspace {
  return {
    version: 1,
    currency: "EUR",
    subscriptions: [],
    months: [],
    transactions: transactions.map((transaction, index) => ({
      id: transaction.id ?? `t${index}`,
      kind: transaction.kind ?? "expense",
      title: transaction.title ?? `Item ${index}`,
      amountCents: transaction.amountCents ?? 100,
      date: transaction.date ?? "2026-09-01",
      category: transaction.category ?? "",
      archived: transaction.archived ?? false,
      createdAt: transaction.createdAt ?? index,
      updatedAt: transaction.updatedAt ?? index,
    })),
  };
}

describe("shiftMonth", () => {
  it("steps across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
  });
});

describe("percentChange", () => {
  it("compares against the previous period and hides a missing baseline", () => {
    expect(percentChange(106, 100)).toBe(6);
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(50, 0)).toBeNull();
    expect(formatPercentChange(6.14)).toBe("+6.1%");
    expect(formatPercentChange(-2.4)).toBe("−2.4%");
    expect(formatPercentChange(null)).toBe("—");
  });
});

describe("cashFlowSankey", () => {
  it("routes income sources into spending and leftover savings", () => {
    const data = workspace([
      { kind: "income", title: "Acme", category: "Income", amountCents: 10000, date: "2026-09-01" },
      { kind: "expense", category: "Rent", amountCents: 4000, date: "2026-09-02" },
      { kind: "expense", category: "Food", amountCents: 2000, date: "2026-09-03" },
    ]);
    const chart = cashFlowSankey(data, "2026-09");
    expect(chart.income).toBe(10000);
    expect(chart.expenses).toBe(6000);
    expect(chart.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Income", side: "source", amountCents: 10000 }),
      expect.objectContaining({ name: "Rent", side: "target", amountCents: 4000 }),
      expect.objectContaining({ name: "Saved", side: "target", amountCents: 4000 }),
    ]));
    expect(chart.links.reduce((total, link) => total + link.amountCents, 0)).toBe(10000);
    const laid = layoutSankey(chart, 800);
    expect(laid.nodes.filter((node) => node.side === "source").every((node) => node.x < node.width + 160)).toBe(true);
    expect(laid.links.length).toBeGreaterThan(0);
    expect(laid.links.every((link) => link.d.startsWith("M"))).toBe(true);
    expect(formatShare(4000, 10000)).toBe("40%");
    expect(collapseNamedTotals(
      [{ name: "A", amountCents: 5 }, { name: "B", amountCents: 3 }, { name: "C", amountCents: 1 }],
      2,
    )).toEqual([{ name: "A", amountCents: 5 }, { name: "Other", amountCents: 4 }]);
  });
});

describe("selectableMonths", () => {
  it("keeps the cash-flow window selectable even when a month has no records", () => {
    const data = workspace([{ kind: "expense", amountCents: 400, date: "2026-09-03" }]);
    const months = selectableMonths(data, "2026-09");
    expect(months).toEqual([...months].sort((left, right) => right.localeCompare(left)));
    expect(months).toEqual(expect.arrayContaining([
      "2026-09",
      "2026-08",
      "2026-07",
      "2026-06",
      "2026-05",
      "2026-04",
    ]));
  });
});

describe("spendingByCategory", () => {
  it("groups expenses and labels blank categories", () => {
    const data = workspace([
      { kind: "expense", category: "Groceries", amountCents: 800, date: "2026-09-01" },
      { kind: "expense", category: "Groceries", amountCents: 200, date: "2026-09-02" },
      { kind: "expense", category: "", amountCents: 50, date: "2026-09-03" },
      { kind: "income", category: "Groceries", amountCents: 9000, date: "2026-09-04" },
      { kind: "expense", category: "Rent", amountCents: 300, date: "2026-08-04" },
    ]);
    expect(spendingByCategory(data, "2026-09")).toEqual([
      { name: "Groceries", amountCents: 1000 },
      { name: "Uncategorized", amountCents: 50 },
    ]);
    expect(categoryLabel("")).toBe("Uncategorized");
    expect(uniqueCategories(data)).toEqual(["Groceries", "Rent", "Uncategorized"]);
  });
});

describe("knownCategories", () => {
  it("lists reusable names so records can pick or create a category", () => {
    const data = workspace([
      { kind: "income", category: "Salary" },
      { kind: "expense", category: "Groceries" },
      { kind: "expense", category: "  " },
      { kind: "income", category: "Salary" },
    ]);
    data.subscriptions = [{
      id: "s1",
      name: "Netflix",
      amountCents: 1000,
      cadence: "monthly",
      nextBillingDate: "2026-09-20",
      category: "Streaming",
      archived: false,
      createdAt: 1,
      updatedAt: 1,
    }];
    expect(knownCategories(data, "income")).toEqual(["Salary"]);
    expect(knownCategories(data, "expense")).toEqual(["Groceries", "Streaming"]);
    expect(knownCategories(data)).toEqual(["Groceries", "Salary", "Streaming"]);
  });
});

describe("filterTransactions", () => {
  it("filters by category and amount bands", () => {
    const items = listedTransactions(workspace([
      { title: "Pay", kind: "income", amountCents: 20000, category: "Income", date: "2026-09-01", updatedAt: 2 },
      { title: "Milk", kind: "expense", amountCents: 400, category: "Groceries", date: "2026-09-02", updatedAt: 1 },
      { title: "Desk", kind: "expense", amountCents: 12000, category: "Home", date: "2026-09-03", updatedAt: 3 },
    ]));
    expect(items.map((item) => item.title)).toEqual(["Desk", "Milk", "Pay"]);
    expect(filterTransactions(items, "Groceries", "all").map((item) => item.title)).toEqual(["Milk"]);
    expect(filterTransactions(items, "all", "income").map((item) => item.title)).toEqual(["Pay"]);
    expect(filterTransactions(items, "all", "expense").map((item) => item.title)).toEqual(["Desk", "Milk"]);
    expect(filterTransactions(items, "all", "under50").map((item) => item.title)).toEqual(["Milk"]);
    expect(filterTransactions(items, "all", "all", "2026-09-03").map((item) => item.title)).toEqual(["Desk"]);
    expect(filterTransactions(items, "all", "all", null, "milk").map((item) => item.title)).toEqual(["Milk"]);
    expect(filterTransactions(items, "all", "mid").map((item) => item.title)).toEqual(["Desk", "Pay"]);
    expect(sortTransactions(items, "amount", "desc").map((item) => item.title)).toEqual(["Pay", "Desk", "Milk"]);
    expect(matchesAmountFilter(62000, "income", "over500")).toBe(true);
    expect(pagerItems(1, 3)).toEqual([1, 2, 3]);
    expect(pagerItems(1, 14)).toEqual([1, 2, 3, 4, 5, "gap", 14]);
    expect(pagerItems(8, 14)).toEqual([1, "gap", 7, 8, 9, "gap", 14]);
  });
});

describe("spendingHeatmap", () => {
  it("builds a Monday-start 12-week grid of daily expenses", () => {
    const monday = new Date("2026-09-07T12:00:00");
    const data = workspace([
      { kind: "expense", amountCents: 300, date: "2026-09-07" },
      { kind: "income", amountCents: 9000, date: "2026-09-07" },
      { kind: "expense", amountCents: 150, date: "2026-06-22" },
    ]);
    const cells = spendingHeatmap(data, 12, monday);
    expect(cells).toHaveLength(84);
    expect(cells[0]?.date).toBe("2026-06-22");
    expect(cells[0]?.amountCents).toBe(150);
    expect(cells[cells.length - 1]?.date).toBe("2026-09-13");
    expect(cells.find((cell) => cell.date === "2026-09-07")?.amountCents).toBe(300);
    expect(heatmapWeekLabels(12).map((week) => week.label)).toEqual([
      "W1", "", "W3", "", "W5", "", "W7", "", "W9", "", "W11", "",
    ]);
  });
});

describe("recurringScatter", () => {
  it("plots subscriptions by days until due and monthly cost", () => {
    const data = workspace([]);
    data.subscriptions = [
      {
        id: "s1",
        name: "Spotify",
        amountCents: 1200,
        cadence: "monthly",
        nextBillingDate: "2026-09-14",
        category: "Subscriptions",
        archived: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const points = recurringScatter(data, new Date("2026-09-07T12:00:00"));
    expect(points).toEqual([
      expect.objectContaining({ id: "s1", name: "Spotify", x: 7, y: 1200, z: 1200 }),
    ]);
  });
});

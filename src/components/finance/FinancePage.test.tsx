import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinanceTransaction, FinanceWorkspace } from "../../types/note";
import { FinancePage } from "./FinancePage";

const { finance } = vi.hoisted(() => ({
  finance: {
    workspace: {
      version: 1,
      currency: "EUR",
      months: [],
      subscriptions: [],
      transactions: [],
    } as FinanceWorkspace,
  },
}));

const populatedWorkspace: FinanceWorkspace = {
  version: 1,
  currency: "EUR",
  months: [],
  subscriptions: [
    {
      id: "s1",
      name: "Spotify",
      amountCents: 1200,
      cadence: "monthly",
      nextBillingDate: "2026-09-20",
      category: "Subscriptions",
      archived: false,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  transactions: [
    tx("pay", "Acme payroll", "income", 620000, "2026-09-02", "Income"),
    tx("food", "Whole Foods", "expense", 13500, "2026-09-03", "Groceries"),
    tx("netflix", "Netflix", "expense", 1800, "2026-09-04", "Subscriptions"),
    ...Array.from({ length: 8 }, (_, index) => tx(
      `extra-${index}`,
      `Coffee ${index + 1}`,
      "expense",
      400,
      `2026-09-0${(index % 5) + 1}`,
      "Dining",
    )),
  ],
};

function tx(
  id: string,
  title: string,
  kind: FinanceTransaction["kind"],
  amountCents: number,
  date: string,
  category: string,
): FinanceTransaction {
  return {
    id,
    title,
    kind,
    amountCents,
    date,
    category,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

vi.mock("../../context/FinanceContext", () => ({
  useFinance: () => ({
    workspace: finance.workspace,
    isLoading: false,
    saveSubscription: vi.fn(),
    saveTransaction: vi.fn(),
    duplicateSubscription: vi.fn(),
    duplicateTransaction: vi.fn(),
    archiveSubscription: vi.fn(),
    deleteSubscription: vi.fn(),
    deleteTransaction: vi.fn(),
    confirmSubscription: vi.fn(),
  }),
  createFinanceSubscription: () => ({
    id: "new-sub",
    name: "",
    amountCents: 0,
    cadence: "monthly",
    nextBillingDate: "2026-09-07",
    category: "",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  }),
  createFinanceTransaction: () => ({
    id: "new-tx",
    kind: "expense",
    title: "",
    amountCents: 0,
    date: "2026-09-07",
    category: "",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  }),
}));

vi.mock("../../lib/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/platform")>();
  return { ...actual, isMobileApp: true };
});

vi.mock("../../context/KanbanWorkspaceContext", () => ({
  useKanbanWorkspace: () => ({
    workspace: { projects: [] },
  }),
}));

describe("FinancePage", () => {
  beforeEach(() => {
    finance.workspace = populatedWorkspace;
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

  it("renders a finance dashboard with KPIs, charts, and a filterable table", () => {
    render(<FinancePage scope={{ type: "money" }} />);

    const kpis = screen.getByRole("region", { name: "This month" });
    expect(within(kpis).getByText("Net")).toBeTruthy();
    expect(within(kpis).getByText("Income")).toBeTruthy();
    expect(within(kpis).getByText("Expenses")).toBeTruthy();
    expect(within(kpis).getByText("Subscriptions")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Cash flow" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Spending by category" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recurring" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Daily spending" })).toBeTruthy();
    expect(document.querySelector("svg.money-rings")).toBeTruthy();
    expect(document.querySelector("svg.money-sankey")).toBeTruthy();
    expect(document.querySelectorAll(".money-sankey-link").length).toBeGreaterThan(0);
    expect(document.querySelector("svg.money-scatter")).toBeTruthy();
    expect(document.querySelectorAll(".money-heat-grid .money-heat-cell")).toHaveLength(84);
    expect(screen.getByText("W1")).toBeTruthy();
    expect(screen.getAllByText("Groceries").length).toBeGreaterThan(0);
    expect(screen.getByText("Whole Foods")).toBeTruthy();
    expect(screen.getByText("11 transactions")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search transactions" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Transactions" })).toBeTruthy();
    expect(screen.queryByText("Coffee 6")).toBeNull();
    expect(screen.getByRole("heading", { name: "Subscriptions" })).toBeTruthy();
    expect(screen.getAllByText("Spotify")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Confirm Spotify" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Month" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Coffee 6")).toBeTruthy();
    expect(screen.queryByText("Whole Foods")).toBeNull();
  });

  it("filters the table from category, amount, and day controls", () => {
    render(<FinancePage scope={{ type: "money" }} />);

    const categoryCard = screen.getByRole("heading", { name: "Spending by category" }).closest("section");
    fireEvent.click(within(categoryCard as HTMLElement).getByRole("button", { name: /Groceries/ }));
    expect(screen.getByText("1 transaction")).toBeTruthy();
    expect(screen.getByText("Whole Foods")).toBeTruthy();
    expect(screen.queryByText("Acme payroll")).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "All categories" }), {
      target: { value: "all" },
    });
    fireEvent.click(within(screen.getByRole("region", { name: "This month" })).getByRole("button", { name: /Income/ }));
    expect(screen.getByText("1 transaction")).toBeTruthy();
    expect(screen.getByText("Acme payroll")).toBeTruthy();
    expect(screen.queryByText("Whole Foods")).toBeNull();

    fireEvent.click(within(screen.getByRole("region", { name: "This month" })).getByRole("button", { name: /Income/ }));
    fireEvent.click(screen.getByRole("button", { name: /2026-09-03:/ }));
    expect(screen.getByText(/3 transactions/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear day" })).toBeTruthy();
    expect(screen.getByText("Whole Foods")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear day" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search transactions" }), {
      target: { value: "Whole" },
    });
    expect(screen.getByText("1 transaction")).toBeTruthy();
    expect(screen.getByText("Whole Foods")).toBeTruthy();
    expect(screen.queryByText("Acme payroll")).toBeNull();
  });

  it("filters spending from a cash-flow sink and opens a subscription from the scatter", () => {
    render(<FinancePage scope={{ type: "money" }} />);

    const cashFlow = screen.getByRole("heading", { name: "Cash flow" }).closest("section");
    fireEvent.click(within(cashFlow as HTMLElement).getByRole("button", { name: /Groceries/ }));
    expect(screen.getByText("1 transaction")).toBeTruthy();
    expect(screen.getByText("Whole Foods")).toBeTruthy();
    expect(screen.queryByText("Acme payroll")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Spotify, / }));
    expect(screen.getByRole("dialog", { name: "Subscription" })).toBeTruthy();
  });

  it("keeps subscriptions on the same Money page", () => {
    render(<FinancePage scope={{ type: "subscriptions" }} />);

    expect(screen.getByRole("region", { name: "This month" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Cash flow" })).toBeTruthy();
    expect(screen.getByText("Spotify")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Due" })).toBeNull();
    expect(screen.queryByText("Per month")).toBeNull();
  });

  it("does not show starter add rows when the page already has add controls", () => {
    finance.workspace = {
      version: 1,
      currency: "EUR",
      months: [],
      subscriptions: [],
      transactions: [],
    };
    render(<FinancePage scope={{ type: "money" }} />);

    expect(screen.queryByRole("button", { name: "Income" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Expense" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Subscriptions" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Cash flow" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Spending by category" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recurring" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Daily spending" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "This month" })).toBeTruthy();
    expect(screen.queryByText("Total results")).toBeNull();
    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.getByRole("button", { name: "Add a subscription" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Add a record" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add transaction" })).toBeTruthy();
  });

  it("uses the mobile canvas when the desktop titlebar is hidden", () => {
    render(<FinancePage scope={{ type: "money" }} sidebarVisible={false} hideTitleBar />);
    expect(document.querySelector(".mobile-money.is-dashboard")).toBeTruthy();
    expect(document.querySelector(".money-page")).toBeNull();
    expect(document.querySelector(".note-titlebar")).toBeNull();
  });

  it("keeps a decimal in the amount field while typing", () => {
    render(<FinancePage scope={{ type: "money" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    const amount = screen.getByPlaceholderText("0.00");
    fireEvent.focus(amount);
    fireEvent.change(amount, { target: { value: "1." } });
    expect((amount as HTMLInputElement).value).toBe("1.");
    fireEvent.change(amount, { target: { value: "0." } });
    expect((amount as HTMLInputElement).value).toBe("0.");
  });

  it("lets a record pick an existing category or create a new one", async () => {
    render(<FinancePage scope={{ type: "money" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    const dialog = screen.getByRole("dialog", { name: "Record" });
    const category = within(dialog).getByRole("combobox", { name: "Category" });
    expect(category.getAttribute("placeholder")).toBe("What for");

    fireEvent.focus(category);
    fireEvent.click(within(await screen.findByRole("listbox", { name: "Categories" })).getByRole("option", { name: "Groceries" }));
    expect((category as HTMLInputElement).value).toBe("Groceries");

    fireEvent.click(within(dialog).getByRole("radio", { name: "Income" }));
    expect(category.getAttribute("placeholder")).toBe("Where from");
    fireEvent.change(category, { target: { value: "Payroll" } });
    fireEvent.click(await screen.findByRole("button", { name: /Create .Payroll./ }));
    expect((category as HTMLInputElement).value).toBe("Payroll");
  });
});

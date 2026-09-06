import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTE_LIST_ROW_INSET_CLASS } from "../notes/VirtualizedNoteList";
import { MoneyList } from "./MoneyList";

vi.mock("../../context/FinanceContext", () => ({
  useFinance: () => ({
    workspace: {
      version: 1,
      currency: "EUR",
      subscriptions: [],
      transactions: [],
    },
  }),
}));

describe("MoneyList", () => {
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

  it("uses the folder-rail glide highlight on money rows", () => {
    const { container } = render(
      <MoneyList scope={{ type: "money" }} onSelect={vi.fn()} />,
    );

    expect(container.querySelector("[data-glide]")).not.toBeNull();
    expect(screen.getByRole("button", { name: /overview/i }).hasAttribute("data-row")).toBe(true);
    expect(screen.getByRole("button", { name: /this month/i }).hasAttribute("data-row")).toBe(true);
    expect(screen.getByRole("button", { name: /subscriptions/i }).hasAttribute("data-row")).toBe(true);
    expect(screen.getByRole("button", { name: /overview/i }).querySelector(".overview-glyph")).toBeTruthy();
    expect(screen.getByRole("button", { name: /subscriptions/i }).querySelector(".subscriptions-glyph")).toBeTruthy();
    expect(screen.getByRole("button", { name: /this month/i }).querySelector(".journal-glyph")).toBeTruthy();
    expect(container.querySelector("svg.lucide")).toBeNull();
  });

  it("uses the same horizontal inset as the journal note list", () => {
    const { container } = render(
      <MoneyList scope={{ type: "money" }} onSelect={vi.fn()} />,
    );

    expect(container.querySelector("[data-money-list]")).not.toBeNull();
    const gutter = container.querySelector("[data-money-list-row]");
    expect(gutter?.className).toContain(NOTE_LIST_ROW_INSET_CLASS);

    const row = screen.getByRole("button", { name: /overview/i });
    expect(row.classList.contains("px-3.5")).toBe(true);
    expect(row.classList.contains("rounded-[10px]")).toBe(true);
  });
});

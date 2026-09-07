import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JournalCalendar } from "./JournalCalendar";

describe("JournalCalendar", () => {
  beforeEach(() => {
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
    vi.unstubAllGlobals();
  });

  it("marks days with journal entries and has no chrome above the grid", () => {
    const onSelectDate = vi.fn();
    render(
      <JournalCalendar
        selected={new Date(2026, 0, 15)}
        journalDates={new Set(["2026-01-15"])}
        onSelectDate={onSelectDate}
        mode="week"
      />,
    );

    expect(screen.getByRole("button", { name: "15", pressed: true }).className).toContain("has-journal");
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next week" })).toBeNull();
  });
});

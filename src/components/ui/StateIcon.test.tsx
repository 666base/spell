import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AllNotesGlyph, ArchiveGlyph, HomeGlyph, JournalGlyph, MoneyGlyph, MoneyKindGlyph, OverviewGlyph, PanelToggleIcon, ProjectsGlyph, SubscriptionsGlyph } from "./StateIcon";

describe("PanelToggleIcon", () => {
  afterEach(() => {
    cleanup();
  });

  it("draws a sidebar pane that tracks open vs closed", () => {
    const { rerender, container } = render(<PanelToggleIcon side="left" open />);
    const svg = container.querySelector(".panel-toggle-icon");
    expect(svg?.getAttribute("data-open")).toBe("true");
    expect(svg?.getAttribute("data-side")).toBe("left");
    expect(container.querySelector(".panel-toggle-pane")).toBeTruthy();
    expect(container.querySelector(".panel-toggle-divider")).toBeTruthy();

    rerender(<PanelToggleIcon side="left" open={false} />);
    expect(container.querySelector(".panel-toggle-icon")?.getAttribute("data-open")).toBe("false");
  });

  it("anchors the pane to the right for the right rail", () => {
    const { container } = render(<PanelToggleIcon side="right" open={false} />);
    const pane = container.querySelector(".panel-toggle-pane");
    expect(pane?.getAttribute("x")).toBe("15");
    expect(container.querySelector(".panel-toggle-icon")?.getAttribute("data-side")).toBe("right");
  });
});

describe("source glyphs", () => {
  afterEach(() => {
    cleanup();
  });

  it("paints Journal as a calendar and keeps Projects, Money, and Home two-tone", () => {
    const { container, rerender } = render(<JournalGlyph />);
    expect(container.querySelector(".journal-glyph")).toBeTruthy();
    expect(container.querySelector(".journal-glyph-page")).toBeTruthy();
    expect(container.querySelector(".journal-glyph-header")).toBeTruthy();
    expect(container.querySelectorAll(".journal-glyph-ring").length).toBe(2);
    expect(container.querySelectorAll(".journal-glyph-day").length).toBe(6);
    rerender(<ProjectsGlyph />);
    expect(container.querySelectorAll(".source-glyph-light").length).toBe(3);
    rerender(<MoneyGlyph />);
    expect(container.querySelector(".money-glyph")).toBeTruthy();
    expect(container.querySelector(".money-glyph-card")).toBeTruthy();
    expect(container.querySelector(".money-glyph-stripe")).toBeTruthy();
    expect(container.querySelector(".money-glyph-chip")).toBeTruthy();
    expect(container.querySelector(".money-glyph-mark")).toBeTruthy();
    rerender(<HomeGlyph />);
    expect(container.querySelector(".home-glyph")).toBeTruthy();
    expect(container.querySelector(".home-glyph-roof")).toBeTruthy();
    expect(container.querySelector(".home-glyph-body")).toBeTruthy();
    expect(container.querySelector(".home-glyph-door")).toBeTruthy();
    rerender(<AllNotesGlyph />);
    expect(container.querySelector(".all-notes-glyph")).toBeTruthy();
    expect(container.querySelectorAll(".all-notes-glyph-line").length).toBe(2);
    rerender(<ArchiveGlyph />);
    expect(container.querySelector(".archive-glyph-box")).toBeTruthy();
    expect(container.querySelector(".archive-glyph-lid")).toBeTruthy();
    rerender(<OverviewGlyph />);
    expect(container.querySelector(".overview-glyph")).toBeTruthy();
    expect(container.querySelectorAll(".overview-glyph-tile").length).toBe(3);
    rerender(<SubscriptionsGlyph />);
    expect(container.querySelector(".subscriptions-glyph-back")).toBeTruthy();
    expect(container.querySelector(".subscriptions-glyph-card")).toBeTruthy();
    rerender(<MoneyKindGlyph kind="month" />);
    expect(container.querySelector(".journal-glyph")).toBeTruthy();
    expect(container.querySelector("svg.lucide")).toBeNull();
  });
});

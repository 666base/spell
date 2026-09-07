import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paintCheckmark } from "./StateIcon";

describe("paintCheckmark", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("snaps hidden on first unchecked paint", () => {
    const span = document.createElement("span");
    paintCheckmark(span, false, false);
    expect(span.dataset.state).toBe("unchecked");
    expect(span.dataset.motion).toBe("snap");
    expect(span.querySelectorAll(".state-checkmark-mark")).toHaveLength(1);
  });

  it("snaps drawn on first checked paint", () => {
    const span = document.createElement("span");
    paintCheckmark(span, true, false);
    expect(span.dataset.state).toBe("checked");
    expect(span.dataset.motion).toBe("snap");
  });

  it("draws from hidden to visible instead of snapping", () => {
    const span = document.createElement("span");
    paintCheckmark(span, false, false);
    paintCheckmark(span, true, true);
    expect(span.dataset.state).toBe("checked");
    expect(span.dataset.motion).toBe("draw");
  });

  it("reverses the stroke on uncheck instead of snapping", () => {
    const span = document.createElement("span");
    paintCheckmark(span, true, false);
    paintCheckmark(span, false, true);
    expect(span.dataset.state).toBe("unchecked");
    expect(span.dataset.motion).toBe("draw");
  });

  it("replaces a two-stroke mark with a single path", () => {
    const span = document.createElement("span");
    span.innerHTML = `<svg class="state-checkmark-svg"><path class="state-checkmark-short"></path><path class="state-checkmark-long"></path></svg>`;
    paintCheckmark(span, true, false);
    expect(span.querySelectorAll("path")).toHaveLength(1);
    expect(span.querySelector(".state-checkmark-mark")).not.toBeNull();
  });

  it("keeps an already-painted mark snapped so opening a note does not redraw", () => {
    const span = document.createElement("span");
    span.dataset.state = "checked";
    paintCheckmark(span, true, false);
    expect(span.dataset.motion).toBe("snap");
  });

  it("snaps when the user prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    const span = document.createElement("span");
    paintCheckmark(span, false, false);
    paintCheckmark(span, true, true);
    expect(span.dataset.state).toBe("checked");
    expect(span.dataset.motion).toBe("snap");
  });
});

describe("checkmark optical size", () => {
  it("grows the tick inside the editor checkbox without growing the button", () => {
    const css = readFileSync("src/App.css", "utf8");
    const taskList = css.slice(css.indexOf("/* Task list checkbox styles */"));
    expect(taskList).toMatch(
      /ul\[data-type="taskList"\] li > label input\[type="checkbox"\] \{[^}]*width: 1\.125rem;/,
    );
    expect(taskList).toMatch(
      /ul\[data-type="taskList"\] li > label > span \.state-checkmark-svg \{\s*width: 14px;\s*height: 14px;/,
    );
    expect(taskList).not.toMatch(
      /ul\[data-type="taskList"\] li > label > span \.state-checkmark-svg \{\s*width: 11px;/,
    );
  });

  it("grows circular check ticks without changing the 22px money-row button", () => {
    const css = readFileSync("src/App.css", "utf8");
    expect(css).toMatch(/\.money-row-check \{[^}]*width: 22px;[^}]*height: 22px;/s);
    expect(readFileSync("src/components/kanban/ProjectsHub.tsx", "utf8")).toMatch(
      /<CheckmarkIcon checked=\{done\} className="size-3\.5" \/>/,
    );
    expect(readFileSync("src/components/finance/FinancePage.tsx", "utf8")).toMatch(
      /<CheckmarkIcon checked=\{checked\} className="size-3\.5" \/>/,
    );
    expect(readFileSync("src/components/kanban/KanbanPage.tsx", "utf8")).toMatch(
      /className=\{size === "sm" \? "size-3" : "size-3\.5"\}/,
    );
    expect(readFileSync("src/components/kanban/KanbanPage.tsx", "utf8")).toContain(
      'size === "sm" ? "size-4" : "size-[1.125rem]"',
    );
  });
});

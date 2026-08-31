import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paintCheckmark } from "./StateIcon";

function offset(span: HTMLElement, className: string) {
  return span.querySelector(className)?.getAttribute("stroke-dashoffset");
}

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
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("snaps hidden on first unchecked paint", () => {
    const span = document.createElement("span");
    paintCheckmark(span, false, false);
    expect(offset(span, ".state-checkmark-short")).toBe("1");
    expect(offset(span, ".state-checkmark-long")).toBe("1");
  });

  it("snaps drawn on first checked paint", () => {
    const span = document.createElement("span");
    paintCheckmark(span, true, false);
    expect(offset(span, ".state-checkmark-short")).toBe("0");
    expect(offset(span, ".state-checkmark-long")).toBe("0");
  });

  it("draws from hidden to visible instead of snapping", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 16);
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));

    const span = document.createElement("span");
    paintCheckmark(span, false, false);
    paintCheckmark(span, true, true);

    const start = Number(offset(span, ".state-checkmark-short"));
    expect(start).toBeGreaterThan(0);

    return new Promise<void>((resolve) => {
      window.setTimeout(() => {
        const mid = Number(offset(span, ".state-checkmark-short"));
        expect(mid).toBeLessThan(start);
        expect(mid).toBeGreaterThanOrEqual(0);
        resolve();
      }, 50);
    });
  });
});

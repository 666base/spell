import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { VirtualizedNoteList } from "./VirtualizedNoteList";

function mockListMetrics() {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 280,
  });
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 600,
      right: 280,
      width: 280,
      height: this.hasAttribute("data-virtual-list") ? 600 : 64,
      toJSON() {
        return {};
      },
    };
  };
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

describe("VirtualizedNoteList", () => {
  beforeEach(() => {
    mockListMetrics();
  });

  it("keeps DOM nodes bounded for 5000 notes", () => {
    const count = 5000;
    const { container } = render(
      <div style={{ height: 600, width: 280 }}>
        <VirtualizedNoteList
          count={count}
          renderRow={(index) => (
            <div data-testid="note-row">{`Note ${index}`}</div>
          )}
        />
      </div>,
    );

    const mounted = container.querySelectorAll("[data-index]");
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length).toBeLessThan(80);
    expect(container.querySelectorAll('[data-testid="note-row"]').length).toBe(
      mounted.length,
    );
  });
});

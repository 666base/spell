import { describe, expect, it, vi } from "vitest";
import {
  onWindowDragPointerDown,
  shouldStartWindowDrag,
  type WindowDragPointerEvent,
} from "./windowDrag";

function event(overrides: Partial<WindowDragPointerEvent> & { target: EventTarget | null }): WindowDragPointerEvent {
  return {
    button: 0,
    pointerType: "mouse",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

describe("windowDrag", () => {
  it("starts a window drag from empty titlebar chrome", () => {
    const target = document.createElement("div");
    target.dataset.tauriDragRegion = "";
    const startDragging = vi.fn();
    const pointer = event({ target });

    expect(shouldStartWindowDrag(pointer)).toBe(true);
    onWindowDragPointerDown(pointer, startDragging);
    expect(pointer.preventDefault).toHaveBeenCalled();
    expect(startDragging).toHaveBeenCalledTimes(1);
  });

  it("starts a window drag from the title text inside the bar", () => {
    const bar = document.createElement("div");
    bar.dataset.tauriDragRegion = "";
    const title = document.createElement("span");
    title.className = "titlebar-title";
    title.textContent = "Home";
    bar.append(title);

    expect(shouldStartWindowDrag(event({ target: title }))).toBe(true);
  });

  it("does not steal clicks from titlebar buttons or window controls", () => {
    const bar = document.createElement("div");
    const controls = document.createElement("div");
    controls.className = "titlebar-no-drag window-controls";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Minimize";
    controls.append(button);
    bar.append(controls);

    const startDragging = vi.fn();
    const pointer = event({ target: button });
    onWindowDragPointerDown(pointer, startDragging);

    expect(shouldStartWindowDrag(pointer)).toBe(false);
    expect(pointer.preventDefault).not.toHaveBeenCalled();
    expect(startDragging).not.toHaveBeenCalled();
  });

  it("ignores modifier clicks and non-primary buttons", () => {
    const target = document.createElement("div");
    expect(shouldStartWindowDrag(event({ target, button: 2 }))).toBe(false);
    expect(shouldStartWindowDrag(event({ target, ctrlKey: true }))).toBe(false);
    expect(shouldStartWindowDrag(event({ target, pointerType: "touch" }))).toBe(false);
  });
});

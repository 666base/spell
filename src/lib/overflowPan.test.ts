import { describe, expect, it } from "vitest";
import {
  axisFromDelta,
  bindOverflowPan,
  clamp,
  inertiaVelocity,
  overflowAmount,
  PAN_SLOP,
  panScroll,
  velocityFromSamples,
} from "./overflowPan";

describe("overflowPan", () => {
  it("clamps scroll to the overflow range", () => {
    expect(clamp(-10, 0, 200)).toBe(0);
    expect(clamp(80, 0, 200)).toBe(80);
    expect(clamp(240, 0, 200)).toBe(200);
  });

  it("treats content that fits as non-pannable", () => {
    expect(overflowAmount(320, 320)).toBe(0);
    expect(overflowAmount(280, 320)).toBe(0);
    expect(overflowAmount(640, 320)).toBe(320);
  });

  it("locks axis after the slop, preferring the dominant direction", () => {
    expect(axisFromDelta(4, 3)).toBeNull();
    expect(axisFromDelta(PAN_SLOP, 4)).toBe("x");
    expect(axisFromDelta(4, PAN_SLOP)).toBe("y");
    expect(axisFromDelta(-24, 8)).toBe("x");
  });

  it("moves content 1:1 with the pointer", () => {
    expect(panScroll(120, 40, 400)).toBe(80);
    expect(panScroll(120, -40, 400)).toBe(160);
    expect(panScroll(10, 40, 400)).toBe(0);
  });

  it("reads release velocity from recent samples", () => {
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 16, x: -8, y: 1 },
      { t: 32, x: -20, y: 2 },
    ];
    expect(velocityFromSamples(samples, "x")).toBeCloseTo(-20 / 32);
    expect(velocityFromSamples(samples, "y")).toBeCloseTo(2 / 32);
    expect(velocityFromSamples(samples.slice(0, 1), "x")).toBe(0);
  });

  it("decays inertia and stops for reduced motion", () => {
    expect(inertiaVelocity(1.2, 16, true)).toBe(0);
    expect(inertiaVelocity(0.01, 16, false)).toBe(0);
    expect(inertiaVelocity(1.2, 16, false)).toBeGreaterThan(0);
    expect(inertiaVelocity(1.2, 16, false)).toBeLessThan(1.2);
  });

  it("drags an overflowing container without a scrollbar", () => {
    const element = document.createElement("div");
    Object.defineProperties(element, {
      scrollWidth: { configurable: true, get: () => 800 },
      clientWidth: { configurable: true, get: () => 400 },
      scrollHeight: { configurable: true, get: () => 200 },
      clientHeight: { configurable: true, get: () => 200 },
    });
    element.setPointerCapture = () => undefined;
    element.releasePointerCapture = () => undefined;
    element.hasPointerCapture = () => false;
    document.body.appendChild(element);

    const unbind = bindOverflowPan(element, { axis: "x", pointerTypes: ["mouse"] });
    expect(element.dataset.canPan).toBe("true");

    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        pointerId: 1,
        pointerType: "mouse",
        clientX: 200,
        clientY: 20,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        clientX: 140,
        clientY: 22,
      }),
    );

    expect(element.classList.contains("is-panning")).toBe(true);
    expect(element.scrollLeft).toBe(60);

    unbind();
    element.remove();
  });
});

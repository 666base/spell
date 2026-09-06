import { describe, expect, it } from "vitest";
import { EASE_IN_OUT, EASE_OUT } from "./motion";

describe("motion easings", () => {
  it("uses a non-punching ease-out so scaled and sized UI does not bounce", () => {
    expect(EASE_OUT).toEqual([0.2, 0, 0, 1]);
  });

  it("keeps ease-in-out inside the unit square with no overshoot handles", () => {
    expect(EASE_IN_OUT).toEqual([0.4, 0, 0.2, 1]);
    expect(EASE_IN_OUT.every((n) => n >= 0 && n <= 1)).toBe(true);
  });
});

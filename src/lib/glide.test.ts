import { describe, expect, it } from "vitest";
import {
  PIXEL_LOADER_DELAYS_MS,
  formatElapsedSeconds,
  glideOffset,
} from "./glide";

describe("glideOffset", () => {
  it("places the pill in the root's local coordinates", () => {
    expect(
      glideOffset({ top: 80 }, { top: 140, height: 36 }),
    ).toEqual({ top: 60, height: 36 });
  });
});

describe("formatElapsedSeconds", () => {
  it("formats tenths without going negative", () => {
    expect(formatElapsedSeconds(1_000, 2_450)).toBe("1.4");
    expect(formatElapsedSeconds(1_000, 900)).toBe("0.0");
  });
});

describe("PIXEL_LOADER_DELAYS_MS", () => {
  it("keeps the 3x3 Drive stagger from Beautiful UI", () => {
    expect(PIXEL_LOADER_DELAYS_MS).toHaveLength(9);
    expect(PIXEL_LOADER_DELAYS_MS[0]).toBe(90);
    expect(PIXEL_LOADER_DELAYS_MS[3]).toBe(0);
  });
});

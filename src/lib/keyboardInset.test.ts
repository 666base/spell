import { describe, expect, it } from "vitest";
import {
  isKeyboardOpen,
  readCssKeyboardInset,
  readNativeIme,
  resolveKeyboardInset,
  visualViewportGap,
} from "./keyboardInset";

describe("resolveKeyboardInset", () => {
  it("keeps the largest source so JS cannot wipe a native IME height", () => {
    expect(resolveKeyboardInset([0, 0, 312])).toBe(312);
    expect(resolveKeyboardInset([320, 0, 12])).toBe(320);
  });

  it("ignores non-finite values", () => {
    expect(resolveKeyboardInset([Number.NaN, Number.POSITIVE_INFINITY, 48])).toBe(48);
  });
});

describe("readNativeIme", () => {
  it("uses the stored fallback when the bridge reports 0", () => {
    expect(
      readNativeIme({
        SpellIme: { getInset: () => 0 },
        __SPELL_IME__: 288,
      }),
    ).toBe(288);
  });

  it("uses the bridge when it is the larger value", () => {
    expect(
      readNativeIme({
        SpellIme: { getInset: () => 301.4 },
        __SPELL_IME__: 12,
      }),
    ).toBe(301.4);
  });
});

describe("visualViewportGap", () => {
  it("is the space below the visual viewport", () => {
    expect(visualViewportGap(800, { offsetTop: 0, height: 500 })).toBe(300);
    expect(visualViewportGap(800, { offsetTop: 0, height: 800 })).toBe(0);
  });
});

describe("readCssKeyboardInset", () => {
  it("parses a px custom property", () => {
    expect(readCssKeyboardInset("312px")).toBe(312);
    expect(readCssKeyboardInset("")).toBe(0);
  });
});

describe("isKeyboardOpen", () => {
  it("treats nav-bar-sized insets as closed", () => {
    expect(isKeyboardOpen(0)).toBe(false);
    expect(isKeyboardOpen(48)).toBe(false);
    expect(isKeyboardOpen(120)).toBe(true);
  });
});

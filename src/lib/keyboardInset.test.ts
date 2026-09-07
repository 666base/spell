import { describe, expect, it } from "vitest";
import {
  isKeyboardOpen,
  pinToolbarAboveKeyboard,
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

describe("pinToolbarAboveKeyboard", () => {
  const toolbarHeight = 44;

  it("sits on the visual viewport when the IME shrinks it", () => {
    const pin = pinToolbarAboveKeyboard({
      innerHeight: 800,
      visualOffsetTop: 0,
      visualHeight: 500,
      nativeIme: 0,
      virtualIme: 0,
      toolbarHeight,
    });
    expect(pin.keyboardTop).toBe(500);
    expect(pin.y).toBe(456);
    expect(pin.inset).toBe(300);
  });

  it("uses native IME height when the visual viewport does not shrink", () => {
    const pin = pinToolbarAboveKeyboard({
      innerHeight: 800,
      visualOffsetTop: 0,
      visualHeight: 800,
      nativeIme: 300,
      virtualIme: 0,
      toolbarHeight,
    });
    expect(pin.keyboardTop).toBe(500);
    expect(pin.y).toBe(456);
    expect(pin.inset).toBe(300);
  });

  it("does not double-count matching visual and native insets", () => {
    const pin = pinToolbarAboveKeyboard({
      innerHeight: 800,
      visualOffsetTop: 0,
      visualHeight: 500,
      nativeIme: 300,
      virtualIme: 0,
      toolbarHeight,
    });
    expect(pin.keyboardTop).toBe(500);
    expect(pin.y).toBe(456);
  });

  it("stays at the layout bottom when the keyboard is closed", () => {
    const pin = pinToolbarAboveKeyboard({
      innerHeight: 800,
      visualOffsetTop: 0,
      visualHeight: 800,
      nativeIme: 0,
      virtualIme: 0,
      toolbarHeight,
    });
    expect(pin.keyboardTop).toBe(800);
    expect(pin.y).toBe(756);
    expect(pin.inset).toBe(0);
  });

  it("follows a panned visual viewport so the bar stays on screen", () => {
    const pin = pinToolbarAboveKeyboard({
      innerHeight: 800,
      visualOffsetTop: 120,
      visualHeight: 480,
      nativeIme: 0,
      virtualIme: 0,
      toolbarHeight,
    });
    expect(pin.keyboardTop).toBe(600);
    expect(pin.y).toBe(556);
  });
});

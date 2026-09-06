import { describe, expect, it } from "vitest";
import { applyResolvedTheme, rememberResolvedTheme, RESOLVED_THEME_KEY, resolveStartupTheme } from "./themeSwitch";

describe("applyResolvedTheme", () => {
  it("snaps the class on first paint without freezing transitions", () => {
    const root = document.createElement("div");
    applyResolvedTheme(root, "dark", false);
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("theme-switching")).toBe(false);
  });

  it("freezes transitions for the frame of a later toggle", () => {
    const root = document.createElement("div");
    applyResolvedTheme(root, "dark", true);
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("theme-switching")).toBe(true);
  });

  it("removes dark when switching to light", () => {
    const root = document.createElement("div");
    root.classList.add("dark");
    applyResolvedTheme(root, "light", false);
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("remembers the last resolved theme so the next launch can paint it first", () => {
    const saved: Record<string, string> = {};
    rememberResolvedTheme("light", {
      setItem(key, value) {
        saved[key] = value;
      },
    });
    expect(saved[RESOLVED_THEME_KEY]).toBe("light");
  });
});

describe("resolveStartupTheme", () => {
  it("uses the last session when system preference would disagree", () => {
    expect(resolveStartupTheme("light", true)).toBe("light");
    expect(resolveStartupTheme("dark", false)).toBe("dark");
  });

  it("falls back to system preference with no stored theme", () => {
    expect(resolveStartupTheme(null, true)).toBe("dark");
    expect(resolveStartupTheme(undefined, false)).toBe("light");
  });
});

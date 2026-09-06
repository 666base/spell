import { describe, expect, it } from "vitest";
import { defaultThemeColors, resolveThemeColor } from "./ThemeContext";

describe("defaultThemeColors", () => {
  it("uses Anytype surfaces, not lifted Apple gray", () => {
    expect(defaultThemeColors.dark.bg).toBe("#171717");
    expect(defaultThemeColors.dark["bg-secondary"]).toBe("#171717");
    expect(defaultThemeColors.dark.border).toBe("#292929");
    expect(defaultThemeColors.dark.text).toBe("#e1e1e1");
    expect(defaultThemeColors.light.bg).toBe("#ffffff");
    expect(defaultThemeColors.light["bg-secondary"]).toBe("#ffffff");
    expect(defaultThemeColors.light.border).toBe("#ebebeb");
    expect(defaultThemeColors.light.text).toBe("#252525");
  });

  it("does not keep saved Apple or split-chrome colors", () => {
    expect(
      resolveThemeColor("dark", "bg-secondary", { "bg-secondary": "#2c2c2e" }, defaultThemeColors.dark),
    ).toBe("#171717");
    expect(
      resolveThemeColor("dark", "bg-secondary", { "bg-secondary": "#191919" }, defaultThemeColors.dark),
    ).toBe("#171717");
    expect(
      resolveThemeColor("light", "bg-secondary", { "bg-secondary": "#f2f2f7" }, defaultThemeColors.light),
    ).toBe("#ffffff");
  });
});

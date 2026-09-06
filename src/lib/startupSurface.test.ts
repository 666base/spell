// @ts-nocheck — reads files from disk; the app tsconfig has no Node types.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultThemeColors } from "../context/ThemeContext";
import { RESOLVED_THEME_KEY } from "./themeSwitch";

describe("first-paint surfaces", () => {
  it("keeps the HTML splash the same hex as the canvas", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain(`background: ${defaultThemeColors.dark.bg};`);
    expect(html).toContain(`background: ${defaultThemeColors.light.bg};`);
    expect(html).not.toContain("#100e0d");
    expect(html).not.toContain("#f7f7f5");
  });

  it("keeps the Android window behind the WebView on the same dark canvas", () => {
    const xml = readFileSync(
      resolve(process.cwd(), "src-tauri/gen/android/app/src/main/res/values/colors.xml"),
      "utf8",
    );
    expect(xml).toContain(`spell_window_surface">#FF${defaultThemeColors.dark.bg.slice(1).toUpperCase()}</color>`);
  });

  it("reads the same storage key the blocking startup script writes against", () => {
    const script = readFileSync(resolve(process.cwd(), "public/startup-theme.js"), "utf8");
    expect(script).toContain(RESOLVED_THEME_KEY);
  });
});

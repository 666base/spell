// @ts-nocheck — reads files from disk; the app tsconfig has no Node types.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultThemeColors } from "../context/ThemeContext";
import { RESOLVED_THEME_KEY } from "./themeSwitch";
import {
  EDITOR_MAX_WIDTH_KEY,
  INTERFACE_ZOOM_KEY,
  SESSION_KEY,
  SIDEBAR_WIDTH_KEY,
  applyStartupLayout,
  parseSession,
  parseStoredEditorMaxWidth,
  parseStoredSidebarWidth,
  parseStoredZoom,
  rememberEditorMaxWidth,
  rememberInterfaceZoom,
  rememberSession,
  rememberSidebarWidth,
  shouldPaintAppChrome,
  shouldShowFolderPicker,
} from "./startupSurface";

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

  it("reads the same storage keys the blocking startup script writes against", () => {
    const script = readFileSync(resolve(process.cwd(), "public/startup-theme.js"), "utf8");
    expect(script).toContain(RESOLVED_THEME_KEY);
    expect(script).toContain(INTERFACE_ZOOM_KEY);
    expect(script).toContain(SIDEBAR_WIDTH_KEY);
    expect(script).toContain(EDITOR_MAX_WIDTH_KEY);
  });

  it("keeps a size-adjusted fallback and optional latin display for SN Pro", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
    expect(css).toContain('font-family: "SN Pro Fallback"');
    expect(css).toContain("font-display: optional");
    expect(css).toContain('"SN Pro Fallback"');
    expect(css).toContain(".workspace-detail-panel.is-animating");
    expect(css).not.toMatch(/\.workspace-detail-panel \{[^}]*@starting-style/s);
    expect(css).not.toMatch(/\.app-workspace-panel\.is-animating \{[^}]*transition:\s*width/s);
    expect(css).toContain(".app-workspace-panel.is-animating .app-workspace-panel-inner");
    expect(css).toContain("translate3d(-100%, 0, 0)");
    expect(css).toContain('.app-workspace-panel[data-state="closed"]::after');
    expect(css).toContain("content: none");
  });
});

describe("startup layout cache", () => {
  it("parses zoom, sidebar width, and editor max width", () => {
    expect(parseStoredZoom("1.15")).toBe(1.15);
    expect(parseStoredZoom("2")).toBeNull();
    expect(parseStoredSidebarWidth("280")).toBe(280);
    expect(parseStoredSidebarWidth("100")).toBeNull();
    expect(parseStoredEditorMaxWidth("48rem")).toBe("48rem");
    expect(parseStoredEditorMaxWidth("url(x)")).toBeNull();
  });

  it("applies cached layout onto the document root", () => {
    const root = document.createElement("div");
    applyStartupLayout(root, {
      zoom: "1.2",
      sidebarWidth: "300",
      editorMaxWidth: "36rem",
    });
    expect(root.style.zoom).toBe("1.2");
    expect(root.style.getPropertyValue("--sidebar-width")).toBe("300px");
    expect(root.style.getPropertyValue("--editor-max-width")).toBe("36rem");
  });

  it("remembers layout values for the next launch", () => {
    const saved: Record<string, string> = {};
    const storage = {
      setItem(key: string, value: string) {
        saved[key] = value;
      },
      removeItem(key: string) {
        delete saved[key];
      },
    };
    rememberInterfaceZoom(1.1, storage);
    rememberSidebarWidth(320, storage);
    rememberEditorMaxWidth("64rem", storage);
    expect(saved[INTERFACE_ZOOM_KEY]).toBe("1.1");
    expect(saved[SIDEBAR_WIDTH_KEY]).toBe("320");
    expect(saved[EDITOR_MAX_WIDTH_KEY]).toBe("64rem");
    rememberSidebarWidth(null, storage);
    expect(saved[SIDEBAR_WIDTH_KEY]).toBeUndefined();
  });
});

describe("app chrome while notes load", () => {
  it("paints chrome during load and only shows the folder picker after a miss", () => {
    expect(shouldPaintAppChrome(true, null)).toBe(true);
    expect(shouldShowFolderPicker(true, null)).toBe(false);
    expect(shouldPaintAppChrome(false, "/vault")).toBe(true);
    expect(shouldShowFolderPicker(false, "/vault")).toBe(false);
    expect(shouldPaintAppChrome(false, null)).toBe(false);
    expect(shouldShowFolderPicker(false, null)).toBe(true);
  });
});

describe("session surface", () => {
  it("rejects malformed session payloads", () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession({ noteId: "", scope: { type: "all" } })).toBeNull();
    expect(parseSession({ noteId: "A", scope: { type: "folder" } })).toBeNull();
    expect(parseSession({ noteId: "A", scope: { type: "folder", path: "Inbox" } })).toEqual({
      noteId: "A",
      scope: { type: "folder", path: "Inbox" },
    });
    expect(parseSession({ noteId: null, scope: { type: "home" } })).toEqual({
      noteId: null,
      scope: { type: "home" },
    });
  });

  it("merges the last note and scope", () => {
    const saved: Record<string, string> = {};
    const storage = {
      getItem(key: string) {
        return saved[key] ?? null;
      },
      setItem(key: string, value: string) {
        saved[key] = value;
      },
      removeItem(key: string) {
        delete saved[key];
      },
    };
    rememberSession({ noteId: "Inbox/Todo", scope: { type: "folder", path: "Inbox" } }, storage);
    rememberSession({ noteId: "Meeting" }, storage);
    expect(JSON.parse(saved[SESSION_KEY])).toEqual({
      noteId: "Meeting",
      scope: { type: "folder", path: "Inbox" },
    });
  });
});

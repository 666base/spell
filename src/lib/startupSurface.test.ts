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

  it("keeps App.css dark canvas tokens on the same hex", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
    expect(css).toContain(`--color-bg: ${defaultThemeColors.dark.bg};`);
    expect(css).toContain(`--color-bg-secondary: ${defaultThemeColors.dark["bg-secondary"]};`);
  });

  it("keeps the writing well darker than sidebar chrome in dark mode", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
    const editor = readFileSync(resolve(process.cwd(), "src/components/editor/Editor.tsx"), "utf8");
    const journal = readFileSync(resolve(process.cwd(), "src/components/journal/JournalPage.tsx"), "utf8");
    const sidebar = readFileSync(resolve(process.cwd(), "src/components/layout/Sidebar.tsx"), "utf8");

    expect(css).toContain("--color-editor-bg: #000000;");
    expect(css).toMatch(/\.editor-canvas \{[^}]*background: var\(--color-editor-bg\);/s);
    expect(css).toMatch(/\.app-sidebar-surface \{[^}]*background: var\(--color-bg\);/s);
    expect(css).toMatch(/\.mobile-editor-body \{[^}]*background: var\(--color-editor-bg\);/s);
    expect(editor).toContain("editor-canvas");
    expect(editor).not.toMatch(/flex-1 flex flex-col bg-bg/);
    expect(journal).toContain("editor-canvas");
    expect(sidebar).toContain("app-sidebar-surface");
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

describe("mobile shell layout", () => {
  it("skips desktop interface zoom in the blocking startup script", () => {
    const script = readFileSync(resolve(process.cwd(), "public/startup-theme.js"), "utf8");
    expect(script).toContain("/Android/i");
    expect(script).toContain('has("mobile")');
    expect(script).toContain('removeProperty("zoom")');
  });

  it("lays out new desktop surfaces from html.mobile-app, not a viewport breakpoint", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
    const theme = readFileSync(resolve(process.cwd(), "src/context/ThemeContext.tsx"), "utf8");
    expect(css).toMatch(/html\.mobile-app \{\s*--notes-tint: var\(--color-accent\);/);
    expect(css).toContain("html.mobile-app .money-kpis");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain("html.mobile-app .money-insights");
    expect(css).toContain("html.mobile-app .project-hub-body");
    expect(css).toContain("html.mobile-app .project-hub-filters");
    expect(css).toContain("flex-direction: column");
    expect(css).toContain("[data-mobile-shell] .mobile-daily .ProseMirror");
    expect(css).toContain("max-width: 100% !important");
    expect(theme).toContain("isMobileApp");
    expect(theme).toContain('removeProperty("zoom")');
  });

  it("gives folder lists and pager slides breathing room", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
    const pager = readFileSync(
      resolve(process.cwd(), "src/components/layout/mobile/MobilePager.tsx"),
      "utf8",
    );
    expect(css).toContain("--mobile-gutter: 20px");
    expect(css).toContain("--mobile-row-min: 52px");
    expect(css).toContain("--mobile-group-y: 28px");
    expect(css).toContain("min-height: var(--mobile-row-min, 52px)");
    expect(css).toContain("margin: var(--mobile-group-y, 28px) var(--mobile-gutter, 20px)");
    expect(css).toContain("height: 44px");
    expect(pager).toContain("spacing:");
    expect(pager).toContain("14");
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

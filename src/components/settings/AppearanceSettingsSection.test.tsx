import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../context/ThemeContext";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";

vi.mock("../../services/notes", () => ({
  getSettings: vi.fn(() => new Promise(() => undefined)),
  updateSettings: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

vi.mock("../../lib/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/platform")>();
  return { ...actual, isMobileApp: true };
});

describe("AppearanceSettingsSection on mobile", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("hides desktop window controls that squeeze the phone layout", () => {
    render(
      <ThemeProvider>
        <AppearanceSettingsSection />
      </ThemeProvider>,
    );

    expect(screen.getByText("Theme")).toBeTruthy();
    expect(screen.getByText("Typography")).toBeTruthy();
    expect(screen.queryByText("Page Width")).toBeNull();
    expect(screen.queryByText("Interface Zoom")).toBeNull();
    expect(screen.queryByText("Preview")).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ThemeProvider } from "./ThemeContext";

vi.mock("../services/notes", () => ({
  getSettings: vi.fn(() => new Promise(() => undefined)),
  updateSettings: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

describe("ThemeProvider first paint", () => {
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

  it("renders children before settings resolve", () => {
    render(
      <ThemeProvider>
        <div data-testid="child">chrome</div>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("child").textContent).toBe("chrome");
  });
});

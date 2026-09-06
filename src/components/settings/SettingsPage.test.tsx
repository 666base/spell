import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage compact", () => {
  afterEach(() => {
    cleanup();
  });

  it("hosts Home destinations above settings", () => {
    render(
      <SettingsPage
        compact
        onBack={() => undefined}
        prefix={<div>Library destinations</div>}
      />,
    );
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Library destinations")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Account" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Plugins" })).toBeNull();
  });
});

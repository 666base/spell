import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { IconButton } from "./index";

describe("IconButton", () => {
  it("names the control without a native tooltip", () => {
    render(
      <IconButton title="New note">
        <span>+</span>
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "New note" });
    expect(button.getAttribute("title")).toBeNull();
  });
});

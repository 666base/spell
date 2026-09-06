import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PixelLoader } from "./PixelLoader";

describe("PixelLoader", () => {
  it("exposes elapsed time to assistive tech", () => {
    render(<PixelLoader label="Editing" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-label")).toBe("Editing, 0.0 seconds");
    expect(status.textContent).toContain("0.0s");
    expect(status.querySelectorAll(".pixel-loader-cell")).toHaveLength(9);
  });
});

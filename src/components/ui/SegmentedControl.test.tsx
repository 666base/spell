import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SegmentedControl } from "./SegmentedControl";

describe("SegmentedControl", () => {
  it("moves the pill with the selected option", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SegmentedControl
        ariaLabel="Theme"
        value="light"
        onChange={onChange}
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
          { value: "system", label: "System" },
        ]}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(group.style.getPropertyValue("--segmented-index")).toBe("0");

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onChange).toHaveBeenCalledWith("dark");

    rerender(
      <SegmentedControl
        ariaLabel="Theme"
        value="dark"
        onChange={onChange}
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
          { value: "system", label: "System" },
        ]}
      />,
    );
    expect(group.style.getPropertyValue("--segmented-index")).toBe("1");
  });
});

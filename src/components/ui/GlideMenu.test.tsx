import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { GlideMenu } from "./GlideMenu";
import { ListItem } from "./index";

function stubBox(el: HTMLElement, box: { top: number; height: number }) {
  el.getBoundingClientRect = () =>
    ({
      top: box.top,
      height: box.height,
      left: 0,
      right: 100,
      bottom: box.top + box.height,
      width: 100,
      x: 0,
      y: box.top,
      toJSON() {
        return box;
      },
    }) as DOMRect;
}

describe("GlideMenu", () => {
  it("follows the hovered row without painting a selected row", () => {
    const { container } = render(
      <GlideMenu skipSelector='[data-selected="true"]'>
        <button type="button" data-row>
          One
        </button>
        <button type="button" data-row data-selected="true">
          Two
        </button>
      </GlideMenu>,
    );

    const root = container.querySelector("[data-glide]") as HTMLElement;
    const rows = container.querySelectorAll("[data-row]");
    stubBox(root, { top: 0, height: 80 });
    stubBox(rows[0] as HTMLElement, { top: 8, height: 32 });
    stubBox(rows[1] as HTMLElement, { top: 40, height: 32 });

    fireEvent.pointerMove(rows[0], { pointerType: "mouse" });
    const highlight = container.querySelector(".glide-highlight") as HTMLElement;
    expect(highlight.dataset.visible).toBe("true");
    expect(highlight.style.transform).toContain("8px");

    fireEvent.pointerMove(rows[1], { pointerType: "mouse" });
    expect(highlight.dataset.visible).toBe("false");
  });

  it("parks on the selected note and glides to hovered notes like the folder rail", () => {
    const { container } = render(
      <GlideMenu activeSelector='[data-selected="true"]'>
        <ListItem title="Draft" />
        <ListItem title="Open note" isSelected />
      </GlideMenu>,
    );

    const root = container.querySelector("[data-glide]") as HTMLElement;
    const rows = container.querySelectorAll("[data-row]");
    expect(rows).toHaveLength(2);
    stubBox(root, { top: 0, height: 160 });
    stubBox(rows[0] as HTMLElement, { top: 12, height: 64 });
    stubBox(rows[1] as HTMLElement, { top: 84, height: 64 });

    fireEvent.pointerLeave(root);
    const highlight = container.querySelector(".glide-highlight") as HTMLElement;
    expect(highlight.dataset.visible).toBe("true");
    expect(highlight.style.transform).toContain("84px");

    fireEvent.pointerMove(rows[0], { pointerType: "" });
    expect(highlight.dataset.visible).toBe("true");
    expect(highlight.style.transform).toContain("12px");

    fireEvent.mouseMove(rows[0]);
    expect(highlight.style.transform).toContain("12px");

    fireEvent.pointerLeave(root);
    expect(highlight.style.transform).toContain("84px");
  });
});

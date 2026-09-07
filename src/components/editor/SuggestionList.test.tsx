import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SuggestionList, type SuggestionListRef } from "./SuggestionList";
import { SlashCommandList } from "./SlashCommandList";
import type { SlashCommandItem } from "./SlashCommand";

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

function command(
  title: string,
  group: SlashCommandItem["group"],
): SlashCommandItem {
  return {
    title,
    description: title,
    group,
    icon: <span aria-hidden>{title[0]}</span>,
    aliases: [],
    command: () => undefined,
  };
}

describe("SuggestionList", () => {
  afterEach(cleanup);

  it("runs the selected command from click and keyboard", () => {
    const onCommand = vi.fn();
    const ref = createRef<SuggestionListRef>();
    render(
      <SuggestionList
        ref={ref}
        items={["Title", "Math"]}
        command={onCommand}
        itemKey={(item) => item}
        renderItem={(item) => item}
      />,
    );

    fireEvent.click(screen.getByRole("option", { name: "Math" }));
    expect(onCommand).toHaveBeenCalledWith("Math");

    onCommand.mockClear();
    expect(
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "ArrowDown" }),
      }),
    ).toBe(true);
    expect(
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "Enter" }),
      }),
    ).toBe(true);
    expect(onCommand).toHaveBeenCalledWith("Title");
  });

  it("groups slash commands and parks the glide highlight on the selected row", () => {
    const { container } = render(
      <SlashCommandList
        items={[
          command("Title", "style"),
          command("Checklist", "list"),
          command("Math", "insert"),
        ]}
        command={() => undefined}
      />,
    );

    const view = within(container);
    expect(view.getByText("Text")).toBeTruthy();
    expect(view.getByText("Lists")).toBeTruthy();
    expect(view.getByText("Insert")).toBeTruthy();
    expect(
      view.getByRole("option", { name: "Title" }).getAttribute("aria-selected"),
    ).toBe("true");

    const root = container.querySelector("[data-glide]") as HTMLElement;
    const rows = container.querySelectorAll("[data-row]");
    stubBox(root, { top: 0, height: 120 });
    stubBox(rows[0] as HTMLElement, { top: 20, height: 32 });
    stubBox(rows[1] as HTMLElement, { top: 60, height: 32 });

    fireEvent.pointerLeave(root);
    const highlight = container.querySelector(".glide-highlight") as HTMLElement;
    expect(highlight.dataset.visible).toBe("true");
    expect(highlight.style.transform).toContain("20px");

    fireEvent.pointerMove(rows[1], { pointerType: "mouse" });
    expect(highlight.style.transform).toContain("60px");
  });

  it("hides group headings when only one group remains", () => {
    const { container } = render(
      <SlashCommandList
        items={[command("Math", "insert"), command("Table", "insert")]}
        command={() => undefined}
      />,
    );

    expect(container.querySelector(".spell-suggestion-heading")).toBeNull();
    expect(within(container).getByRole("option", { name: "Math" })).toBeTruthy();
  });
});

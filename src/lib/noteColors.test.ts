import { describe, expect, it } from "vitest";
import {
  highlightMarkdown,
  inkMarkdown,
  NOTE_HIGHLIGHTS,
  NOTE_INKS,
} from "./noteColors";

describe("noteColors", () => {
  it("starts highlight with yellow", () => {
    expect(NOTE_HIGHLIGHTS[0]?.name).toBe("Yellow");
  });

  it("keeps a short ink set", () => {
    expect(NOTE_INKS).toHaveLength(6);
  });

  it("writes colored highlight as HTML so the color survives save", () => {
    expect(highlightMarkdown("due", "#fff3a0")).toBe(
      '<mark data-color="#fff3a0">due</mark>',
    );
    expect(highlightMarkdown("due")).toBe("==due==");
  });

  it("writes text color as a span", () => {
    expect(inkMarkdown("pay", "#ff3b30")).toBe(
      '<span style="color: #ff3b30">pay</span>',
    );
    expect(inkMarkdown("pay")).toBe("pay");
  });
});

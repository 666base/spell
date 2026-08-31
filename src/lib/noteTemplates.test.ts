import { describe, expect, it } from "vitest";
import { noteTemplate, noteTemplates } from "./noteTemplates";

describe("noteTemplates", () => {
  it("starts every template with a title", () => {
    for (const template of noteTemplates()) {
      expect(template.content.startsWith("# ")).toBe(true);
      expect(template.content).toContain("\n");
    }
  });

  it("includes a table in the decision note", () => {
    expect(noteTemplate("decision").content).toContain("| Option |");
  });
});

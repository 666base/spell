import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("folder sidebar", () => {
  it("stays collapsed when switching note, project, or sidebar panel", () => {
    const src = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const selectScope = src.match(
      /const selectScope = useCallback\([\s\S]*?\}, \[clearSelection, notes, selectNote, selectProject, selectedNoteId\]\);/,
    )?.[0] ?? "";
    const selectSidebarPanel = src.match(
      /const selectSidebarPanel = useCallback\([\s\S]*?\}, \[clearSelection, notes, selectNote, selectedNoteId\]\);/,
    )?.[0] ?? "";

    expect(selectScope).toMatch(/setSidebarPanel/);
    expect(selectScope).not.toMatch(/setSidebarVisible\(true\)/);
    expect(selectSidebarPanel).toMatch(/setNotesScope/);
    expect(selectSidebarPanel).not.toMatch(/setSidebarVisible\(true\)/);
  });
});

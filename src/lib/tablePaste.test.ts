import { describe, expect, it } from "vitest";
import { parseTableGrid, tableContentFromGrid } from "./tablePaste";

describe("parseTableGrid", () => {
  it("reads a markdown table", () => {
    const grid = parseTableGrid("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(grid).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
  });

  it("reads tab-separated rows from a spreadsheet", () => {
    const grid = parseTableGrid("Name\tAmount\nRent\t1200\nFood\t80");
    expect(grid).toEqual([
      ["Name", "Amount"],
      ["Rent", "1200"],
      ["Food", "80"],
    ]);
  });

  it("ignores ordinary sentences", () => {
    expect(parseTableGrid("Just a line\nAnd another")).toBeNull();
  });

  it("ignores comma-separated sentences", () => {
    expect(parseTableGrid("Hello, world\nHow are you, friend")).toBeNull();
  });
});

describe("tableContentFromGrid", () => {
  it("uses a header row", () => {
    const content = tableContentFromGrid([
      ["A", "B"],
      ["1", "2"],
    ]);
    expect(content.content[0].content[0].type).toBe("tableHeader");
    expect(content.content[1].content[0].type).toBe("tableCell");
  });
});

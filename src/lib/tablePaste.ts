export function parseTableGrid(text: string): string[][] | null {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  if (lines.length < 2) return null;

  const markdown = parseMarkdownTable(lines);
  if (markdown) return markdown;

  // Spreadsheets paste as TSV. Do not treat ordinary comma sentences as a table.
  return splitGrid(lines, "\t");
}

function parseMarkdownTable(lines: string[]): string[][] | null {
  if (lines.length < 2) return null;
  if (!lines[0].includes("|") || !isMarkdownSeparator(lines[1])) return null;

  const rows: string[][] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (index === 1) continue;
    const line = lines[index].trim();
    if (!line.includes("|")) return null;
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    rows.push(cells);
  }
  return isRectangular(rows) && rows[0].length >= 2 ? rows : null;
}

function isMarkdownSeparator(line: string) {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitGrid(lines: string[], delimiter: string): string[][] | null {
  const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
  if (!isRectangular(rows) || rows[0].length < 2) return null;
  if (delimiter === "\t" && !lines.some((line) => line.includes("\t"))) return null;
  return rows;
}

function isRectangular(rows: string[][]) {
  return rows.length >= 2 && rows.every((row) => row.length === rows[0].length);
}

export function tableContentFromGrid(rows: string[][]) {
  return {
    type: "table",
    content: rows.map((row, rowIndex) => ({
      type: "tableRow",
      content: row.map((cell) => ({
        type: rowIndex === 0 ? "tableHeader" : "tableCell",
        content: [
          {
            type: "paragraph",
            content: cell ? [{ type: "text", text: cell }] : [],
          },
        ],
      })),
    })),
  };
}

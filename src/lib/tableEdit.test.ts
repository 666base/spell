import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { deleteRow } from "@tiptap/pm/tables";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendTableColumn,
  appendTableRow,
  appendTableRowAndColumn,
  selectTableRowFromElement,
  tableStartFromSelection,
} from "./tableEdit";

function tableSize(editor: Editor) {
  let rows = 0;
  let cols = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "tableRow") return;
    rows += 1;
    cols = node.childCount;
  });
  return { rows, cols };
}

describe("tableEdit", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  function makeEditor() {
    editor = new Editor({
      extensions: [StarterKit, TableKit],
    });
    editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
    return editor;
  }

  it("starts from the inserted 3x3 table", () => {
    makeEditor();
    expect(tableSize(editor)).toEqual({ rows: 3, cols: 3 });
    expect(tableStartFromSelection(editor.state)).not.toBeNull();
  });

  it("appends a row to the current table", () => {
    makeEditor();
    expect(appendTableRow(editor.state, (tr) => editor.view.dispatch(tr))).toBe(
      true,
    );
    expect(tableSize(editor)).toEqual({ rows: 4, cols: 3 });
  });

  it("appends a column to the current table", () => {
    makeEditor();
    expect(
      appendTableColumn(editor.state, (tr) => editor.view.dispatch(tr)),
    ).toBe(true);
    expect(tableSize(editor)).toEqual({ rows: 3, cols: 4 });
  });

  it("appends a row and a column together", () => {
    makeEditor();
    expect(
      appendTableRowAndColumn(editor.state, (tr) => editor.view.dispatch(tr)),
    ).toBe(true);
    expect(tableSize(editor)).toEqual({ rows: 4, cols: 4 });
  });

  it("is not capped at the initial 3 rows", () => {
    makeEditor();
    appendTableRow(editor.state, (tr) => editor.view.dispatch(tr));
    appendTableRow(editor.state, (tr) => editor.view.dispatch(tr));
    expect(tableSize(editor)).toEqual({ rows: 5, cols: 3 });
  });

  it("selects a body row so it can be deleted", () => {
    makeEditor();
    const cell = editor.view.dom.querySelector("td");
    expect(cell).toBeTruthy();
    expect(selectTableRowFromElement(editor.view, cell as HTMLElement)).toBe(
      true,
    );
    expect(deleteRow(editor.state, (tr) => editor.view.dispatch(tr))).toBe(
      true,
    );
    expect(tableSize(editor).rows).toBe(2);
  });
});

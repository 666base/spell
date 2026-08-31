import { TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import {
  CellSelection,
  addColumn,
  addRow,
  TableMap,
  type TableRect,
} from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

export function tableStartFromSelection(state: EditorState): number | null {
  const $from = state.selection.$from;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.spec.tableRole === "table") {
      return $from.start(depth);
    }
  }
  return null;
}

export function tableStartFromElement(
  view: EditorView,
  tableEl: HTMLTableElement,
): number | null {
  const content = tableEl.tBodies.item(0) ?? tableEl;
  try {
    const pos = view.posAtDOM(content, 0);
    const $pos = view.state.doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.spec.tableRole === "table") {
        return $pos.start(depth);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function tableRectAt(state: EditorState, tableStart: number): TableRect | null {
  const table = state.doc.nodeAt(tableStart - 1);
  if (!table || table.type.spec.tableRole !== "table") return null;
  const map = TableMap.get(table);
  return {
    map,
    tableStart,
    table,
    left: 0,
    top: 0,
    right: map.width,
    bottom: map.height,
  };
}

function resolveTableStart(state: EditorState, tableStart?: number | null) {
  return tableStart ?? tableStartFromSelection(state);
}

export function appendTableRow(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  tableStart?: number | null,
): boolean {
  const start = resolveTableStart(state, tableStart);
  if (start == null) return false;
  const rect = tableRectAt(state, start);
  if (!rect) return false;
  if (dispatch) {
    dispatch(addRow(state.tr, rect, rect.map.height).scrollIntoView());
  }
  return true;
}

export function appendTableColumn(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  tableStart?: number | null,
): boolean {
  const start = resolveTableStart(state, tableStart);
  if (start == null) return false;
  const rect = tableRectAt(state, start);
  if (!rect) return false;
  if (dispatch) {
    dispatch(addColumn(state.tr, rect, rect.map.width).scrollIntoView());
  }
  return true;
}

export function appendTableRowAndColumn(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  tableStart?: number | null,
): boolean {
  const start = resolveTableStart(state, tableStart);
  if (start == null) return false;
  const rect = tableRectAt(state, start);
  if (!rect) return false;
  if (!dispatch) return true;

  // Add the column first so the new row copies the wider table.
  let tr = addColumn(state.tr, rect, rect.map.width);
  const table = tr.doc.nodeAt(start - 1);
  if (!table) return false;
  const map = TableMap.get(table);
  const next: TableRect = {
    map,
    tableStart: start,
    table,
    left: 0,
    top: 0,
    right: map.width,
    bottom: map.height,
  };
  tr = addRow(tr, next, next.map.height);
  dispatch(tr.scrollIntoView());
  return true;
}

export function appendTableRowFromView(
  view: EditorView,
  tableEl: HTMLTableElement,
) {
  const start = tableStartFromElement(view, tableEl);
  return appendTableRow(view.state, (tr) => view.dispatch(tr), start);
}

export function appendTableColumnFromView(
  view: EditorView,
  tableEl: HTMLTableElement,
) {
  const start = tableStartFromElement(view, tableEl);
  return appendTableColumn(view.state, (tr) => view.dispatch(tr), start);
}

export function appendTableRowAndColumnFromView(
  view: EditorView,
  tableEl: HTMLTableElement,
) {
  const start = tableStartFromElement(view, tableEl);
  return appendTableRowAndColumn(view.state, (tr) => view.dispatch(tr), start);
}

function cellPosFromElement(
  view: EditorView,
  cellEl: HTMLElement,
): number | null {
  try {
    const pos = view.posAtDOM(cellEl, 0);
    const $pos = view.state.doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const role = $pos.node(depth).type.spec.tableRole;
      if (role === "cell" || role === "header_cell") {
        return $pos.before(depth);
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function selectNearCellFromElement(
  view: EditorView,
  cellEl: HTMLElement,
): boolean {
  try {
    const pos = view.posAtDOM(cellEl, 0);
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.near(view.state.doc.resolve(pos)),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

export function selectTableRowFromElement(
  view: EditorView,
  cellEl: HTMLElement,
): boolean {
  const pos = cellPosFromElement(view, cellEl);
  if (pos == null) return false;
  view.dispatch(
    view.state.tr.setSelection(
      CellSelection.rowSelection(view.state.doc.resolve(pos)),
    ),
  );
  return true;
}

export function selectTableColumnFromElement(
  view: EditorView,
  cellEl: HTMLElement,
): boolean {
  const pos = cellPosFromElement(view, cellEl);
  if (pos == null) return false;
  view.dispatch(
    view.state.tr.setSelection(
      CellSelection.colSelection(view.state.doc.resolve(pos)),
    ),
  );
  return true;
}

import { TableView } from "@tiptap/extension-table";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
} from "@tiptap/pm/tables";
import {
  appendTableColumnFromView,
  appendTableRowFromView,
  selectNearCellFromElement,
  selectTableColumnFromElement,
  selectTableRowFromElement,
} from "../../lib/tableEdit";
import { bindOverflowPan } from "../../lib/overflowPan";

const GUTTER = 22;
const ADD_ZONE = 28;

const PLUS_ICON = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 3.25v9.5M3.25 8h9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

const ROW_GRIP_ICON = `<svg viewBox="0 0 6 10" width="6" height="10" aria-hidden="true"><circle cx="1.5" cy="1.5" r="1" fill="currentColor"/><circle cx="4.5" cy="1.5" r="1" fill="currentColor"/><circle cx="1.5" cy="5" r="1" fill="currentColor"/><circle cx="4.5" cy="5" r="1" fill="currentColor"/><circle cx="1.5" cy="8.5" r="1" fill="currentColor"/><circle cx="4.5" cy="8.5" r="1" fill="currentColor"/></svg>`;

const COL_GRIP_ICON = `<svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><circle cx="1.5" cy="1.5" r="1" fill="currentColor"/><circle cx="5" cy="1.5" r="1" fill="currentColor"/><circle cx="8.5" cy="1.5" r="1" fill="currentColor"/><circle cx="1.5" cy="4.5" r="1" fill="currentColor"/><circle cx="5" cy="4.5" r="1" fill="currentColor"/><circle cx="8.5" cy="4.5" r="1" fill="currentColor"/></svg>`;

type HandleKind = "row" | "col";

export class SpellTableView extends TableView {
  private editorView: EditorView | undefined;
  private scrollEl: HTMLDivElement | null = null;
  private hoveredCell: HTMLTableCellElement | null = null;
  private rowHandle: HTMLButtonElement | null = null;
  private colHandle: HTMLButtonElement | null = null;
  private addRowBtn: HTMLButtonElement | null = null;
  private addColBtn: HTMLButtonElement | null = null;
  private menu: HTMLDivElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unbindPan: (() => void) | null = null;
  private readonly onPointerMove = (event: PointerEvent) => {
    this.syncHandles(event.target);
  };
  private readonly onPointerLeave = (event: PointerEvent) => {
    if (this.dom.contains(event.relatedTarget as Node | null)) return;
    if (this.menu) return;
    this.hideHandles();
  };
  private readonly onCloseMenu = (event: Event) => {
    if (this.menu?.contains(event.target as Node)) return;
    this.closeMenu();
  };
  private readonly onMenuKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.closeMenu();
  };

  constructor(node: ProseMirrorNode, cellMinWidth: number, view?: EditorView) {
    super(node, cellMinWidth);
    this.editorView = view;
    this.dom.classList.add("spell-table");

    const scroll = document.createElement("div");
    scroll.className = "spell-table-scroll";
    this.dom.insertBefore(scroll, this.table);
    scroll.appendChild(this.table);
    this.scrollEl = scroll;
    this.unbindPan = bindOverflowPan(scroll, {
      axis: "x",
      ignore: ".spell-table-add, .spell-table-handle, .spell-table-handle-menu",
    });

    if (!view?.editable) return;

    const controls = document.createElement("div");
    controls.className = "spell-table-controls";
    controls.contentEditable = "false";

    this.addRowBtn = plusControl("Add row", "spell-table-add-row", () => {
      this.run((editorView) => appendTableRowFromView(editorView, this.table));
    });
    this.addColBtn = plusControl("Add column", "spell-table-add-col", () => {
      this.run((editorView) =>
        appendTableColumnFromView(editorView, this.table),
      );
    });
    this.rowHandle = gripHandle(
      "Row actions",
      "spell-table-row-handle",
      ROW_GRIP_ICON,
      () => {
        this.openHandleMenu("row");
      },
    );
    this.colHandle = gripHandle(
      "Column actions",
      "spell-table-col-handle",
      COL_GRIP_ICON,
      () => {
        this.openHandleMenu("col");
      },
    );

    controls.append(this.addRowBtn, this.addColBtn, this.rowHandle, this.colHandle);
    this.dom.appendChild(controls);

    this.layoutControls();
    this.resizeObserver = new ResizeObserver(() => this.layoutControls());
    this.resizeObserver.observe(scroll);
    this.resizeObserver.observe(this.table);

    this.dom.addEventListener("pointermove", this.onPointerMove);
    this.dom.addEventListener("pointerleave", this.onPointerLeave);
  }

  destroy() {
    this.unbindPan?.();
    this.unbindPan = null;
    this.resizeObserver?.disconnect();
    this.dom.removeEventListener("pointermove", this.onPointerMove);
    this.dom.removeEventListener("pointerleave", this.onPointerLeave);
    this.closeMenu();
  }

  private run(action: (view: EditorView) => void) {
    if (!this.editorView) return;
    this.closeMenu();
    this.editorView.focus();
    action(this.editorView);
  }

  private layoutControls() {
    if (!this.scrollEl || !this.addRowBtn || !this.addColBtn) return;

    const wrap = this.dom.getBoundingClientRect();
    const scroll = this.scrollEl.getBoundingClientRect();
    const top = scroll.top - wrap.top;
    const left = scroll.left - wrap.left;

    this.addRowBtn.style.top = `${top + scroll.height}px`;
    this.addRowBtn.style.left = `${left}px`;
    this.addRowBtn.style.width = `${scroll.width}px`;
    this.addRowBtn.style.height = `${ADD_ZONE}px`;

    this.addColBtn.style.top = `${top}px`;
    this.addColBtn.style.left = `${left + scroll.width}px`;
    this.addColBtn.style.width = `${ADD_ZONE}px`;
    this.addColBtn.style.height = `${scroll.height}px`;
  }

  private syncHandles(target: EventTarget | null) {
    if (!this.rowHandle || !this.colHandle || !this.scrollEl || this.menu) return;

    const cell = (target as HTMLElement | null)?.closest?.("td, th");
    if (!(cell instanceof HTMLTableCellElement) || !this.table.contains(cell)) {
      return;
    }

    this.hoveredCell = cell;
    const wrap = this.dom.getBoundingClientRect();
    const scroll = this.scrollEl.getBoundingClientRect();
    const cellBox = cell.getBoundingClientRect();
    const rowBox = cell.parentElement?.getBoundingClientRect();

    if (rowBox) {
      this.rowHandle.style.left = `${scroll.left - wrap.left - GUTTER / 2}px`;
      this.rowHandle.style.top = `${rowBox.top - wrap.top + rowBox.height / 2}px`;
      this.rowHandle.classList.add("is-visible");
    }

    this.colHandle.style.top = `${scroll.top - wrap.top - GUTTER / 2}px`;
    this.colHandle.style.left = `${cellBox.left - wrap.left + cellBox.width / 2}px`;
    this.colHandle.classList.add("is-visible");
  }

  private hideHandles() {
    this.hoveredCell = null;
    this.rowHandle?.classList.remove("is-visible");
    this.colHandle?.classList.remove("is-visible");
  }

  private openHandleMenu(kind: HandleKind) {
    const view = this.editorView;
    const cell = this.hoveredCell;
    if (!view || !cell) return;

    if (kind === "row") selectTableRowFromElement(view, cell);
    else selectTableColumnFromElement(view, cell);

    this.closeMenu();
    const items =
      kind === "row"
        ? ([
            ["Insert above", () => this.withCell(cell, addRowBefore)],
            ["Insert below", () => this.withCell(cell, addRowAfter)],
            ["Delete row", () => this.withCell(cell, deleteRow, "row")],
          ] as const)
        : ([
            ["Insert left", () => this.withCell(cell, addColumnBefore)],
            ["Insert right", () => this.withCell(cell, addColumnAfter)],
            ["Delete column", () => this.withCell(cell, deleteColumn, "col")],
          ] as const);

    const menu = document.createElement("div");
    menu.className = "spell-menu spell-table-handle-menu";
    menu.setAttribute("role", "menu");
    menu.addEventListener("pointerdown", (event) => event.stopPropagation());
    for (const [label, action] of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.className = label.startsWith("Delete")
        ? "spell-menu-item spell-menu-item-danger"
        : "spell-menu-item";
      button.textContent = label;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
        this.closeMenu();
      });
      menu.appendChild(button);
    }
    this.dom.appendChild(menu);
    this.menu = menu;

    const handle = kind === "row" ? this.rowHandle : this.colHandle;
    const wrap = this.dom.getBoundingClientRect();
    const box = handle?.getBoundingClientRect();
    if (box) {
      menu.style.left = `${Math.min(box.left - wrap.left, wrap.width - 168)}px`;
      menu.style.top = `${box.bottom - wrap.top + 4}px`;
    }

    window.addEventListener("pointerdown", this.onCloseMenu, true);
    window.addEventListener("keydown", this.onMenuKey, true);
  }

  private withCell(
    cell: HTMLTableCellElement,
    command: (
      state: EditorView["state"],
      dispatch?: EditorView["dispatch"],
    ) => boolean,
    select: HandleKind | null = null,
  ) {
    const view = this.editorView;
    if (!view) return;
    if (select === "row") selectTableRowFromElement(view, cell);
    else if (select === "col") selectTableColumnFromElement(view, cell);
    else selectNearCellFromElement(view, cell);
    command(view.state, (tr) => view.dispatch(tr));
    view.focus();
  }

  private closeMenu() {
    this.menu?.remove();
    this.menu = null;
    window.removeEventListener("pointerdown", this.onCloseMenu, true);
    window.removeEventListener("keydown", this.onMenuKey, true);
  }
}

function plusControl(label: string, className: string, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `spell-table-add ${className}`;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.tabIndex = -1;
  const icon = document.createElement("span");
  icon.className = "spell-table-add-icon";
  icon.innerHTML = PLUS_ICON;
  button.appendChild(icon);
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function gripHandle(
  label: string,
  className: string,
  icon: string,
  onClick: () => void,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `spell-table-handle ${className}`;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.tabIndex = -1;
  button.innerHTML = icon;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

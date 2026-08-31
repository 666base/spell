import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { SpellMonthPicker } from "../ui/SpellCalendar";
import { parseTableGrid, tableContentFromGrid } from "../../lib/tablePaste";
import { isMobileApp } from "../../lib/platform";

interface MenuState {
  x: number;
  y: number;
  target: HTMLElement;
  editable: boolean;
}

interface AppContextMenuProps {
  getEditor: () => Editor | null;
  onCreateNote: () => void;
  onCreateFolder?: () => void;
  onOpenSettings: () => void;
  allowImport?: boolean;
}

export function AppContextMenu({
  getEditor,
  onCreateNote,
  onCreateFolder,
  onOpenSettings,
  allowImport = !isMobileApp,
}: AppContextMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthAnchor, setMonthAnchor] = useState<{ getBoundingClientRect: () => DOMRect } | null>(null);

  const handleCreateFolder = useCallback(() => {
    if (onCreateFolder) {
      onCreateFolder();
    } else {
      window.dispatchEvent(new CustomEvent("create-new-folder"));
    }
  }, [onCreateFolder]);

  const openMonthPicker = useCallback(() => {
    const x = menu?.x ?? 0;
    const y = menu?.y ?? 0;
    setMonthAnchor({
      getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
    });
    setMonthPickerOpen(true);
  }, [menu]);

  useEffect(() => {
    const onOpenMonthPicker = () => {
      setMonthAnchor(null);
      setMonthPickerOpen(true);
    };
    window.addEventListener("open-add-month", onOpenMonthPicker);
    return () => window.removeEventListener("open-add-month", onOpenMonthPicker);
  }, []);

  useEffect(() => {
    const openMenu = (event: MouseEvent) => {
      event.preventDefault();
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target || target.closest("[data-spell-context-menu]")) return;

      const editTarget = target.closest<HTMLElement>(
        "input, textarea, [contenteditable='true']",
      );
      setMenu({
        x: event.clientX,
        y: event.clientY,
        target: editTarget ?? target,
        editable: Boolean(editTarget),
      });
    };
    const closeMenu = () => setMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("contextmenu", openMenu);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("contextmenu", openMenu);
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  const finish = useCallback((action: () => void | Promise<void>) => {
    void Promise.resolve(action()).catch(() => {
      toast.error("That action could not be completed");
    });
    setMenu(null);
  }, []);

  const runEdit = useCallback(
    async (command: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll") => {
      if (!menu) return;
      const target = menu.target;
      const editor = target.closest(".ProseMirror") ? getEditor() : null;

      if (command === "undo" && editor) {
        editor.chain().focus().undo().run();
        return;
      }
      if (command === "redo" && editor) {
        editor.chain().focus().redo().run();
        return;
      }
      if (command === "selectAll" && editor) {
        editor.chain().focus().selectAll().run();
        return;
      }

      target.focus();
      if (command === "paste") {
        const text = await navigator.clipboard.readText();
        if (editor) {
          const grid = !editor.isActive("table") ? parseTableGrid(text) : null;
          if (grid) {
            editor.chain().focus().insertContent(tableContentFromGrid(grid)).run();
          } else {
            editor.chain().focus().insertContent(text).run();
          }
        } else if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? start;
          target.setRangeText(text, start, end, "end");
          target.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          document.execCommand("insertText", false, text);
        }
        return;
      }
      if (command === "selectAll") {
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          target.select();
        } else {
          document.execCommand("selectAll");
        }
        return;
      }
      document.execCommand(command);
    },
    [getEditor, menu],
  );

  const extraItems = Number(allowImport) * 2 + 1;
  const x = menu ? Math.min(menu.x, window.innerWidth - 176) : 0;
  const y = menu
    ? Math.min(menu.y, window.innerHeight - (menu.editable ? 196 : 148 + extraItems * 28))
    : 0;

  return (
    <>
      <SpellMonthPicker
        open={monthPickerOpen}
        anchor={monthAnchor}
        onClose={() => setMonthPickerOpen(false)}
        onSelect={(month) => {
          window.dispatchEvent(new CustomEvent("create-new-month", { detail: month }));
        }}
      />
      {menu && (
        <div
          role="menu"
          aria-label="Spell actions"
          data-spell-context-menu
          className="spell-menu spell-popover fixed z-[2000] min-w-40"
          style={{
            left: Math.max(6, x),
            top: Math.max(6, y),
            "--transform-origin": "top left",
          } as CSSProperties}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {menu.editable ? (
            <>
              <MenuItem label="Undo" onSelect={() => finish(() => runEdit("undo"))} />
              <MenuItem label="Redo" onSelect={() => finish(() => runEdit("redo"))} />
              <Separator />
              <MenuItem label="Cut" onSelect={() => finish(() => runEdit("cut"))} />
              <MenuItem label="Copy" onSelect={() => finish(() => runEdit("copy"))} />
              <MenuItem label="Paste" onSelect={() => finish(() => runEdit("paste"))} />
              <Separator />
              <MenuItem label="Select All" onSelect={() => finish(() => runEdit("selectAll"))} />
            </>
          ) : (
            <>
              <MenuItem label="New Note" onSelect={() => finish(onCreateNote)} />
              <MenuItem label="New Folder" onSelect={() => finish(handleCreateFolder)} />
              <MenuItem
                label="New Project"
                onSelect={() => finish(() => {
                  window.dispatchEvent(new CustomEvent("create-new-project"));
                })}
              />
              {allowImport && (
                <>
                  <MenuItem
                    label="Import Notes…"
                    onSelect={() => finish(() => {
                      window.dispatchEvent(new CustomEvent("import-notes"));
                    })}
                  />
                  <MenuItem
                    label="Import Folder…"
                    onSelect={() => finish(() => {
                      window.dispatchEvent(new CustomEvent("import-notes-folder"));
                    })}
                  />
                </>
              )}
              <MenuItem label="Add month" onSelect={() => finish(openMonthPicker)} />
              <Separator />
              <MenuItem label="Settings" onSelect={() => finish(onOpenSettings)} />
            </>
          )}
        </div>
      )}
    </>
  );
}

function MenuItem({
  label,
  onSelect,
}: {
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="spell-menu-item"
      onPointerDown={(event) => event.preventDefault()}
      onClick={onSelect}
    >
      {label}
    </button>
  );
}

function Separator() {
  return <div role="separator" className="spell-menu-separator" />;
}

import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { isMac, mod } from "../../lib/platform";
import {
  CopyIcon,
  CutIcon,
  FolderPlusIcon,
  NoteIcon,
  PasteIcon,
  RedoIcon,
  SearchIcon,
  SelectAllIcon,
  SettingsIcon,
  UndoIcon,
} from "../icons/velocity";

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
  onSearch: () => void;
  onOpenSettings: () => void;
}

const itemClass = "spell-menu-item";

export function AppContextMenu({
  getEditor,
  onCreateNote,
  onCreateFolder,
  onSearch,
  onOpenSettings,
}: AppContextMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const handleCreateFolder = useCallback(() => {
    if (onCreateFolder) {
      onCreateFolder();
    } else {
      window.dispatchEvent(new CustomEvent("create-new-folder"));
    }
  }, [onCreateFolder]);

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
          editor.chain().focus().insertContent(text).run();
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

  if (!menu) return null;

  const x = Math.min(menu.x, window.innerWidth - 196);
  const y = Math.min(menu.y, window.innerHeight - (menu.editable ? 242 : 178));

  return (
    <div
      role="menu"
      aria-label="Spell actions"
      data-spell-context-menu
      className="spell-menu fixed z-[2000] min-w-48"
      style={{ left: Math.max(6, x), top: Math.max(6, y) }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {menu.editable ? (
        <>
          <MenuItem icon={<UndoIcon />} label="Undo" shortcut={`${mod}${isMac ? "" : "+"}Z`} onSelect={() => finish(() => runEdit("undo"))} />
          <MenuItem icon={<RedoIcon />} label="Redo" shortcut={`${mod}${isMac ? "" : "+"}Shift${isMac ? "" : "+"}Z`} onSelect={() => finish(() => runEdit("redo"))} />
          <Separator />
          <MenuItem icon={<CutIcon />} label="Cut" shortcut={`${mod}${isMac ? "" : "+"}X`} onSelect={() => finish(() => runEdit("cut"))} />
          <MenuItem icon={<CopyIcon />} label="Copy" shortcut={`${mod}${isMac ? "" : "+"}C`} onSelect={() => finish(() => runEdit("copy"))} />
          <MenuItem icon={<PasteIcon />} label="Paste" shortcut={`${mod}${isMac ? "" : "+"}V`} onSelect={() => finish(() => runEdit("paste"))} />
          <Separator />
          <MenuItem icon={<SelectAllIcon />} label="Select All" shortcut={`${mod}${isMac ? "" : "+"}A`} onSelect={() => finish(() => runEdit("selectAll"))} />
        </>
      ) : (
        <>
          <MenuItem icon={<NoteIcon />} label="New Note" shortcut={`${mod}${isMac ? "" : "+"}N`} onSelect={() => finish(onCreateNote)} />
          <MenuItem icon={<FolderPlusIcon />} label="New Folder" onSelect={() => finish(handleCreateFolder)} />
          <MenuItem icon={<SearchIcon />} label="Search" shortcut={`${mod}${isMac ? "" : "+"}Shift${isMac ? "" : "+"}F`} onSelect={() => finish(onSearch)} />
          <Separator />
          <MenuItem icon={<SettingsIcon />} label="Settings" shortcut={`${mod}${isMac ? "" : "+"},`} onSelect={() => finish(onOpenSettings)} />
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  shortcut: _shortcut,
  onSelect,
}: {
  icon: ReactElement<{ className?: string }>;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={itemClass}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onSelect}
    >
      <span className="flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4 [&>svg]:stroke-[1.6]">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

function Separator() {
  return <div role="separator" className="spell-menu-separator" />;
}

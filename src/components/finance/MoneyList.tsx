import { memo, useCallback, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { cn } from "../../lib/utils";
import { useFinance } from "../../context/FinanceContext";
import { moneyListItems } from "../../lib/finance";
import { PlusIcon } from "../icons/velocity";
import type { NotesScope } from "../../lib/notesScope";
import { GlideMenu, MoneyKindGlyph } from "../ui";
import { SpellMonthPicker } from "../ui/SpellCalendar";
import { NOTE_LIST_ROW_INSET_CLASS } from "../notes/VirtualizedNoteList";

const menuItemClass = "spell-menu-item cursor-pointer";

interface MoneyListProps {
  scope: NotesScope;
  onSelect: (scope: NotesScope) => void;
}

export function MoneyList({ scope, onSelect }: MoneyListProps) {
  const { workspace } = useFinance();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const items = moneyListItems(workspace);

  const handleAdd = useCallback((month: string) => {
    window.dispatchEvent(new CustomEvent("create-new-month", { detail: month }));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div data-money-list className="min-h-0 flex-1 overflow-y-auto pt-3 pb-3">
        <GlideMenu className="w-full" activeSelector='[data-selected="true"]'>
        {items.map((item) => {
          const selected =
            item.kind === "overview" ? scope.type === "money"
              : item.kind === "subscriptions" ? scope.type === "subscriptions"
                : scope.type === "moneyMonth" && scope.month === item.month;
          return (
            <div key={item.id} data-money-list-row className={cn("pb-1.5", NOTE_LIST_ROW_INSET_CLASS)}>
              <MoneyRow
                title={item.title}
                subtitle={item.subtitle}
                kind={item.kind}
                selected={selected}
                onSelect={() => {
                  if (item.kind === "overview") onSelect({ type: "money" });
                  else if (item.kind === "subscriptions") onSelect({ type: "subscriptions" });
                  else onSelect({ type: "moneyMonth", month: item.month });
                }}
                onAddMonth={(anchor) => {
                  setPickerAnchor(anchor);
                  setPickerOpen(true);
                }}
              />
            </div>
          );
        })}
        </GlideMenu>
      </div>
      <SpellMonthPicker
        open={pickerOpen}
        anchor={pickerAnchor}
        onClose={() => setPickerOpen(false)}
        onSelect={handleAdd}
      />
    </div>
  );
}

export function AddMonthButton({
  onAdd,
  variant = "footer",
}: {
  onAdd: (month: string) => void;
  variant?: "footer" | "row";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (variant === "row") {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          data-add-month
          className="mobile-folder-row"
          onClick={() => setOpen(true)}
        >
          <span className="mobile-folder-icon">
            <PlusIcon />
          </span>
          <span className="mobile-folder-label">Add month</span>
        </button>
        <SpellMonthPicker
          open={open}
          anchor={triggerRef.current}
          onClose={() => setOpen(false)}
          onSelect={onAdd}
        />
      </>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="folder-nav-footer-btn"
        data-add-month
        onClick={() => setOpen(true)}
      >
        <PlusIcon className="size-3.5" />
        Add month
      </button>
      <SpellMonthPicker
        open={open}
        anchor={triggerRef.current}
        onClose={() => setOpen(false)}
        onSelect={onAdd}
      />
    </>
  );
}

const MoneyRow = memo(function MoneyRow({
  title,
  subtitle,
  kind,
  selected,
  onSelect,
  onAddMonth,
}: {
  title: string;
  subtitle: string;
  kind: "overview" | "month" | "subscriptions";
  selected: boolean;
  onSelect: () => void;
  onAddMonth: (anchor: HTMLElement) => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div data-spell-context-menu>
          <button
            ref={rowRef}
            type="button"
            onClick={onSelect}
            data-selected={selected ? "true" : "false"}
            data-row
            className={cn("note-row flex w-full items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 text-left", selected && "note-row-selected")}
          >
            <MoneyKindGlyph kind={kind} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="note-row-title-line">
                <span className="note-row-title">{title}</span>
              </span>
              <span className="note-row-meta-line">
                <span className="min-w-0 truncate tabular-nums">{subtitle}</span>
              </span>
            </span>
          </button>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content data-spell-context-menu className="spell-menu z-50 min-w-40">
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => {
              if (rowRef.current) onAddMonth(rowRef.current);
            }}
          >
            Add month
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

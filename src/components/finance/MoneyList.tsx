import { memo, useCallback, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { cn } from "../../lib/utils";
import { useFinance } from "../../context/FinanceContext";
import { moneyListItems } from "../../lib/finance";
import { CalendarIcon, FinanceIcon, PlusIcon, SubscriptionIcon } from "../icons/velocity";
import type { NotesScope } from "../../lib/notesScope";
import { IconButton } from "../ui";
import { SpellMonthPicker } from "../ui/SpellCalendar";

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
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pt-2.5 pb-2">
        {items.map((item) => {
          const selected =
            item.kind === "overview" ? scope.type === "money"
              : item.kind === "subscriptions" ? scope.type === "subscriptions"
                : scope.type === "moneyMonth" && scope.month === item.month;
          return (
            <div key={item.id} className="px-1.5 pb-1">
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
      <IconButton
        ref={triggerRef}
        size="sm"
        title="Add month"
        data-add-month
        onClick={() => setOpen(true)}
      >
        <PlusIcon />
      </IconButton>
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
  const Icon = kind === "overview" ? FinanceIcon : kind === "subscriptions" ? SubscriptionIcon : CalendarIcon;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div data-spell-context-menu>
          <button
            ref={rowRef}
            type="button"
            onClick={onSelect}
            data-selected={selected ? "true" : "false"}
            className={cn("note-row flex w-full items-center gap-2.5 rounded-[8px] px-3 py-[9px] text-left", selected && "note-row-selected")}
          >
            <Icon className="size-4 shrink-0 text-text-muted" />
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

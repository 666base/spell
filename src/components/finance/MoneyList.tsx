import { memo, useRef } from "react";
import { cn } from "../../lib/utils";
import { useFinance } from "../../context/FinanceContext";
import { isMonthKey, moneyListItems } from "../../lib/finance";
import { CalendarIcon, FinanceIcon, PlusIcon, SubscriptionIcon } from "../icons/velocity";
import type { NotesScope } from "../../lib/notesScope";

interface MoneyListProps {
  scope: NotesScope;
  onSelect: (scope: NotesScope) => void;
}

export function MoneyList({ scope, onSelect }: MoneyListProps) {
  const { workspace, addMonth } = useFinance();
  const items = moneyListItems(workspace);

  const handleAddMonth = (month: string) => {
    addMonth(month);
    onSelect({ type: "moneyMonth", month });
  };

  return (
    <div className="flex h-full flex-col bg-bg-secondary">
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
              />
            </div>
          );
        })}
      </div>

      <div className="titlebar-no-drag shrink-0 border-t border-border px-2 py-1">
        <AddMonthButton onAdd={handleAddMonth} />
      </div>
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
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.click();
  };

  const handleChange = (value: string) => {
    if (!isMonthKey(value)) return;
    onAdd(value);
  };

  if (variant === "row") {
    return (
      <div className="relative">
        <button type="button" className="mobile-folder-row" onClick={openPicker}>
          <span className="mobile-folder-icon">
            <PlusIcon />
          </span>
          <span className="mobile-folder-label">Add month</span>
        </button>
        <input
          ref={inputRef}
          type="month"
          aria-label="Choose month"
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          onChange={(event) => handleChange(event.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPicker}
        className="motion-interactive flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-text-muted hover:bg-bg-hover hover:text-text"
      >
        <PlusIcon className="size-4 shrink-0" />
        Add month
      </button>
      <input
        ref={inputRef}
        type="month"
        aria-label="Choose month"
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        onChange={(event) => handleChange(event.target.value)}
      />
    </div>
  );
}

const MoneyRow = memo(function MoneyRow({
  title,
  subtitle,
  kind,
  selected,
  onSelect,
}: {
  title: string;
  subtitle: string;
  kind: "overview" | "month" | "subscriptions";
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = kind === "overview" ? FinanceIcon : kind === "subscriptions" ? SubscriptionIcon : CalendarIcon;
  return (
    <button
      type="button"
      onClick={onSelect}
      data-selected={selected ? "true" : "false"}
      className={cn("note-row flex w-full items-start gap-2 rounded-[8px] px-3 py-[9px] text-left", selected && "note-row-selected")}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block min-w-0 truncate text-[13px] font-semibold leading-[18px] tracking-[-0.01em] text-text">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[12px] leading-4 text-text-muted">
          {subtitle}
        </span>
      </span>
    </button>
  );
});

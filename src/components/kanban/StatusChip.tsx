import { useEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  COLUMN_COLORS,
  columnStatusKind,
  resolvedColumnColor,
  type ColumnColorId,
  type ColumnStatusKind,
} from "../../lib/kanban";
import { isMobileApp } from "../../lib/platform";
import { cn } from "../../lib/utils";
import {
  DoneIcon,
  InboxIcon,
  InProgressIcon,
  TodoIcon,
  WaitingIcon,
} from "../icons/velocity";
import { AnchoredPopover } from "../ui";
import { CheckmarkIcon } from "../ui/StateIcon";
import { MobileActionSheet } from "../layout/mobile/MobileChrome";

const ICONS: Record<ColumnStatusKind, typeof TodoIcon> = {
  inbox: InboxIcon,
  todo: TodoIcon,
  progress: InProgressIcon,
  waiting: WaitingIcon,
  done: DoneIcon,
  other: TodoIcon,
};

export function checkStatusColor(title?: string, color?: ColumnColorId) {
  return resolvedColumnColor(title ?? "", color);
}

export function StatusChip({
  title,
  color,
  size = "md",
  className,
}: {
  title: string;
  color?: ColumnColorId;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const kind = columnStatusKind(title);
  const Icon = ICONS[kind];
  return (
    <span
      data-kind={kind}
      data-color={resolvedColumnColor(title, color)}
      className={cn(
        "kanban-status",
        size === "sm" && "is-sm",
        size === "lg" && "is-lg",
        className,
      )}
    >
      <Icon className="kanban-status-icon" aria-hidden="true" />
      <span className="kanban-status-label">{title}</span>
    </span>
  );
}

export function StatusPicker({
  title,
  color,
  value,
  columns,
  onChange,
  size = "md",
  className,
  disabled = false,
}: {
  title: string;
  color?: ColumnColorId;
  value: string;
  columns: { id: string; title: string; color?: ColumnColorId }[];
  onChange: (columnId: string) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
}) {
  if (disabled || columns.length === 0) {
    return <StatusChip title={title} color={color} size={size} className={className} />;
  }

  if (isMobileApp) {
    return (
      <MobileStatusPicker
        title={title}
        color={color}
        value={value}
        columns={columns}
        onChange={onChange}
        size={size}
        className={className}
      />
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Status: ${title}`}
          className={cn("kanban-status-trigger", className)}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <StatusChip title={title} color={color} size={size} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="spell-menu spell-select-menu z-[1200]"
          align="start"
          sideOffset={6}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenu.RadioGroup
            value={value}
            onValueChange={(next) => {
              if (next !== value) onChange(next);
            }}
          >
            {columns.map((column) => (
              <DropdownMenu.RadioItem
                key={column.id}
                value={column.id}
                className="spell-menu-item spell-select-option"
              >
                <StatusChip title={column.title} color={column.color} size="sm" />
                <CheckmarkIcon
                  checked={column.id === value}
                  className="h-3.5 w-3.5"
                />
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MobileStatusPicker({
  title,
  color,
  value,
  columns,
  onChange,
  size,
  className,
}: {
  title: string;
  color?: ColumnColorId;
  value: string;
  columns: { id: string; title: string; color?: ColumnColorId }[];
  onChange: (columnId: string) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={`Status: ${title}`}
        data-pager-ignore
        className={cn("kanban-status-trigger", className)}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <StatusChip title={title} color={color} size={size} />
      </button>
      {open && (
        <MobileActionSheet title="Stage" onClose={() => setOpen(false)}>
          {columns.map((column) => {
            const selected = column.id === value;
            return (
              <button
                key={column.id}
                type="button"
                className="mobile-action-item"
                aria-pressed={selected}
                onClick={() => {
                  if (column.id !== value) onChange(column.id);
                  setOpen(false);
                }}
              >
                <StatusChip title={column.title} color={column.color} size="sm" />
                <CheckmarkIcon checked={selected} className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </MobileActionSheet>
      )}
    </>
  );
}

export function StageEditor({
  title,
  color,
  size = "md",
  onRename,
  onColor,
}: {
  title: string;
  color?: ColumnColorId;
  size?: "sm" | "md" | "lg";
  onRename: (title: string) => void;
  onColor: (color: ColumnColorId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(title);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const selected = !color || color === "default" ? "default" : color;

  useEffect(() => {
    if (!open) setValue(title);
  }, [open, title]);

  const close = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== title) onRename(trimmed);
    else setValue(title);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={`${title} color`}
        className="kanban-status-trigger"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <StatusChip title={title} color={color} size={size} />
      </button>
      <AnchoredPopover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        align="start"
        origin="top left"
        className="spell-menu w-56 p-2"
      >
        <input
          autoFocus
          value={value}
          aria-label="List name"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              close();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setValue(title);
              setOpen(false);
            }
          }}
          className="mb-2 h-8 w-full rounded-md bg-bg-secondary px-2 text-[13px] font-medium text-text outline-none"
        />
        <div className="flex flex-wrap gap-1.5 px-0.5 pb-0.5">
          {COLUMN_COLORS.map((item) => {
            const active = selected === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.name}
                aria-pressed={active}
                title={item.name}
                onClick={() => onColor(item.id)}
                className={cn(
                  "relative size-6 shrink-0 overflow-hidden rounded-full",
                  active
                    ? "ring-2 ring-text ring-offset-1 ring-offset-[var(--material-menu)]"
                    : "ring-1 ring-black/10 dark:ring-white/15",
                )}
                style={item.swatch ? { backgroundColor: item.swatch } : undefined}
              >
                {!item.swatch && (
                  <>
                    <span className="absolute inset-0 bg-bg-muted" />
                    <span className="absolute inset-[-18%] rotate-45 border-t border-[var(--color-menu-danger)]" />
                  </>
                )}
              </button>
            );
          })}
        </div>
      </AnchoredPopover>
    </>
  );
}

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "../../lib/utils";
import { ChevronDownIcon } from "../icons/velocity";
import { CheckmarkIcon } from "./StateIcon";

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onChange" | "value"> {
  value?: string | number;
  onValueChange?: (value: string) => void;
  children?: React.ReactNode;
  options?: readonly SelectOption[];
  placeholder?: string;
  contentClassName?: string;
}

function optionsFromChildren(children: React.ReactNode): SelectOption[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child) || child.type !== "option") return [];

    const option = child as React.ReactElement<{
      value?: string | number;
      children?: React.ReactNode;
      disabled?: boolean;
    }>;

    if (option.props.value === undefined) return [];

    return [{
      value: String(option.props.value),
      label: option.props.children,
      disabled: option.props.disabled,
    }];
  });
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      className,
      contentClassName,
      children,
      options,
      value,
      onValueChange,
      placeholder = "Select an option",
      disabled,
      type: _type,
      ...props
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const resolvedOptions = React.useMemo(
      () => options ? [...options] : optionsFromChildren(children),
      [children, options],
    );
    const selectedValue = value === undefined ? undefined : String(value);
    const selectedOption = resolvedOptions.find(
      (option) => option.value === selectedValue,
    );

    return (
      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            ref={ref}
            type="button"
            disabled={disabled}
            aria-expanded={open}
            data-open={open ? "true" : "false"}
            className={cn(
              "app-control spell-select-trigger motion-interactive flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-bg px-3 text-left text-sm text-text shadow-[var(--shadow-control)]",
              "focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
            {...props}
          >
            <span className={cn("min-w-0 flex-1 truncate", !selectedOption && "text-text-muted")}>
              {selectedOption?.label ?? placeholder}
            </span>
            <ChevronDownIcon
              className="spell-select-chevron h-4 w-4 shrink-0 stroke-[1.7] text-text-muted"
              aria-hidden="true"
            />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className={cn("spell-menu spell-select-menu z-[1200]", contentClassName)}
            align="end"
            sideOffset={6}
          >
            <DropdownMenu.RadioGroup value={selectedValue} onValueChange={onValueChange}>
              {resolvedOptions.map((option) => (
                <DropdownMenu.RadioItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="spell-menu-item spell-select-option"
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <DropdownMenu.ItemIndicator className="flex h-4 w-4 items-center justify-center">
                    <CheckmarkIcon checked className="h-3.5 w-3.5" />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  },
);
Select.displayName = "Select";

export { Select };

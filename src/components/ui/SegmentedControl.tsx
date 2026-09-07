import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
};

/**
 * Sliding-pill segmented control. The pill translates to the active option
 * so the selection does not teleport between siblings.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("segmented", className)}
      data-pager-ignore
      style={
        {
          "--segmented-count": options.length,
          "--segmented-index": index,
        } as CSSProperties
      }
    >
      <span aria-hidden className="segmented-pill" />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-active={active ? "true" : "false"}
            className="segmented-item"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

import { useId, useRef } from "react";
import { cn } from "../../lib/utils";
import { Input } from "../ui";

interface ClientFieldProps {
  value: string;
  suggestions?: readonly string[];
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
}

export function ClientField({
  value,
  suggestions = [],
  onChange,
  onCommit,
  onCancel,
  autoFocus = false,
  className,
  placeholder = "Client",
}: ClientFieldProps) {
  const listId = useId();
  const skipCommit = useRef(false);
  const names = suggestions.filter((name) => name.trim().length > 0);

  return (
    <>
      <Input
        value={value}
        list={names.length > 0 ? listId : undefined}
        aria-label="Client"
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        className={cn("h-9", className)}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (skipCommit.current) {
            skipCommit.current = false;
            return;
          }
          onCommit?.(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            skipCommit.current = true;
            onCancel?.();
          }
        }}
      />
      {names.length > 0 && (
        <datalist id={listId}>
          {names.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}
    </>
  );
}

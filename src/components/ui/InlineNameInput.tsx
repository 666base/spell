import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Input } from "./Input";

interface InlineNameInputProps {
  label: string;
  placeholder: string;
  initialValue?: string;
  onConfirm: (name: string) => void | Promise<void>;
  onCancel: () => void;
  className?: string;
}

export function InlineNameInput({
  label,
  placeholder,
  initialValue = "",
  onConfirm,
  onCancel,
  className,
}: InlineNameInputProps) {
  const [name, setName] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSaving) return;

    setIsSaving(true);
    try {
      await onConfirm(trimmed);
    } catch {
      setIsSaving(false);
    }
  }, [isSaving, name, onConfirm]);

  return (
    <form className={className} onSubmit={handleSubmit}>
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <Input
        ref={inputRef}
        id={inputId}
        name={inputId}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        disabled={isSaving}
        className="h-7 w-full rounded-md px-1.5 text-[13px] font-normal"
      />
    </form>
  );
}

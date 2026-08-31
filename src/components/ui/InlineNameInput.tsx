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
  const doneRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const finish = useCallback(() => {
    doneRef.current = true;
  }, []);

  const submit = useCallback(async () => {
    if (doneRef.current || isSaving) return;

    const trimmed = name.trim();
    if (!trimmed || trimmed === initialValue.trim()) {
      finish();
      onCancel();
      return;
    }

    finish();
    setIsSaving(true);
    try {
      await onConfirm(trimmed);
    } catch {
      doneRef.current = false;
      setIsSaving(false);
    }
  }, [finish, initialValue, isSaving, name, onCancel, onConfirm]);

  const cancel = useCallback(() => {
    if (doneRef.current) return;
    finish();
    onCancel();
  }, [finish, onCancel]);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void submit();
    },
    [submit],
  );

  return (
    <form
      className={className}
      onSubmit={handleSubmit}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <Input
        ref={inputRef}
        id={inputId}
        name={inputId}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          void submit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancel();
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

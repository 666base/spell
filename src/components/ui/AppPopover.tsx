import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isMobileApp } from "../../lib/platform";
import { MOTION_BASE_MS } from "../../lib/motion";
import { cn } from "../../lib/utils";

function closeDelay() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : MOTION_BASE_MS;
}

export function AppPopover({
  title,
  canDone,
  onCancel,
  onDone,
  children,
  footer,
}: {
  title: string;
  canDone: boolean;
  onCancel: () => void;
  onDone: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const closed = useRef(false);

  useEffect(() => {
    setOpen(true);
  }, []);

  const finish = useCallback((action: () => void) => {
    if (closed.current) return;
    closed.current = true;
    setOpen(false);
    window.setTimeout(action, closeDelay());
  }, []);

  const cancel = useCallback(() => finish(onCancel), [finish, onCancel]);
  const done = useCallback(() => finish(onDone), [finish, onDone]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canDone) {
        event.preventDefault();
        done();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canDone, cancel, done]);

  const layer = (
    <div
      className={cn("money-popover-layer", isMobileApp && "money-popover-layer--mobile")}
      data-open={open ? "true" : "false"}
    >
      <button
        type="button"
        className="money-popover-scrim"
        data-open={open ? "true" : "false"}
        aria-label="Cancel"
        onPointerDown={cancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="money-popover"
        data-open={open ? "true" : "false"}
      >
        <div className="app-drawer-handle" aria-hidden="true" />
        <header className="grid h-11 shrink-0 grid-cols-[4.75rem_1fr_4.75rem] items-center border-b border-border px-3">
          <button type="button" className="justify-self-start text-[13px] text-text-muted hover:text-text" onClick={cancel}>
            Cancel
          </button>
          <span className="truncate text-center text-[13px] font-semibold text-text">{title}</span>
          <button
            type="button"
            disabled={!canDone}
            className="justify-self-end text-[13px] font-semibold text-text disabled:text-text-muted/40"
            onClick={done}
          >
            Done
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer}
      </div>
    </div>
  );

  if (isMobileApp) {
    return createPortal(layer, document.body);
  }
  return layer;
}

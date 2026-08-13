import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

const DRAWER_TRANSITION_MS = 220;
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  side?: "left" | "right";
  className?: string;
}

export function MobileDrawer({
  open,
  onClose,
  children,
  side = "left",
  className,
}: DrawerProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isVisible, setIsVisible] = useState(open);
  const drawerRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        !drawerRef.current?.contains(activeElement)
      ) {
        restoreFocusRef.current = activeElement;
      }
      setShouldRender(true);
      const frame = window.requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(frame);
    }

    if (!shouldRender) return;
    setIsVisible(false);
    const timeout = window.setTimeout(() => {
      setShouldRender(false);
      restoreFocusRef.current?.focus({ preventScroll: true });
    }, DRAWER_TRANSITION_MS);
    return () => window.clearTimeout(timeout);
  }, [open, shouldRender]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !shouldRender) return;

    const focusFrame = window.requestAnimationFrame(() => {
      const focusable = drawerRef.current?.querySelector<HTMLElement>(
        FOCUSABLE_SELECTOR,
      );
      (focusable ?? drawerRef.current)?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        drawerRef.current.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, shouldRender]);

  if (!shouldRender) return null;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close panel"
        className={cn(
          "fixed inset-0 z-40 bg-text/45 backdrop-blur-sm transition-opacity duration-[180ms] [transition-timing-function:var(--ease-out)]",
          isVisible ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={side === "left" ? "Navigation panel" : "Details panel"}
        tabIndex={-1}
        className={cn(
          "fixed inset-y-0 z-50 flex w-[92%] max-w-sm flex-col overflow-hidden bg-bg/95 shadow-[var(--shadow-surface)] backdrop-blur-xl transition-[transform,opacity] duration-[220ms] [transition-timing-function:var(--ease-drawer)]",
          isVisible
            ? "translate-x-0 opacity-100"
            : side === "left"
              ? "-translate-x-full opacity-0"
              : "translate-x-full opacity-0",
          side === "left" ? "left-0" : "right-0",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}

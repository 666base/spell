import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { PANEL_TRANSITION_MS } from "../../lib/presence";
import { cn } from "../../lib/utils";

const GAP = 6;
const PAD = 8;

function closeDelay() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : PANEL_TRANSITION_MS;
}

function place(
  anchor: DOMRect,
  size: { width: number; height: number },
  align: "start" | "center" | "end",
) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left =
    align === "start"
      ? anchor.left
      : align === "center"
        ? anchor.left + anchor.width / 2 - size.width / 2
        : anchor.right - size.width;
  left = Math.min(Math.max(PAD, left), Math.max(PAD, vw - PAD - size.width));

  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - size.height;
  const top =
    below + size.height <= vh - PAD || above < PAD
      ? Math.min(below, Math.max(PAD, vh - PAD - size.height))
      : above;
  return { top, left };
}

export function AnchoredPopover({
  open,
  onClose,
  anchorRef,
  align = "end",
  origin = "top center",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  align?: "start" | "center" | "end";
  origin?: string;
  className?: string;
  children: ReactNode;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState(open);
  const [shown, setShown] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (open) {
      setPresent(true);
      const frame = window.requestAnimationFrame(() => setShown(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setShown(false);
    const timeout = window.setTimeout(() => setPresent(false), closeDelay());
    return () => window.clearTimeout(timeout);
  }, [open]);

  useLayoutEffect(() => {
    if (!present) return;
    const update = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const node = nodeRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const next = place(anchor, { width: node?.width || 280, height: node?.height || 160 }, align);
      setPos((current) =>
        current && current.top === next.top && current.left === next.left ? current : next,
      );
    };
    update();
    const frame = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
    };
  }, [align, anchorRef, present]);

  useEffect(() => {
    if (!present) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (anchorRef.current?.contains(target) || nodeRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchorRef, onClose, present]);

  if (!present) return null;

  return createPortal(
    <div
      ref={nodeRef}
      className={cn("spell-popover", className)}
      data-open={shown ? "true" : "false"}
      style={
        {
          position: "fixed",
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          zIndex: 80,
          visibility: pos ? undefined : "hidden",
          "--transform-origin": origin,
        } as CSSProperties
      }
    >
      {children}
    </div>,
    document.body,
  );
}

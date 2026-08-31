import { Children, useEffect, useRef, type ReactNode } from "react";

const FLICK_PX = 72;
const AXIS_PX = 12;
const PAGE_COUNT = 3;

interface MobilePagerProps {
  index: number;
  onIndexChange: (index: number) => void;
  children: ReactNode;
}

function isInteractive(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "button, a, input, textarea, select, [role='button'], [role='tab'], [role='dialog'], [contenteditable='true'], [data-pager-ignore], .kanban-board, .spell-table-scroll, .journal-calendar, .mobile-format-toolbar, .mobile-drawer, .mobile-action-layer",
      ),
    )
  );
}

export function MobilePager({ index, onIndexChange, children }: MobilePagerProps) {
  const indexRef = useRef(index);
  const onChangeRef = useRef(onIndexChange);
  const rootRef = useRef<HTMLDivElement>(null);
  indexRef.current = index;
  onChangeRef.current = onIndexChange;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let axis: "h" | "v" | null = null;

    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (isInteractive(event.target)) return;
      tracking = true;
      axis = null;
      startX = event.clientX;
      startY = event.clientY;
    };

    const onMove = (event: PointerEvent) => {
      if (!tracking || axis) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) < AXIS_PX && Math.abs(dy) < AXIS_PX) return;
      axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (axis === "v") tracking = false;
    };

    const onUp = (event: PointerEvent) => {
      if (!tracking) return;
      tracking = false;
      if (axis !== "h") return;
      const dx = event.clientX - startX;
      if (Math.abs(dx) < FLICK_PX) return;
      const next = indexRef.current + (dx < 0 ? 1 : -1);
      if (next < 0 || next >= PAGE_COUNT || next === indexRef.current) return;
      onChangeRef.current(next);
    };

    const onCancel = () => {
      tracking = false;
      axis = null;
    };

    root.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      root.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, []);

  return (
    <div ref={rootRef} className="mobile-pager">
      {Children.map(children, (child, i) => (
        <div
          key={i}
          className={i === index ? "mobile-pager-slide is-active" : "mobile-pager-slide"}
          aria-hidden={i !== index}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

export function MobilePagerSlide({
  children,
}: {
  children: ReactNode;
  className?: string;
  active?: boolean;
}) {
  return children;
}

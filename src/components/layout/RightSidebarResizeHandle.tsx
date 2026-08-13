import { useCallback, useRef, useState } from "react";
import {
  RIGHT_SIDEBAR_DEFAULT_PX,
  RIGHT_SIDEBAR_MAX_PX,
  RIGHT_SIDEBAR_MIN_PX,
} from "../../lib/rightSidebar";
import { cn } from "../../lib/utils";

const WIDTH_KEY = "spell:right-sidebar-width";

export function getSavedRightSidebarWidth(): number {
  const saved = Number(localStorage.getItem(WIDTH_KEY));
  return Number.isFinite(saved) &&
    saved >= RIGHT_SIDEBAR_MIN_PX &&
    saved <= RIGHT_SIDEBAR_MAX_PX
    ? saved
    : RIGHT_SIDEBAR_DEFAULT_PX;
}

export function RightSidebarResizeHandle({
  width,
  onWidthChange,
}: {
  width: number;
  onWidthChange: (width: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { startX: event.clientX, startWidth: width };
      setDragging(true);
    },
    [width],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!drag.current) return;
      const next = drag.current.startWidth + drag.current.startX - event.clientX;
      onWidthChange(
        Math.round(
          Math.min(Math.max(next, RIGHT_SIDEBAR_MIN_PX), RIGHT_SIDEBAR_MAX_PX),
        ),
      );
    },
    [onWidthChange],
  );

  const finish = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!drag.current) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      drag.current = null;
      setDragging(false);
      localStorage.setItem(WIDTH_KEY, String(width));
    },
    [width],
  );

  const reset = useCallback(() => {
    localStorage.removeItem(WIDTH_KEY);
    onWidthChange(RIGHT_SIDEBAR_DEFAULT_PX);
  }, [onWidthChange]);

  return (
    <div
      role="separator"
      aria-label="Resize right sidebar"
      aria-orientation="vertical"
      tabIndex={0}
      className={cn(
        "absolute inset-y-0 left-0 z-20 w-1.5 -translate-x-1/2 cursor-col-resize outline-none group",
        dragging && "z-30",
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onDoubleClick={reset}
    >
      <div
        className={cn(
          "absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border transition-[background-color,opacity] duration-150 [transition-timing-function:var(--ease-out)]",
          dragging ? "bg-accent opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />
    </div>
  );
}

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "../../lib/utils";
import { glideOffset } from "../../lib/glide";
import { MOTION_GLIDE_MS } from "../../lib/motion";

type Highlight = { top: number; height: number };

type GlideMenuProps = {
  children: ReactNode;
  className?: string;
  highlightClassName?: string;
  rowSelector?: string;
  /** Keep the pill on this row (keyboard / selected). Hover still retargets. */
  activeSelector?: string;
  /** Rows matching this selector do not steal the hover pill. */
  skipSelector?: string;
};

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function isTouchPointer(event: { pointerType?: string }) {
  return event.pointerType === "touch";
}

/**
 * One highlight that follows the hovered (or active) row. The motion keeps
 * the mark spatially attached as the pointer or keyboard selection moves.
 */
export function GlideMenu({
  children,
  className,
  highlightClassName,
  rowSelector = "[data-row]",
  activeSelector,
  skipSelector,
}: GlideMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef<Element | null>(null);
  const last = useRef<Highlight | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [visible, setVisible] = useState(false);
  const [follow, setFollow] = useState(false);

  const moveTo = useCallback((next: Highlight | null) => {
    if (next) last.current = next;
    setHighlight((current) => {
      const shown = next ?? last.current;
      if (
        current &&
        shown &&
        current.top === shown.top &&
        current.height === shown.height
      ) {
        return current;
      }
      return shown;
    });
    setVisible(Boolean(next));
    if (!next) setFollow(false);
  }, []);

  const measure = useCallback(
    (row: Element) => {
      const root = rootRef.current;
      if (!root) return null;
      return glideOffset(root.getBoundingClientRect(), row.getBoundingClientRect());
    },
    [],
  );

  const applyRow = useCallback(
    (row: Element | null) => {
      if (!row || (skipSelector && row.matches(skipSelector))) {
        moveTo(null);
        return;
      }
      const next = measure(row);
      if (!next) return;
      const prev = last.current;
      const jumped = !prev || !visible;
      moveTo(next);
      if (jumped || reducedMotion()) setFollow(false);
      else setFollow(true);
    },
    [measure, moveTo, skipSelector, visible],
  );

  const applyActive = useCallback(() => {
    const root = rootRef.current;
    if (!root || !activeSelector) {
      moveTo(null);
      return;
    }
    applyRow(root.querySelector(activeSelector));
  }, [activeSelector, applyRow, moveTo]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const hovered = hoveredRef.current;
    if (hovered && root.contains(hovered)) {
      applyRow(hovered);
      return;
    }
    hoveredRef.current = null;
    if (!activeSelector) {
      moveTo(null);
      return;
    }
    applyActive();
  }, [activeSelector, applyActive, applyRow, children, moveTo]);

  const retarget = useCallback(
    (target: EventTarget | null) => {
      const root = rootRef.current;
      if (!root) return;
      const row = (target as Element | null)?.closest?.(rowSelector);
      if (!row || !root.contains(row)) {
        hoveredRef.current = null;
        if (!activeSelector) moveTo(null);
        return;
      }
      hoveredRef.current = row;
      applyRow(row);
    },
    [activeSelector, applyRow, moveTo, rowSelector],
  );

  const shown = highlight ?? last.current;

  return (
    <div
      ref={rootRef}
      data-glide
      className={cn("relative", className)}
      onPointerMove={(event) => {
        if (isTouchPointer(event)) return;
        retarget(event.target);
      }}
      onMouseMove={(event) => retarget(event.target)}
      onPointerLeave={() => {
        hoveredRef.current = null;
        if (activeSelector) {
          applyActive();
          return;
        }
        moveTo(null);
      }}
    >
      <div
        aria-hidden
        className={cn("glide-highlight", highlightClassName)}
        data-visible={visible ? "true" : "false"}
        data-follow={follow && visible ? "true" : "false"}
        style={
          {
            transform: `translate3d(0, ${shown?.top ?? 0}px, 0)`,
            height: shown?.height ?? 32,
            "--glide-duration": reducedMotion() ? "0ms" : `${MOTION_GLIDE_MS}ms`,
          } as CSSProperties
        }
      />
      {children}
    </div>
  );
}

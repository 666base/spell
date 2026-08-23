import {
  Children,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

const LOCK = 10;
const FLICK = 720;
const SETTLE_MS = 280;
const SETTLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

interface MobilePagerProps {
  index: number;
  onIndexChange: (index: number) => void;
  children: ReactNode;
}

type PaintMode = "idle" | "drag" | "snap";

function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  if (overshoot === 0 || dimension <= 0) return 0;
  const sign = Math.sign(overshoot);
  const distance = Math.abs(overshoot);
  return (sign * (distance * dimension * constant)) / (dimension + constant * distance);
}

function project(velocity: number, deceleration = 0.995) {
  return ((velocity / 1000) * deceleration) / (1 - deceleration);
}

function isFromPagerIgnore(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (
    target.closest(
      "[data-pager-ignore], .mobile-format-toolbar, .mobile-drawer, .mobile-drawer-layer, .kanban-board, .mobile-nav, .mobile-bottom-bar, button, a, [role='button'], [role='dialog']",
    )
  ) {
    return true;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function isHorizontalScroller(target: EventTarget | null, root: HTMLElement | null) {
  if (!(target instanceof Element) || !root) return false;
  let node: Element | null = target;
  while (node && node !== root) {
    if (node instanceof HTMLElement) {
      const overflowX = window.getComputedStyle(node).overflowX;
      if (
        (overflowX === "auto" || overflowX === "scroll") &&
        node.scrollWidth > node.clientWidth + 2
      ) {
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

export function MobilePager({ index, onIndexChange, children }: MobilePagerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<(HTMLDivElement | null)[]>([]);
  const indexRef = useRef(index);
  const widthRef = useRef(0);
  const modeRef = useRef<PaintMode>("idle");
  const dxRef = useRef(0);
  const settleTimerRef = useRef(0);
  const reducedMotionRef = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const dragRef = useRef<{
    id: number;
    x: number;
    y: number;
    axis: "x" | "y" | null;
    samples: { t: number; x: number }[];
  } | null>(null);
  const pageCount = Children.count(children);
  const last = Math.max(0, pageCount - 1);

  indexRef.current = index;

  const paint = useCallback((mode: PaintMode, nextIndex = indexRef.current, dx = 0) => {
    const width = widthRef.current;
    if (width <= 0) return;
    modeRef.current = mode;
    dxRef.current = mode === "drag" ? dx : 0;
    const instant = mode !== "snap" || reducedMotionRef.current;
    slidesRef.current.forEach((slide, i) => {
      if (!slide) return;
      const x = (i - nextIndex) * width + (mode === "drag" ? dx : 0);
      slide.style.transform = `translate3d(${x}px, 0, 0)`;
      slide.style.transition = instant ? "none" : `transform ${SETTLE_MS}ms ${SETTLE_EASE}`;
      const nearby = Math.abs(i - nextIndex) <= 1;
      const show = i === nextIndex || (mode !== "idle" && nearby);
      slide.style.visibility = show ? "visible" : "hidden";
      slide.style.pointerEvents = i === nextIndex && mode !== "drag" ? "auto" : "none";
      if (mode === "drag") slide.style.willChange = "transform";
      else if (mode === "idle") slide.style.willChange = "auto";
    });
  }, []);

  const measure = useCallback(() => {
    widthRef.current = rootRef.current?.clientWidth ?? 0;
  }, []);

  const finishSettle = useCallback(() => {
    window.clearTimeout(settleTimerRef.current);
    paint("idle", indexRef.current, 0);
  }, [paint]);

  const settle = useCallback(
    (dx: number, velocity: number) => {
      const current = indexRef.current;
      const width = widthRef.current || window.innerWidth;
      const projected = dx + project(velocity);
      let next = current;
      if (projected < -width * 0.22 || velocity < -FLICK) next = Math.min(last, current + 1);
      else if (projected > width * 0.22 || velocity > FLICK) next = Math.max(0, current - 1);
      dragRef.current = null;
      dxRef.current = 0;
      if (next !== current) {
        paint("snap", next, 0);
        onIndexChange(next);
      } else {
        paint("snap", current, 0);
      }
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = window.setTimeout(finishSettle, SETTLE_MS);
    },
    [finishSettle, last, onIndexChange, paint],
  );

  const cancelGesture = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    paint("idle", indexRef.current, 0);
  }, [paint]);

  useLayoutEffect(() => {
    measure();
    if (modeRef.current === "drag") return;
    paint(modeRef.current === "snap" ? "snap" : "idle");
  }, [index, measure, paint, pageCount]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onResize = () => {
      measure();
      if (dragRef.current) return;
      paint("idle", indexRef.current, 0);
    };

    const onViewportScroll = () => {
      window.scrollTo(0, 0);
      if (dragRef.current) return;
      paint("idle", indexRef.current, 0);
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(root);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", onResize);
    viewport?.addEventListener("scroll", onViewportScroll);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onViewportScroll, { passive: true });

    const onTouchMove = (event: TouchEvent) => {
      if (dragRef.current?.axis !== "x") return;
      event.preventDefault();
    };
    root.addEventListener("touchmove", onTouchMove, { passive: false });

    const onLost = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.id !== event.pointerId) return;
      settle(dxRef.current, 0);
    };
    document.addEventListener("pointerup", onLost);
    document.addEventListener("pointercancel", onLost);

    return () => {
      observer.disconnect();
      viewport?.removeEventListener("resize", onResize);
      viewport?.removeEventListener("scroll", onViewportScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onViewportScroll);
      root.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("pointerup", onLost);
      document.removeEventListener("pointercancel", onLost);
      window.clearTimeout(settleTimerRef.current);
    };
  }, [measure, paint, settle]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const root = rootRef.current;
    const onEdge =
      event.target instanceof Element && Boolean(event.target.closest(".mobile-pager-edge"));
    if (!onEdge && (isFromPagerIgnore(event.target) || isHorizontalScroller(event.target, root))) {
      return;
    }
    window.clearTimeout(settleTimerRef.current);
    measure();
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      axis: onEdge ? "x" : null,
      samples: [{ t: event.timeStamp, x: event.clientX }],
    };
    dxRef.current = 0;
    if (onEdge) {
      event.currentTarget.setPointerCapture(event.pointerId);
      paint("drag", indexRef.current, 0);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.axis) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (drag.axis === "x") event.currentTarget.setPointerCapture(event.pointerId);
      else {
        dragRef.current = null;
        paint("idle", indexRef.current, 0);
        return;
      }
    }
    if (drag.axis !== "x") return;
    const width = widthRef.current || window.innerWidth;
    const current = indexRef.current;
    let nextDx = dx;
    if (current === 0 && dx > 0) nextDx = rubberband(dx, width);
    else if (current === last && dx < 0) nextDx = rubberband(dx, width);
    drag.samples.push({ t: event.timeStamp, x: event.clientX });
    if (drag.samples.length > 5) drag.samples.shift();
    paint("drag", current, nextDx);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.axis !== "x") {
      cancelGesture();
      return;
    }
    const first = drag.samples[0];
    const lastSample = drag.samples[drag.samples.length - 1] ?? first;
    const dt = Math.max(1, lastSample.t - first.t);
    const velocity = ((lastSample.x - first.x) / dt) * 1000;
    settle(dxRef.current, velocity);
  };

  return (
    <div
      ref={rootRef}
      className="mobile-pager"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="mobile-pager-track">
        {Children.map(children, (child, i) => (
          <div
            key={i}
            ref={(node) => {
              slidesRef.current[i] = node;
            }}
            className="mobile-pager-slide"
            aria-hidden={i !== index}
            inert={i !== index || undefined}
          >
            {child}
          </div>
        ))}
      </div>
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

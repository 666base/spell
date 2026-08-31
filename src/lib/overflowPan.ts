/** Click/swipe panning for overflow containers that hide native scrollbars. */

export const PAN_SLOP = 10;
const INERTIA_FRICTION = 0.0035;
const INERTIA_MIN_VELOCITY = 0.02;
const SAMPLE_WINDOW_MS = 80;

export type PanAxis = "x" | "y";
export type PointerKind = "mouse" | "pen" | "touch";

export interface OverflowPanOptions {
  axis?: PanAxis;
  ignore?: string | ((event: PointerEvent) => boolean);
  pointerTypes?: readonly PointerKind[];
  /** Cancel an uncommitted pan so a long-press recognizer (e.g. card drag) can take over. */
  holdCancelsMs?: number;
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function overflowAmount(scrollSize: number, clientSize: number) {
  return Math.max(0, scrollSize - clientSize);
}

export function axisFromDelta(dx: number, dy: number, slop = PAN_SLOP): PanAxis | null {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null;
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

export function panScroll(origin: number, delta: number, max: number) {
  return clamp(origin - delta, 0, max);
}

export function velocityFromSamples(samples: Sample[], axis: PanAxis) {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    if (last.t - samples[i].t > SAMPLE_WINDOW_MS) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  if (dt < 8) return 0;
  const delta = axis === "x" ? last.x - first.x : last.y - first.y;
  return delta / dt;
}

export function inertiaVelocity(velocity: number, dtMs: number, reducedMotion: boolean) {
  if (reducedMotion || Math.abs(velocity) < INERTIA_MIN_VELOCITY) return 0;
  return velocity * Math.exp(-INERTIA_FRICTION * dtMs);
}

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function isIgnored(event: PointerEvent, ignore?: OverflowPanOptions["ignore"]) {
  if (!ignore) return false;
  if (typeof ignore === "function") return ignore(event);
  return event.target instanceof Element && Boolean(event.target.closest(ignore));
}

function syncCanPan(element: HTMLElement, axis: PanAxis) {
  const can =
    axis === "x"
      ? overflowAmount(element.scrollWidth, element.clientWidth) > 2
      : overflowAmount(element.scrollHeight, element.clientHeight) > 2;
  element.dataset.canPan = can ? "true" : "false";
  return can;
}

export function bindOverflowPan(element: HTMLElement, options: OverflowPanOptions = {}) {
  const axis = options.axis ?? "x";
  const pointerTypes = options.pointerTypes ?? ["mouse", "pen", "touch"];
  let drag: {
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
    locked: PanAxis | null;
    samples: Sample[];
  } | null = null;
  let inertiaId = 0;
  let holdTimer = 0;

  const stopInertia = () => {
    if (inertiaId) cancelAnimationFrame(inertiaId);
    inertiaId = 0;
  };

  const stopHold = () => {
    if (holdTimer) window.clearTimeout(holdTimer);
    holdTimer = 0;
  };

  const finishPan = () => {
    stopHold();
    element.classList.remove("is-panning");
    if (drag && element.hasPointerCapture?.(drag.id)) {
      element.releasePointerCapture(drag.id);
    }
    drag = null;
  };

  const startInertia = (pointerVelocity: number, locked: PanAxis) => {
    if (reducedMotion() || Math.abs(pointerVelocity) < INERTIA_MIN_VELOCITY) return;
    let velocity = -pointerVelocity;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(32, now - last);
      last = now;
      velocity = inertiaVelocity(velocity, dt, false);
      if (velocity === 0) {
        inertiaId = 0;
        return;
      }
      if (locked === "x") {
        const max = overflowAmount(element.scrollWidth, element.clientWidth);
        const next = clamp(element.scrollLeft + velocity * dt, 0, max);
        element.scrollLeft = next;
        if (next <= 0 || next >= max) {
          inertiaId = 0;
          return;
        }
      } else {
        const max = overflowAmount(element.scrollHeight, element.clientHeight);
        const next = clamp(element.scrollTop + velocity * dt, 0, max);
        element.scrollTop = next;
        if (next <= 0 || next >= max) {
          inertiaId = 0;
          return;
        }
      }
      inertiaId = requestAnimationFrame(tick);
    };
    inertiaId = requestAnimationFrame(tick);
  };

  const onMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.samples.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
    if (drag.samples.length > 8) drag.samples.shift();

    if (!drag.locked) {
      const locked = axisFromDelta(dx, dy);
      if (!locked) return;
      if (locked !== axis || !syncCanPan(element, axis)) {
        finishPan();
        detachWindow();
        return;
      }
      drag.locked = locked;
      stopHold();
      element.classList.add("is-panning");
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best-effort; window listeners still track the gesture */
      }
      window.getSelection()?.removeAllRanges();
    }

    if (event.cancelable) event.preventDefault();
    if (drag.locked === "x") {
      element.scrollLeft = panScroll(
        drag.left,
        dx,
        overflowAmount(element.scrollWidth, element.clientWidth),
      );
    } else {
      element.scrollTop = panScroll(
        drag.top,
        dy,
        overflowAmount(element.scrollHeight, element.clientHeight),
      );
    }
  };

  const onUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const locked = drag.locked;
    const samples = drag.samples;
    finishPan();
    detachWindow();
    if (!locked) return;
    startInertia(velocityFromSamples(samples, locked), locked);
  };

  const detachWindow = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (!pointerTypes.includes(event.pointerType as PointerKind)) return;
    if (isIgnored(event, options.ignore)) return;
    if (!syncCanPan(element, axis)) return;

    stopInertia();
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: element.scrollLeft,
      top: element.scrollTop,
      locked: null,
      samples: [{ t: event.timeStamp, x: event.clientX, y: event.clientY }],
    };
    if (options.holdCancelsMs) {
      holdTimer = window.setTimeout(() => {
        if (drag && !drag.locked) {
          finishPan();
          detachWindow();
        }
      }, options.holdCancelsMs);
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onLostCapture = () => {
    if (!drag) return;
    finishPan();
    detachWindow();
  };

  const onDragStart = (event: DragEvent) => {
    if (element.classList.contains("is-panning")) event.preventDefault();
  };

  const observer =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => syncCanPan(element, axis));
  const watchSize = () => {
    observer?.observe(element);
    for (const child of element.children) {
      if (child instanceof Element) observer?.observe(child);
    }
    syncCanPan(element, axis);
  };
  const mutation =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(watchSize);
  mutation?.observe(element, { childList: true });
  watchSize();

  element.addEventListener("pointerdown", onDown);
  element.addEventListener("lostpointercapture", onLostCapture);
  element.addEventListener("dragstart", onDragStart);

  return () => {
    stopInertia();
    finishPan();
    detachWindow();
    observer?.disconnect();
    mutation?.disconnect();
    element.removeEventListener("pointerdown", onDown);
    element.removeEventListener("lostpointercapture", onLostCapture);
    element.removeEventListener("dragstart", onDragStart);
    delete element.dataset.canPan;
  };
}

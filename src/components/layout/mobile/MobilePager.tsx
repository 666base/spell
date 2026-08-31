import {
  Children,
  startTransition,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useKeenSlider, type KeenSliderInstance, type KeenSliderPlugin } from "keen-slider/react";
import { MOTION_PANEL_MS } from "../../../lib/motion";
import "keen-slider/keen-slider.min.css";

const SETTLE_MS = MOTION_PANEL_MS;
const IOS_OUT = (t: number) => 1 - (1 - t) ** 4;

interface MobilePagerProps {
  index: number;
  onIndexChange: (index: number) => void;
  children: ReactNode;
}

function reducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function shouldBlockDrag(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  // Page swipes start only from the edge strips. A tap anywhere else must stay a tap.
  return !target.closest(".mobile-pager-edge");
}

/** Cap Keen's 500ms snap and keep rubber-band / flick on the compositor. */
function appleSnap(slider: KeenSliderInstance) {
  const start = slider.animator.start.bind(slider.animator);
  slider.animator.start = (keyframes) => {
    const instant = reducedMotion();
    start(
      keyframes.map((frame) => ({
        ...frame,
        duration: instant ? 0 : Math.min(frame.duration, SETTLE_MS),
        earlyExit:
          frame.earlyExit == null
            ? undefined
            : instant
              ? 0
              : Math.min(frame.earlyExit, SETTLE_MS),
        easing: IOS_OUT,
      })),
    );
  };
}

const DRAG_START_EVENTS = new Set(["touchstart", "mousedown", "pointerdown", "dragstart"]);

/**
 * Skip Keen's own drag-start listeners on interactive targets.
 * Do not stopPropagation — React still needs the event for taps.
 */
function dragGuard(slider: KeenSliderInstance) {
  const container = slider.container;
  const nativeAdd = container.addEventListener;
  const nativeRemove = container.removeEventListener;
  const wrapped = new Map<EventListenerOrEventListenerObject, EventListener>();

  const wrap = (listener: EventListenerOrEventListenerObject): EventListener => {
    const existing = wrapped.get(listener);
    if (existing) return existing;
    const next: EventListener = (event) => {
      if (shouldBlockDrag(event.target)) return;
      if (typeof listener === "function") listener.call(container, event);
      else listener.handleEvent(event);
    };
    wrapped.set(listener, next);
    return next;
  };

  container.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (!listener || !DRAG_START_EVENTS.has(type)) {
      nativeAdd.call(container, type, listener as EventListener, options);
      return;
    }
    nativeAdd.call(container, type, wrap(listener), options);
  }) as typeof container.addEventListener;

  container.removeEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) => {
    if (!listener) return;
    nativeRemove.call(container, type, wrapped.get(listener) ?? listener, options);
  }) as typeof container.removeEventListener;

  const setLayers = (on: boolean) => {
    for (const slide of slider.slides) {
      slide.style.willChange = on ? "transform" : "auto";
    }
  };

  slider.on("dragStarted", () => setLayers(true));
  slider.on("animationEnded", () => setLayers(false));
  slider.on("animationStopped", () => setLayers(false));
  slider.on("destroyed", () => {
    container.addEventListener = nativeAdd;
    container.removeEventListener = nativeRemove;
    wrapped.clear();
  });
}

const plugins: KeenSliderPlugin[] = [appleSnap as KeenSliderPlugin, dragGuard as KeenSliderPlugin];

export function MobilePager({ index, onIndexChange, children }: MobilePagerProps) {
  const indexRef = useRef(index);
  const onChangeRef = useRef(onIndexChange);
  const initialIndex = useRef(index);
  const [settled, setSettled] = useState(index);
  indexRef.current = index;
  onChangeRef.current = onIndexChange;

  const [sliderRef, slider] = useKeenSlider<HTMLDivElement>(
    {
      initial: initialIndex.current,
      loop: false,
      vertical: false,
      mode: "snap",
      rubberband: true,
      renderMode: "performance",
      dragSpeed: 1,
      slides: { perView: 1, spacing: 0 },
      defaultAnimation: {
        duration: reducedMotion() ? 0 : SETTLE_MS,
        easing: IOS_OUT,
      },
      slideChanged(instance) {
        const next = instance.track.details.rel;
        if (next === indexRef.current) return;
        startTransition(() => onChangeRef.current(next));
      },
      animationEnded(instance) {
        setSettled(instance.track.details.rel);
      },
      created(instance) {
        setSettled(instance.track.details.rel);
      },
    },
    plugins,
  );

  useEffect(() => {
    const instance = slider.current;
    if (!instance?.track.details) return;
    if (instance.track.details.rel !== index) {
      if (!(instance.animator.active && instance.animator.targetIdx === index)) {
        instance.moveToIdx(index);
      }
    }
    const unlock = window.setTimeout(() => setSettled(index), SETTLE_MS + 40);
    return () => window.clearTimeout(unlock);
  }, [index, slider]);

  return (
    <div ref={sliderRef} className="mobile-pager keen-slider">
      {Children.map(children, (child, i) => (
        <div
          key={i}
          className="keen-slider__slide mobile-pager-slide"
          aria-hidden={i !== index && i !== settled}
          inert={(i !== index && i !== settled) || undefined}
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

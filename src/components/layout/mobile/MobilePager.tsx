import { Children, useEffect, useRef, type ReactNode } from "react";
import "keen-slider/keen-slider.min.css";
import { useKeenSlider } from "keen-slider/react";
import { MOTION_PANEL_MS } from "../../../lib/motion";
import { isKeyboardOpen, readCssKeyboardInset } from "../../../lib/keyboardInset";

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
        "button, a, input, textarea, select, [role='button'], [role='tab'], [role='dialog'], [contenteditable='true'], [data-pager-ignore], .kanban-board, .spell-table-scroll, .journal-calendar, .mobile-format-toolbar, .mobile-drawer, .mobile-action-layer, .mobile-scroll, .ProseMirror",
      ),
    )
  );
}

function keyboardBlocksPager() {
  return (
    document.documentElement.dataset.keyboard === "open" ||
    isKeyboardOpen(
      readCssKeyboardInset(
        document.documentElement.style.getPropertyValue("--keyboard-inset"),
      ),
    )
  );
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

export function MobilePager({ index, onIndexChange, children }: MobilePagerProps) {
  const indexRef = useRef(index);
  const onChangeRef = useRef(onIndexChange);
  indexRef.current = index;
  onChangeRef.current = onIndexChange;

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [sliderRef, slider] = useKeenSlider<HTMLDivElement>({
    initial: index,
    rubberband: true,
    renderMode: "performance",
    slides: { perView: 1 },
    defaultAnimation: {
      duration: reduceMotion ? 0 : MOTION_PANEL_MS,
      easing: easeOutCubic,
    },
    slideChanged(instance) {
      const next = instance.track.details.rel;
      if (next !== indexRef.current) onChangeRef.current(next);
    },
    created(instance) {
      const root = instance.container;
      const syncDrag = (event: Event) => {
        instance.options.drag = !(
          keyboardBlocksPager() ||
          (event instanceof PointerEvent && isInteractive(event.target))
        );
      };
      const restoreDrag = () => {
        instance.options.drag = !keyboardBlocksPager();
      };
      root.addEventListener("pointerdown", syncDrag, true);
      window.addEventListener("pointerup", restoreDrag);
      window.addEventListener("pointercancel", restoreDrag);
      window.addEventListener("spell-keyboard", restoreDrag);
      instance.on("destroyed", () => {
        root.removeEventListener("pointerdown", syncDrag, true);
        window.removeEventListener("pointerup", restoreDrag);
        window.removeEventListener("pointercancel", restoreDrag);
        window.removeEventListener("spell-keyboard", restoreDrag);
      });
    },
  });

  useEffect(() => {
    const instance = slider.current;
    if (!instance) return;
    if (instance.track.details.rel !== index) {
      instance.moveToIdx(index);
    }
  }, [index, slider]);

  const slides = Children.toArray(children).slice(0, PAGE_COUNT);

  return (
    <div ref={sliderRef} className="mobile-pager keen-slider">
      {slides.map((child, i) => (
        <div
          key={i}
          className={
            i === index
              ? "keen-slider__slide mobile-pager-slide is-active"
              : "keen-slider__slide mobile-pager-slide"
          }
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

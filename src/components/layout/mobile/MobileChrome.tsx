import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { cn } from "../../../lib/utils";
import { ChevronLeftIcon } from "../../icons/velocity";

export function MobileNavBar({
  leading,
  backLabel,
  onBack,
  title,
  trailing,
}: {
  leading?: ReactNode;
  backLabel?: string;
  onBack?: () => void;
  title?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="mobile-nav">
      <div className="mobile-nav-side">
        {leading}
        {!leading && onBack && (
          <button type="button" className="mobile-nav-back" onClick={onBack}>
            <ChevronLeftIcon className="mobile-nav-back-icon" />
            {backLabel && <span className="truncate">{backLabel}</span>}
          </button>
        )}
      </div>
      <div className="mobile-nav-title">{title}</div>
      <div className="mobile-nav-side mobile-nav-side-end">{trailing}</div>
    </header>
  );
}

export function MobileBottomBar({ children }: { children: ReactNode }) {
  return <div className="mobile-bottom-bar">{children}</div>;
}

export function MobileTintButton({
  title,
  onClick,
  children,
  className,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn("mobile-tint-button", className)}
    >
      {children}
    </button>
  );
}

export function MobileScreen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("mobile-screen", className)}>{children}</div>;
}

export function MobileScroll({
  children,
  className,
  edgeStart = false,
  edgeEnd = false,
}: {
  children: ReactNode;
  className?: string;
  edgeStart?: boolean;
  edgeEnd?: boolean;
}) {
  return (
    <div className="mobile-scroll-host">
      {edgeStart && <div className="mobile-pager-edge mobile-pager-edge-start" aria-hidden />}
      {edgeEnd && <div className="mobile-pager-edge mobile-pager-edge-end" aria-hidden />}
      <div
        className={cn("mobile-scroll", className)}
      >
        {children}
      </div>
    </div>
  );
}

export function ComposeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("mobile-compose-icon", className)}>
      <path
        d="M14.2 4.75h-7.45A1.75 1.75 0 0 0 5 6.5v11A1.75 1.75 0 0 0 6.75 19.25h10.5A1.75 1.75 0 0 0 19 17.5v-7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M19.6 4.4a1.35 1.35 0 0 1 0 1.91l-7.08 7.08-2.62.7.7-2.62 7.08-7.08a1.35 1.35 0 0 1 1.91 0Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FolderPlusGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("mobile-folder-plus", className)}>
      <path
        d="M3.5 7.25C3.5 6.01 4.51 5 5.75 5h3.1c.4 0 .78.16 1.06.44l1.2 1.2c.28.28.66.44 1.06.44H18.25C19.49 7.08 20.5 8.1 20.5 9.33v7.42c0 1.24-1.01 2.25-2.25 2.25H5.75A2.25 2.25 0 0 1 3.5 16.75V7.25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M12 11.2v5.1M9.45 13.75h5.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

type ImeWindow = Window & {
  __SPELL_IME__?: number;
  SpellIme?: { getInset: () => number };
};

type VirtualKeyboard = {
  overlaysContent: boolean;
  boundingRect: DOMRect;
  addEventListener: (type: "geometrychange", listener: () => void) => void;
  removeEventListener: (type: "geometrychange", listener: () => void) => void;
};

function virtualKeyboard(): VirtualKeyboard | undefined {
  return (navigator as Navigator & { virtualKeyboard?: VirtualKeyboard }).virtualKeyboard;
}

function nativeIme(): number {
  const w = window as ImeWindow;
  try {
    const bridged = w.SpellIme?.getInset?.();
    if (typeof bridged === "number" && Number.isFinite(bridged)) {
      return Math.max(0, bridged);
    }
  } catch {
    // Native bridge is optional in the web preview.
  }
  const fallback = Number(w.__SPELL_IME__);
  return Number.isFinite(fallback) ? Math.max(0, fallback) : 0;
}

function keyboardInset(): number {
  const viewport = window.visualViewport;
  const visual = viewport
    ? Math.max(0, window.innerHeight - (viewport.offsetTop + viewport.height))
    : 0;
  const virtual = virtualKeyboard()?.boundingRect.height ?? 0;
  return Math.max(0, Math.round(Math.max(nativeIme(), visual, virtual)));
}

function syncKeyboardInset() {
  const inset = `${keyboardInset()}px`;
  document.documentElement.style.setProperty("--keyboard-inset", inset);
  const shell = document.querySelector("[data-mobile-shell]");
  if (shell instanceof HTMLElement) {
    shell.style.setProperty("--keyboard-inset", inset);
  }
}

/** Keep --keyboard-inset in sync with the visual viewport (Android keyboard). */
export function useKeyboardInset() {
  useEffect(() => {
    syncKeyboardInset();
    const viewport = window.visualViewport;
    const keyboard = virtualKeyboard();
    try {
      if (keyboard) keyboard.overlaysContent = true;
    } catch {
      // VirtualKeyboard API is optional.
    }
    viewport?.addEventListener("resize", syncKeyboardInset);
    viewport?.addEventListener("scroll", syncKeyboardInset);
    keyboard?.addEventListener("geometrychange", syncKeyboardInset);
    window.addEventListener("resize", syncKeyboardInset);
    window.addEventListener("focusin", syncKeyboardInset);
    window.addEventListener("focusout", syncKeyboardInset);
    window.addEventListener("spell-keyboard", syncKeyboardInset);
    return () => {
      viewport?.removeEventListener("resize", syncKeyboardInset);
      viewport?.removeEventListener("scroll", syncKeyboardInset);
      keyboard?.removeEventListener("geometrychange", syncKeyboardInset);
      window.removeEventListener("resize", syncKeyboardInset);
      window.removeEventListener("focusin", syncKeyboardInset);
      window.removeEventListener("focusout", syncKeyboardInset);
      window.removeEventListener("spell-keyboard", syncKeyboardInset);
    };
  }, []);
}

/** Pin a body-portal element to the visual viewport (above the Android keyboard). */
export function useVisualViewportBottom(
  enabled: boolean,
): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;

    const sync = () => {
      const node = ref.current;
      if (!node) return;
      const inset = keyboardInset();
      const value = `${inset}px`;
      document.documentElement.style.setProperty("--keyboard-inset", value);
      node.style.top = "auto";
      node.style.left = "0px";
      node.style.right = "0px";
      node.style.width = "100%";
      node.style.transform = "none";
      node.style.bottom = value;
      node.style.paddingBottom = inset > 24 ? "6px" : "calc(6px + var(--safe-area-bottom))";
    };

    const onChange = () => {
      sync();
      cancelAnimationFrame(frame);
      const started = performance.now();
      const tick = () => {
        sync();
        if (performance.now() - started < 800) {
          frame = requestAnimationFrame(tick);
        }
      };
      frame = requestAnimationFrame(tick);
    };

    const viewport = window.visualViewport;
    const keyboard = virtualKeyboard();
    try {
      if (keyboard) keyboard.overlaysContent = true;
    } catch {
      // VirtualKeyboard API is optional.
    }

    sync();
    const poll = window.setInterval(sync, 32);
    viewport?.addEventListener("resize", onChange);
    viewport?.addEventListener("scroll", onChange);
    keyboard?.addEventListener("geometrychange", onChange);
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    window.addEventListener("focusin", onChange);
    window.addEventListener("focusout", onChange);
    window.addEventListener("spell-keyboard", onChange);
    return () => {
      window.clearInterval(poll);
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", onChange);
      viewport?.removeEventListener("scroll", onChange);
      keyboard?.removeEventListener("geometrychange", onChange);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
      window.removeEventListener("focusin", onChange);
      window.removeEventListener("focusout", onChange);
      window.removeEventListener("spell-keyboard", onChange);
    };
  }, [enabled]);

  return ref;
}

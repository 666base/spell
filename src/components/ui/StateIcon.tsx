import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { ChevronRightIcon } from "../icons/velocity";

export const CHECK_SHORT_PATH = "M6.2 12.4 10.1 16.4";
export const CHECK_LONG_PATH = "M10.1 16.4 18.2 7.3";
export const CHECK_DRAW_MS = 270;

const CHECK_SHORT_MS = 90;
const CHECK_LONG_MS = 210;
const CHECK_LONG_DELAY_MS = 60;
const CHECK_ERASE_MS = 140;
const CHECK_ERASE_SHORT_DELAY_MS = 50;

type CheckSignal = { cancelled: boolean };
const running = new WeakMap<HTMLElement, CheckSignal>();

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function checkPaths(span: HTMLElement) {
  return {
    short: span.querySelector<SVGPathElement>(".state-checkmark-short"),
    long: span.querySelector<SVGPathElement>(".state-checkmark-long"),
  };
}

function cancelCheck(span: HTMLElement) {
  const current = running.get(span);
  if (current) current.cancelled = true;
}

function preparePath(path: SVGPathElement) {
  path.setAttribute("pathLength", "1");
  path.setAttribute("stroke-dasharray", "1");
}

function writeOffset(path: SVGPathElement, offset: number) {
  path.style.removeProperty("stroke-dashoffset");
  path.setAttribute("stroke-dashoffset", String(offset));
}

function readOffset(path: SVGPathElement, fallback: number) {
  const raw = path.getAttribute("stroke-dashoffset");
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function snapCheck(span: HTMLElement, checked: boolean) {
  cancelCheck(span);
  const { short, long } = checkPaths(span);
  const offset = checked ? 0 : 1;
  if (short) {
    preparePath(short);
    writeOffset(short, offset);
  }
  if (long) {
    preparePath(long);
    writeOffset(long, offset);
  }
}

function tweenOffset(
  path: SVGPathElement,
  from: number,
  to: number,
  duration: number,
  delay: number,
  signal: CheckSignal,
) {
  preparePath(path);
  writeOffset(path, from);
  const begin = performance.now() + delay;
  const scaled = duration * Math.abs(to - from);
  const tick = (now: number) => {
    if (signal.cancelled) return;
    if (now < begin) {
      requestAnimationFrame(tick);
      return;
    }
    const t = scaled <= 0 ? 1 : Math.min(1, (now - begin) / scaled);
    writeOffset(path, from + (to - from) * t);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function playCheck(span: HTMLElement, checked: boolean) {
  const { short, long } = checkPaths(span);
  if (!short || !long) return;
  cancelCheck(span);
  const signal = { cancelled: false };
  running.set(span, signal);
  if (checked) {
    tweenOffset(short, readOffset(short, 1), 0, CHECK_SHORT_MS, 0, signal);
    tweenOffset(long, readOffset(long, 1), 0, CHECK_LONG_MS, CHECK_LONG_DELAY_MS, signal);
    return;
  }
  tweenOffset(long, readOffset(long, 0), 1, CHECK_ERASE_MS, 0, signal);
  tweenOffset(short, readOffset(short, 0), 1, CHECK_SHORT_MS, CHECK_ERASE_SHORT_DELAY_MS, signal);
}

function appendCheckPath(svg: SVGSVGElement, className: string, d: string) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", className);
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "3");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("pathLength", "1");
  path.setAttribute("stroke-dasharray", "1");
  path.setAttribute("stroke-dashoffset", "1");
  svg.append(path);
}

export function createCheckmarkSvg(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("class", "state-checkmark-svg");
  svg.setAttribute("aria-hidden", "true");
  appendCheckPath(svg, "state-checkmark-short", CHECK_SHORT_PATH);
  appendCheckPath(svg, "state-checkmark-long", CHECK_LONG_PATH);
  return svg;
}

export function paintCheckmark(span: HTMLElement, checked: boolean, animate = true) {
  span.classList.add("state-checkmark");
  span.dataset.motion = "js";
  if (!span.querySelector(".state-checkmark-svg")) {
    span.append(createCheckmarkSvg());
  }
  const next = checked ? "checked" : "unchecked";
  const prev = span.dataset.state;
  if (prev === next) return;
  span.dataset.state = next;
  if (!animate || !prev || prefersReducedMotion()) {
    snapCheck(span, checked);
    return;
  }
  playCheck(span, checked);
}

interface DisclosureIconProps {
  open: boolean;
  className?: string;
}

export function DisclosureIcon({ open, className }: DisclosureIconProps) {
  return (
    <ChevronRightIcon
      aria-hidden="true"
      data-open={open ? "true" : "false"}
      className={cn("state-disclosure", className)}
    />
  );
}

interface PanelToggleIconProps {
  side: "left" | "right";
  open: boolean;
  className?: string;
}

export function PanelToggleIcon({ side, open, className }: PanelToggleIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-open={open ? "true" : "false"}
      data-side={side}
      className={cn("ui-icon panel-toggle-icon", className)}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <rect
        className="panel-toggle-pane"
        x={side === "left" ? 3 : 15}
        y="3"
        width="6"
        height="18"
        rx="1"
        fill="currentColor"
        stroke="none"
      />
      <path className="panel-toggle-divider" d={side === "left" ? "M9 3v18" : "M15 3v18"} />
    </svg>
  );
}

interface CheckmarkIconProps {
  checked: boolean;
  className?: string;
}

export function CheckmarkIcon({ checked, className }: CheckmarkIconProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useRef(false);

  useLayoutEffect(() => {
    const span = ref.current;
    if (!span) return;
    paintCheckmark(span, checked, seen.current);
    seen.current = true;
  }, [checked]);

  return (
    <span ref={ref} aria-hidden="true" className={cn("state-checkmark", className)}>
      <svg viewBox="0 0 24 24" fill="none" className="state-checkmark-svg" aria-hidden="true">
        <path
          className="state-checkmark-short"
          d={CHECK_SHORT_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
        />
        <path
          className="state-checkmark-long"
          d={CHECK_LONG_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
        />
      </svg>
    </span>
  );
}

const FOLDER_CLOSED =
  "M1.55 4.15C1.55 2.96 2.51 2 3.7 2h4.25c.52 0 1.02.19 1.4.53l1.28 1.14c.38.34.88.53 1.4.53H16.3c1.2 0 2.15.96 2.15 2.15V15.7c0 1.38-1.12 2.5-2.5 2.5H4.05c-1.38 0-2.5-1.12-2.5-2.5V4.15Z";

const FOLDER_TAB =
  "M1.55 4.15C1.55 2.96 2.51 2 3.7 2h4.25c.52 0 1.02.19 1.4.53l1.28 1.14c.38.34.88.53 1.4.53V4.45H1.55V4.15Z";

const FOLDER_OPEN_FRONT =
  "M18.45 8.04A1.22 1.54 0 0 0 17.46 7.4H16.23V5.86A1.22 1.54 0 0 0 15.01 4.31H9.71L7.59 2.31A1.23 1.56 0 0 0 6.85 2H2.77A1.22 1.54 0 0 0 1.55 3.54V17.43A.61.77 0 0 0 2.16 18.2H15.86A.61.77 0 0 0 16.44 17.67L18.62 9.43A1.23 1.55 0 0 0 18.45 8.04Z";

const FOLDER_OPEN_BACK =
  "M6.85 3.54 9.14 5.7A.61.77 0 0 0 9.5 5.86H15.01V7.4H5.05A1.22 1.54 0 0 0 3.89 8.45L2.77 12.67V3.54ZM1.55 3.54A1.22 1.54 0 0 1 2.77 2H6.85A1.23 1.56 0 0 1 7.59 2.31L9.71 4.31H1.55Z";

export function FolderGlyph({ open = false, className }: { open?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      data-open={open ? "true" : "false"}
      className={cn("source-glyph folder-glyph", className)}
    >
      <g className="folder-glyph-open">
        <path className="source-glyph-dark folder-glyph-pocket" d={FOLDER_OPEN_FRONT} />
        <path className="source-glyph-light folder-glyph-back" d={FOLDER_OPEN_BACK} />
      </g>
      <g className="folder-glyph-closed">
        <path className="source-glyph-dark folder-glyph-body" d={FOLDER_CLOSED} />
        <path className="source-glyph-light folder-glyph-tab" d={FOLDER_TAB} />
      </g>
    </svg>
  );
}

function SourceGlyph({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={cn("source-glyph", className)}>
      {children}
    </svg>
  );
}

/** Two-tone calendar: binding rings, month bar, day grid. */
export function JournalGlyph({ className }: { className?: string }) {
  return (
    <SourceGlyph className={cn("journal-glyph", className)}>
      <rect className="source-glyph-dark journal-glyph-page" x="2.15" y="3.55" width="15.7" height="14.45" rx="2.15" />
      <rect className="source-glyph-light journal-glyph-header" x="2.15" y="3.55" width="15.7" height="4.85" rx="2.15" />
      <rect className="source-glyph-light journal-glyph-header" x="2.15" y="6.15" width="15.7" height="2.25" />
      <rect className="source-glyph-dark journal-glyph-ring" x="5.15" y="1.55" width="2.5" height="4.7" rx="1.25" />
      <rect className="source-glyph-dark journal-glyph-ring" x="12.35" y="1.55" width="2.5" height="4.7" rx="1.25" />
      <rect className="source-glyph-light journal-glyph-day" x="4.45" y="9.55" width="3.15" height="2.7" rx="0.7" />
      <rect className="source-glyph-light journal-glyph-day" x="8.425" y="9.55" width="3.15" height="2.7" rx="0.7" />
      <rect className="source-glyph-light journal-glyph-day" x="12.4" y="9.55" width="3.15" height="2.7" rx="0.7" />
      <rect className="source-glyph-light journal-glyph-day" x="4.45" y="13.4" width="3.15" height="2.7" rx="0.7" />
      <rect className="source-glyph-light journal-glyph-day" x="8.425" y="13.4" width="3.15" height="2.7" rx="0.7" />
      <rect className="source-glyph-light journal-glyph-day" x="12.4" y="13.4" width="3.15" height="2.7" rx="0.7" />
    </SourceGlyph>
  );
}

/** Two-tone board with staggered columns. */
export function ProjectsGlyph({ className }: { className?: string }) {
  return (
    <SourceGlyph className={className}>
      <rect className="source-glyph-dark" x="2.05" y="2.35" width="15.9" height="15.3" rx="2.15" />
      <rect className="source-glyph-light" x="4.1" y="4.7" width="3.15" height="10.15" rx="1" />
      <rect className="source-glyph-light" x="8.425" y="4.7" width="3.15" height="6.35" rx="1" />
      <rect className="source-glyph-light" x="12.75" y="4.7" width="3.15" height="8.55" rx="1" />
    </SourceGlyph>
  );
}

/** Two-tone debit/credit card: body, stripe, chip. */
export function MoneyGlyph({ className }: { className?: string }) {
  return (
    <SourceGlyph className={cn("money-glyph", className)}>
      <rect className="source-glyph-dark money-glyph-card" x="1.85" y="4.05" width="16.3" height="11.9" rx="2.15" />
      <rect className="source-glyph-light money-glyph-stripe" x="1.85" y="6.4" width="16.3" height="2.2" />
      <rect className="source-glyph-light money-glyph-chip" x="3.55" y="10.25" width="3.7" height="2.75" rx="0.55" />
      <rect className="source-glyph-light money-glyph-mark" x="13.15" y="12.55" width="3.15" height="2.05" rx="0.55" />
    </SourceGlyph>
  );
}

const HOME_BODY =
  "M10 2.55 17.35 9.7c.22.22.07.58-.24.58H15.85V16.45c0 1.1-.9 1.95-2 1.95H6.15c-1.1 0-2-.85-2-1.95V10.28H2.89c-.31 0-.46-.36-.24-.58Z";

const HOME_ROOF =
  "M2.65 9.7 10 2.55l7.35 7.15c.22.22.07.58-.24.58H2.89c-.31 0-.46-.36-.24-.58Z";

const HOME_DOOR =
  "M8.4 18.4V13.05C8.4 12.22 9.12 11.55 9.95 11.55h.1c.83 0 1.55.67 1.55 1.5V18.4Z";

/** Two-tone house: connected pentagon, light roof, light door. */
export function HomeGlyph({ className }: { className?: string }) {
  return (
    <SourceGlyph className={cn("home-glyph", className)}>
      <path className="source-glyph-dark home-glyph-body" d={HOME_BODY} />
      <path className="source-glyph-light home-glyph-roof" d={HOME_ROOF} />
      <path className="source-glyph-light home-glyph-door" d={HOME_DOOR} />
    </SourceGlyph>
  );
}

/** Two-tone stack of notes. */
export function AllNotesGlyph({ className }: { className?: string }) {
  return (
    <SourceGlyph className={cn("all-notes-glyph", className)}>
      <rect className="source-glyph-light all-notes-glyph-back" x="4.4" y="2.05" width="13.4" height="13.85" rx="2.15" />
      <rect className="source-glyph-dark all-notes-glyph-page" x="2.15" y="4.15" width="13.4" height="13.7" rx="2.15" />
      <rect className="source-glyph-light all-notes-glyph-line" x="4.45" y="7.45" width="8.8" height="1.7" rx="0.7" />
      <rect className="source-glyph-light all-notes-glyph-line" x="4.45" y="10.55" width="6.4" height="1.7" rx="0.7" />
    </SourceGlyph>
  );
}

/** Two-tone archive box with a lid. */
export function ArchiveGlyph({ className }: { className?: string }) {
  return (
    <SourceGlyph className={cn("archive-glyph", className)}>
      <rect className="source-glyph-dark archive-glyph-box" x="2.25" y="7.55" width="15.5" height="10.25" rx="2.15" />
      <rect className="source-glyph-light archive-glyph-lid" x="1.7" y="4.05" width="16.6" height="5.15" rx="2.15" />
      <rect className="source-glyph-light archive-glyph-lid" x="1.7" y="6.7" width="16.6" height="2.5" />
      <rect className="source-glyph-dark archive-glyph-slot" x="7.55" y="5.55" width="4.9" height="1.65" rx="0.8" />
    </SourceGlyph>
  );
}

/** Two-tone dashboard: tiles on a board. */
export function OverviewGlyph({ className }: { className?: string }) {
  return (
    <SourceGlyph className={cn("overview-glyph", className)}>
      <rect className="source-glyph-dark overview-glyph-board" x="2.05" y="2.35" width="15.9" height="15.3" rx="2.15" />
      <rect className="source-glyph-light overview-glyph-tile" x="4.15" y="4.5" width="5.45" height="5.35" rx="1" />
      <rect className="source-glyph-light overview-glyph-tile" x="10.4" y="4.5" width="5.45" height="5.35" rx="1" />
      <rect className="source-glyph-light overview-glyph-tile" x="4.15" y="10.7" width="11.7" height="4.55" rx="1" />
    </SourceGlyph>
  );
}

/** Two-tone stacked cards — recurring charges, not a single bank card. */
export function SubscriptionsGlyph({ className }: { className?: string }) {
  return (
    <SourceGlyph className={cn("subscriptions-glyph", className)}>
      <rect className="source-glyph-light subscriptions-glyph-back" x="3.55" y="2.65" width="14.6" height="10.5" rx="2.15" />
      <rect className="source-glyph-dark subscriptions-glyph-card" x="1.85" y="6.7" width="14.6" height="10.7" rx="2.15" />
      <rect className="source-glyph-light subscriptions-glyph-stripe" x="1.85" y="8.85" width="14.6" height="2.05" />
      <rect className="source-glyph-light subscriptions-glyph-chip" x="3.5" y="12.55" width="3.35" height="2.45" rx="0.5" />
    </SourceGlyph>
  );
}

export function MoneyKindGlyph({
  kind,
  className,
}: {
  kind: "overview" | "month" | "subscriptions";
  className?: string;
}) {
  if (kind === "overview") return <OverviewGlyph className={className} />;
  if (kind === "subscriptions") return <SubscriptionsGlyph className={className} />;
  return <JournalGlyph className={className} />;
}

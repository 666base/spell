import { useLayoutEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import {
  ChevronRightIcon,
  PanelLeftIcon,
  PanelRightIcon,
} from "../icons/velocity";

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
  const Icon = side === "left" ? PanelLeftIcon : PanelRightIcon;
  return (
    <Icon
      aria-hidden="true"
      data-open={open ? "true" : "false"}
      data-side={side}
      className={cn("ui-icon panel-toggle-icon", className)}
    />
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
      className={cn("folder-glyph", className)}
    >
      <g className="folder-glyph-open">
        <path className="folder-glyph-pocket" d={FOLDER_OPEN_FRONT} />
        <path className="folder-glyph-back" d={FOLDER_OPEN_BACK} />
      </g>
      <g className="folder-glyph-closed">
        <path className="folder-glyph-body" d={FOLDER_CLOSED} />
        <path className="folder-glyph-tab" d={FOLDER_TAB} />
      </g>
    </svg>
  );
}

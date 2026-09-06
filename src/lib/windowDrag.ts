import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isAndroid, isMobileApp } from "./platform";

const NO_DRAG_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "[role='button']",
  "[role='menuitem']",
  "[contenteditable='true']",
  ".titlebar-no-drag",
].join(",");

export interface WindowDragPointerEvent {
  button: number;
  pointerType: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
}

export function shouldStartWindowDrag(event: WindowDragPointerEvent) {
  if (event.button !== 0) return false;
  if (event.pointerType === "touch") return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  if (!(event.target instanceof Element)) return false;
  return !event.target.closest(NO_DRAG_SELECTOR);
}

function defaultStartDragging() {
  if (!isTauri() || isAndroid || isMobileApp) return;
  void getCurrentWindow().startDragging();
}

export function onWindowDragPointerDown(
  event: WindowDragPointerEvent,
  startDragging: () => void = defaultStartDragging,
) {
  if (!shouldStartWindowDrag(event)) return;
  event.preventDefault();
  startDragging();
}

export const windowDragRegionProps = {
  "data-tauri-drag-region": true,
  onPointerDown: onWindowDragPointerDown,
};

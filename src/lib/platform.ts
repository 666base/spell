/**
 * Platform detection utilities for cross-platform shortcut labels.
 * On macOS: ⌘, ⌥, ⇧
 * On Windows/Linux: Ctrl, Alt, Shift
 */

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export const isWindows =
  typeof navigator !== "undefined" && /Windows/.test(navigator.userAgent);

export const isAndroid =
  typeof navigator !== "undefined" && /Android/.test(navigator.userAgent);

/** Modifier key symbol/label */
export const mod = isMac ? "⌘" : "Ctrl";
export const shift = isMac ? "⇧" : "Shift";

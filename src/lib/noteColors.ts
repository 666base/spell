/** Apple Notes-style inks and markers. Keep hex values in sync with
 *  `.ProseMirror mark[data-color]` in App.css. */

export const NOTE_INKS = [
  { name: "Red", value: "#ff3b30" },
  { name: "Orange", value: "#ff9500" },
  { name: "Yellow", value: "#cc9a00" },
  { name: "Green", value: "#34c759" },
  { name: "Blue", value: "#007aff" },
  { name: "Purple", value: "#af52de" },
] as const;

export const NOTE_HIGHLIGHTS = [
  { name: "Yellow", value: "#fff3a0", swatch: "#f5d65a" },
  { name: "Pink", value: "#ffd4e6", swatch: "#f3a8c8" },
  { name: "Orange", value: "#ffe0bc", swatch: "#f0b47c" },
  { name: "Mint", value: "#c6f0dc", swatch: "#7ed9b0" },
  { name: "Blue", value: "#cfe6ff", swatch: "#7eb8ea" },
  { name: "Purple", value: "#ead6ff", swatch: "#c7a4ee" },
] as const;

export function sameNoteColor(a?: string, b?: string) {
  return (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
}

export function highlightMarkdown(inner: string, color?: string | null) {
  if (!color) return `==${inner}==`;
  return `<mark data-color="${color}">${inner}</mark>`;
}

export function inkMarkdown(inner: string, color?: string | null) {
  if (!color) return inner;
  return `<span style="color: ${color}">${inner}</span>`;
}

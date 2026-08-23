/** Apple Notes iOS 18 emphasis: five two-tone marks. Keep `value` in
 *  sync with `.ProseMirror mark[data-color]` in App.css. */
export const NOTE_HIGHLIGHTS = [
  { name: "Purple", value: "#ead6ff", swatch: "#c7a4ee" },
  { name: "Pink", value: "#ffd4e6", swatch: "#f3a8c8" },
  { name: "Orange", value: "#ffe0bc", swatch: "#f0b47c" },
  { name: "Mint", value: "#c6f0dc", swatch: "#7ed9b0" },
  { name: "Blue", value: "#cfe6ff", swatch: "#7eb8ea" },
] as const;

export function sameNoteColor(a?: string, b?: string) {
  return (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
}

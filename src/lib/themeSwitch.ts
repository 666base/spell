/**
 * Theme flips change background, text, border and shadow on almost every
 * node. Any color transition on those properties smears the whole window.
 * Freeze transitions for one frame, then restore.
 */
export const RESOLVED_THEME_KEY = "spell-resolved-theme";

export function resolveStartupTheme(
  stored: string | null | undefined,
  prefersDark: boolean,
): "light" | "dark" {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}

function themeStorage(): Pick<Storage, "setItem"> | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function rememberResolvedTheme(
  theme: "light" | "dark",
  storage: Pick<Storage, "setItem"> | null | undefined = themeStorage(),
): void {
  try {
    storage?.setItem(RESOLVED_THEME_KEY, theme);
  } catch {
    // Private mode must not block first paint.
  }
}

export function applyResolvedTheme(
  root: HTMLElement,
  theme: "light" | "dark",
  suppressTransitions = true,
): void {
  if (suppressTransitions) root.classList.add("theme-switching");
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  rememberResolvedTheme(theme);
  if (!suppressTransitions) {
    root.classList.remove("theme-switching");
    return;
  }
  void root.offsetWidth;
  requestAnimationFrame(() => {
    root.classList.remove("theme-switching");
  });
}

(() => {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  let theme = null;
  let zoom = null;
  let sidebar = null;
  let editorMax = null;
  try {
    const storage = window.localStorage;
    theme = storage?.getItem("spell-resolved-theme");
    zoom = storage?.getItem("spell-interface-zoom");
    sidebar = storage?.getItem("spell-sidebar-width");
    editorMax = storage?.getItem("spell-editor-max-width");
  } catch {
    theme = null;
  }

  const dark =
    theme === "dark" ? true : theme === "light" ? false : prefersDark;

  root.classList.toggle("dark", dark);
  root.dataset.startupTheme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";

  const zoomNum = zoom == null || zoom === "" ? NaN : Number(zoom);
  if (zoomNum >= 0.7 && zoomNum <= 1.5) {
    root.style.zoom = String(Math.round(zoomNum * 20) / 20);
  }

  const sidebarNum = sidebar == null || sidebar === "" ? NaN : Number(sidebar);
  if (Number.isInteger(sidebarNum) && sidebarNum >= 220 && sidebarNum <= 560) {
    root.style.setProperty("--sidebar-width", `${sidebarNum}px`);
  }

  if (editorMax && /^\d+(?:\.\d+)?(px|rem|%)$/.test(editorMax)) {
    root.style.setProperty("--editor-max-width", editorMax);
  }
})();

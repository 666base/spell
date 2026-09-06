(() => {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  let stored = null;
  try {
    stored = window.localStorage?.getItem("spell-resolved-theme");
  } catch {
    stored = null;
  }
  const dark =
    stored === "dark" ? true : stored === "light" ? false : prefersDark;

  root.classList.toggle("dark", dark);
  root.dataset.startupTheme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
})();

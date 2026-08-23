(() => {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;

  root.classList.toggle("dark", prefersDark);
  root.dataset.startupTheme = prefersDark ? "dark" : "light";
  root.style.colorScheme = prefersDark ? "dark" : "light";
})();

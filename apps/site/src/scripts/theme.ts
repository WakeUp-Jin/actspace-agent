const STORAGE_KEY = "actspace-site-theme";
const THEME_VALUES = new Set(["system", "light", "dark"]);

function currentTheme(): string {
  const theme = document.documentElement.dataset.theme ?? "system";
  return THEME_VALUES.has(theme) ? theme : "system";
}

export function initThemeControls(): void {
  const controls = document.querySelectorAll<HTMLSelectElement>("[data-theme-control]");

  for (const control of controls) {
    control.value = currentTheme();
    control.addEventListener("change", () => {
      const theme = THEME_VALUES.has(control.value) ? control.value : "system";
      document.documentElement.dataset.theme = theme;

      if (theme === "system") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, theme);
      }

      for (const peer of controls) {
        peer.value = theme;
      }
    });
  }
}

export function initProductShowcase(): void {
  const showcases = document.querySelectorAll<HTMLElement>("[data-product-showcase]");

  for (const showcase of showcases) {
    const tabs = Array.from(showcase.querySelectorAll<HTMLButtonElement>("[data-showcase-tab]"));
    const panels = Array.from(showcase.querySelectorAll<HTMLElement>("[data-showcase-panel]"));

    const select = (id: string) => {
      for (const tab of tabs) {
        const active = tab.dataset.showcaseTab === id;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      }

      for (const panel of panels) {
        panel.dataset.active = String(panel.dataset.showcasePanel === id);
      }
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => select(tab.dataset.showcaseTab ?? ""));
      tab.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const offset = event.key === "ArrowRight" ? 1 : -1;
        const next = tabs[(index + offset + tabs.length) % tabs.length];
        next?.focus();
        select(next?.dataset.showcaseTab ?? "");
      });
    });
  }
}

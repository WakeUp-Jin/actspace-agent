export function initSiteHeader(): void {
  const headers = document.querySelectorAll<HTMLElement>("[data-site-header][data-hero='true']");

  const update = () => {
    for (const header of headers) {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
    }
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
}

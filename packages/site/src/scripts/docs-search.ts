export function initializeDocsSearch(): void {
  document.querySelectorAll<HTMLElement>("[data-docs-sidebar]").forEach((sidebar) => {
    if (sidebar.dataset.searchReady === "true") return;
    sidebar.dataset.searchReady = "true";

    const input = sidebar.querySelector<HTMLInputElement>("[data-docs-search]");
    const status = sidebar.querySelector<HTMLElement>("[data-docs-search-status]");
    if (!input || !status) return;

    input.addEventListener("input", () => {
      const query = input.value.trim().toLocaleLowerCase("zh-CN");
      let visibleCount = 0;

      sidebar.querySelectorAll<HTMLElement>("[data-docs-search-item]").forEach((item) => {
        const match = !query || item.textContent?.toLocaleLowerCase("zh-CN").includes(query);
        item.hidden = !match;
        if (match) visibleCount += 1;
      });

      sidebar.querySelectorAll<HTMLElement>("[data-docs-group]").forEach((group) => {
        group.hidden = !Array.from(group.querySelectorAll<HTMLElement>("[data-docs-search-item]")).some(
          (item) => !item.hidden,
        );
      });

      status.textContent = query ? `找到 ${visibleCount} 篇文档` : "";
    });
  });
}

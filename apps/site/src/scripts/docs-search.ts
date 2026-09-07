export function initializeDocsSearch(): void {
  document.querySelectorAll<HTMLElement>("[data-docs-search-root]").forEach((root) => {
    if (root.dataset.searchReady === "true") return;
    root.dataset.searchReady = "true";

    const input = root.querySelector<HTMLInputElement>("[data-docs-search]");
    const results = root.querySelector<HTMLElement>("[data-docs-search-results]");
    const status = root.querySelector<HTMLElement>("[data-docs-search-status]");
    const empty = root.querySelector<HTMLElement>("[data-docs-search-empty]");
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-docs-search-item]"));
    if (!input || !results || !status || !empty) return;

    const updateResults = () => {
      const query = input.value.trim().toLocaleLowerCase("zh-CN");
      let visibleCount = 0;

      items.forEach((item) => {
        const searchText = item.dataset.searchText?.toLocaleLowerCase("zh-CN") ?? "";
        const match = Boolean(query) && searchText.includes(query);
        item.hidden = !match;
        if (match) visibleCount += 1;
      });

      empty.hidden = !query || visibleCount > 0;
      results.hidden = !query;
      status.textContent = query ? `找到 ${visibleCount} 篇文档` : "";
    };

    input.addEventListener("input", updateResults);
    input.addEventListener("focus", updateResults);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      input.value = "";
      updateResults();
      input.blur();
    });

    root.addEventListener("focusout", (event) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && root.contains(nextTarget)) return;
      results.hidden = true;
    });
  });
}

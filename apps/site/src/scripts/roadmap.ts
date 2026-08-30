type RoadmapStatus = "open" | "completed";

const PAGE_SIZE = 6;

export function initRoadmap(): void {
  const root = document.querySelector<HTMLElement>("[data-roadmap]");
  if (!root) return;

  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-roadmap-tab]"));
  const list = root.querySelector<HTMLElement>("[data-roadmap-list]");
  const items = Array.from(root.querySelectorAll<HTMLElement>(".roadmap-item"));
  const loadWrap = root.querySelector<HTMLElement>("[data-load-wrap]");
  const loadMore = root.querySelector<HTMLButtonElement>("[data-load-more]");
  const loadLabel = root.querySelector<HTMLElement>("[data-load-label]");
  const statusRegion = root.querySelector<HTMLElement>("[data-roadmap-status]");
  if (!list || !loadWrap || !loadMore || !loadLabel || !statusRegion || tabs.length === 0) return;

  const visibleByStatus: Record<RoadmapStatus, number> = {
    open: PAGE_SIZE,
    completed: PAGE_SIZE,
  };
  let activeStatus: RoadmapStatus = "open";

  const render = () => {
    const statusItems = items.filter((item) => item.dataset.status === activeStatus);
    const visibleCount = visibleByStatus[activeStatus];

    for (const item of items) {
      const statusIndex = statusItems.indexOf(item);
      item.hidden = item.dataset.status !== activeStatus || statusIndex >= visibleCount;
    }

    for (const tab of tabs) {
      const selected = tab.dataset.roadmapTab === activeStatus;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) list.setAttribute("aria-labelledby", tab.id);
    }

    const displayed = Math.min(visibleCount, statusItems.length);
    const remaining = Math.max(0, statusItems.length - displayed);
    loadWrap.hidden = remaining === 0;
    loadLabel.textContent = `加载更多 · 还有 ${remaining} 项`;
    statusRegion.textContent = `正在显示${activeStatus === "open" ? "未完成" : "已完成"}项目，共 ${displayed} 项。`;
    list.dataset.roadmapReady = "true";
  };

  const selectTab = (tab: HTMLButtonElement) => {
    const nextStatus = tab.dataset.roadmapTab;
    if (nextStatus !== "open" && nextStatus !== "completed") return;
    activeStatus = nextStatus;
    render();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      let nextIndex: number | undefined;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      if (nextIndex === undefined) return;
      event.preventDefault();
      const nextTab = tabs[nextIndex];
      nextTab.focus();
      selectTab(nextTab);
    });
  });

  loadMore.addEventListener("click", () => {
    visibleByStatus[activeStatus] += PAGE_SIZE;
    render();
  });

  render();
}

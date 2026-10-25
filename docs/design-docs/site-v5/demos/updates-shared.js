// 更新日志抽卡共用：解析真实 feature-release-notes.md（## 月份 / ### 日期 — 标题 / #### 分类 / - 条目），页头、切换条、筛选。
window.UPDATE_VARIANTS = [
  { id: "U1", name: "时间轴", file: "updates-U1-timeline.html" },
  { id: "U2", name: "月份侧栏", file: "updates-U2-months.html" },
  { id: "U3", name: "索引折叠", file: "updates-U3-index.html" },
  { id: "U4", name: "大字日期", file: "updates-U4-numerals.html" },
];
window.TYPES = {
  feature: { label: "新功能", short: "新功能" },
  improvement: { label: "改进", short: "改进" },
  fix: { label: "问题修复", short: "修复" },
};
const TYPE_OF = { "新功能": "feature", "改进": "improvement", "问题修复": "fix" };

window.RELEASES = (function parse(md) {
  const out = []; let month = "", cur = null, sec = null;
  for (const line of md.split("\n")) {
    let m;
    if ((m = line.match(/^## (\d{4}-\d{2})\s*$/))) { month = m[1]; continue; }
    if ((m = line.match(/^### (\d{4}-\d{2}-\d{2})\s+—\s+(.+)$/))) { cur = { month, date: m[1], title: spaceText(m[2].trim()), sections: [] }; out.push(cur); sec = null; continue; }
    if ((m = line.match(/^#### (.+)$/)) && cur) { sec = { type: TYPE_OF[m[1].trim()] || "improvement", items: [] }; cur.sections.push(sec); continue; }
    if ((m = line.match(/^- (.+)$/)) && sec) sec.items.push(inline(m[1]));
  }
  return out;
})(UPD_SRC);
function inline(s) {
  const el = document.createElement("span"); el.innerHTML = marked.parseInline(s);
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement.closest("code") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const nodes = []; while (walk.nextNode()) nodes.push(walk.currentNode);
  nodes.forEach((n) => (n.nodeValue = spaceText(n.nodeValue)));
  return el.innerHTML;
}
window.countOf = (r, t) => r.sections.filter((s) => s.type === t).reduce((n, s) => n + s.items.length, 0);
window.fmtMD = (d) => { const [, m, dd] = d.split("-"); return `${+m}月${+dd}日`; };
window.fmtDot = (d) => d.replaceAll("-", ".");
window.fmtMonth = (m) => { const [y, mm] = m.split("-"); return `${y} 年 ${+mm} 月`; };
window.MONTHS = [...new Set(RELEASES.map((r) => r.month))];

// 筛选：给 body 打 data-filter，各版用 CSS / JS 隐藏不匹配的分组与发布
window.filterBar = (el, onChange) => {
  const opts = [["all", "全部"], ["feature", "新功能"], ["improvement", "改进"], ["fix", "问题修复"]];
  el.innerHTML = opts.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === "all"}">${k === "all" ? "" : `<i class="dot t-${k}"></i>`}${l}</button>`).join("");
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    document.body.dataset.filter = b.dataset.f;
    document.querySelectorAll("[data-release]").forEach((r) => (r.hidden = b.dataset.f !== "all" && !r.querySelector(`[data-type="${b.dataset.f}"]`)));
    onChange?.(b.dataset.f);
  });
};

window.bootUpd = function (current) {
  document.querySelectorAll("[data-header]").forEach((el) => { renderHeader(el); el.querySelectorAll(".sh-nav a").forEach((a) => a.toggleAttribute("aria-current", a.textContent === "更新日志")); });
  const bar = document.createElement("div"); bar.className = "demo-switcher";
  bar.innerHTML = `<span>更新日志 · 第一轮</span>${UPDATE_VARIANTS.map((v) => `<a href="${v.file}"${v.id === current ? ' aria-current="true"' : ""}><b>${v.id}</b>${v.name}</a>`).join("")}`;
  document.body.append(bar);
};

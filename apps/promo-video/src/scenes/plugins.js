import { at, chrome, lines, markUrl } from "./shared.js";

// 与官网首屏演示里的十个插件一一对应。
const groups = [
  { name: "工具", note: "它能做什么", items: ["读取文件", "编辑", "终端", "Browser Use"] },
  { name: "上下文", note: "它看到什么", items: ["渐进披露", "压缩", "上下文面板"] },
  { name: "行为", note: "它怎么做事", items: ["Skills", "审批策略", "子 Agent"] },
];

const racks = groups
  .map(({ name, note, items }, row) => {
    const start = 1.5 + row * 0.75;
    const chips = items
      .map((item, index) => `<span class="plug pop" style="${at(start + 0.25 + index * 0.12)}"><i></i>${item}</span>`)
      .join("");
    return `
      <div class="rack rise" style="${at(start)}">
        <div class="rack-name"><b>${name}</b><span>${note}</span></div>
        <div class="rack-slots">${chips}</div>
      </div>`;
  })
  .join("");

export const plugins = {
  id: "plugins",
  duration: 8.4,
  enter: 0.7,
  html: `
    <div class="grain"></div>
    ${chrome("02", "核心特点")}
    <div class="plugins">
      <div class="plugins-copy">
        <p class="eyebrow rise" style="${at(0.2)}"><i></i>它为什么能变</p>
        <h2 class="display-m">${lines(["一切，", "皆插件"], 0.3)}</h2>
        <p class="lead rise" style="${at(0.7)}">工具、上下文和行为，都是可以装卸的插件包。换一组插件，就是另一个 Agent。</p>
      </div>
      <div class="harness">
        <div class="harness-core pop" style="${at(0.9)}">
          <img src="${markUrl}" alt="">
          <b>模型</b>
          <span>运行在 Harness 里</span>
        </div>
        <svg class="harness-wires" viewBox="0 0 130 590" preserveAspectRatio="none" aria-hidden="true">
          <path class="wire" style="${at(1.45)}" d="M0 295 C 70 295, 60 93, 130 93" pathLength="1"/>
          <path class="wire" style="${at(2.2)}" d="M0 295 L 130 295" pathLength="1"/>
          <path class="wire" style="${at(2.95)}" d="M0 295 C 70 295, 60 497, 130 497" pathLength="1"/>
        </svg>
        <div class="racks">${racks}</div>
      </div>
      <div class="local rise" style="${at(4.6)}">
        <b>本地优先</b>
        <span>会话与轨迹，写在你自己的磁盘上</span>
        <code>sessions-v2/&lt;sessionId&gt;/journal.jsonl</code>
      </div>
    </div>`,
};

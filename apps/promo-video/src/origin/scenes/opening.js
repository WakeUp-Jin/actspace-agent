import { totals } from "../data.js";
import { at, lines, markUrl, timing } from "../shared.js";

const cold = timing("cold");
const title = timing("title");

// 右边的方格：每格 1 万行。写下约 86 万行、删掉约 41 万行，所以 86 格里有 41 格后来被划掉。
const WRITTEN_CELLS = Math.round(totals.added / 10_000);
const DELETED_CELLS = Math.round(totals.deleted / 10_000);
// 7 和 86 互质，index * 7 % 86 把 0–85 打散成另一种顺序：被划掉的格子散在各处，而不是整整齐齐的最后几行。
const shuffled = (index) => (index * 7) % WRITTEN_CELLS;

const cells = Array.from({ length: WRITTEN_CELLS }, (_, index) => {
  const gone = shuffled(index) < DELETED_CELLS;
  const leave = gone ? `--gone:${(cold.beat(1, 0.25) + shuffled(index) * 0.028).toFixed(2)}s;` : "";
  return `<i class="o-cell${gone ? " is-gone" : ""}" style="${at((cold.beat(0, 0.1) + index * 0.014).toFixed(2))}${leave}"></i>`;
}).join("");

const tally = (sign, verb, value, slot) => `
  <p class="o-cold-row rise" style="${at(cold.beat(slot))}">
    <i class="o-cold-sign is-${sign}"></i>${verb}
    <b data-count="0@${cold.beat(slot)} ${value}@${cold.beat(slot, 1.5)}" data-group></b>行
  </p>`;

/** 冷开场：不放片名，先给两个数和一句话，最后才说这是什么。 */
export const coldOpen = {
  id: "cold",
  duration: cold.duration,
  html: `
    <div class="grain"></div>
    <div class="o-cold">
      ${tally("plus", "写下", totals.added, 0)}
      ${tally("minus", "删掉", totals.deleted, 1)}
      <h1 class="o-cold-punch">${lines(["差不多每写两行，", "就<em>删掉一行</em>。"], cold.beat(2), { step: 0.18 })}</h1>
      <p class="o-cold-what">${lines([`这是 ActSpace 的头 ${totals.days} 天。`], cold.beat(3))}</p>
    </div>
    <div class="o-cells">${cells}</div>
    <p class="o-cells-legend">
      <span class="fade" style="${at(cold.beat(0, 0.5))}"><i></i>每格 1 万行</span>
      <span class="fade" style="${at(cold.beat(1, 0.5))}"><i class="is-gone"></i>后来删掉的</span>
    </p>
    <p class="o-foot fade" style="${at(cold.beat(0, 0.8))}">按 git 提交历史累计 · 代码、测试、文档都算 · 不算锁文件、图片和生成物</p>`,
};

export const titleCard = {
  id: "title",
  duration: title.duration,
  enter: 0.9,
  transition: "iris",
  html: `
    <div class="stage stage-peach stage-full"></div>
    <div class="o-title">
      <img class="o-title-mark pop" style="${at(0.3)}" src="${markUrl}" alt="">
      <p class="o-title-dates rise" style="${at(0.45)}">2026-05-21<i></i>2026-11-12</p>
      <h1 class="o-title-word">${lines(["ActSpace 诞生记"], 0.55)}</h1>
      <p class="o-title-sub">${lines([`一个开发者，和一群 Agent 的 ${totals.days} 天。`], title.beat(1))}</p>
      <p class="o-title-foot fade" style="${at(title.beat(1, 0.9))}">根据仓库里的 ${totals.records} 篇开发记录和 git 提交历史整理</p>
    </div>`,
};

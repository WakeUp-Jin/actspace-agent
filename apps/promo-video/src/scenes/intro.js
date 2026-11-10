import { at, lines, markUrl } from "./shared.js";

// 图形隐喻：形状各异的「问题」，先被一个大框笼统罩住，再各自得到一块合身的「空间」。
export const problems = [
  { shape: "circle", tile: "peach", radius: 84, word: "写代码" },
  { shape: "square", tile: "mint", radius: 30, word: "查资料" },
  { shape: "triangle", tile: "lemon", radius: 52, word: "跑测试" },
  { shape: "ring", tile: "slate", radius: 84, word: "改文档" },
  { shape: "bars", tile: "violet", radius: 26, word: "做报表" },
  { shape: "diamond", tile: "peach-soft", radius: 64, word: "盯任务" },
];

/** 一排问题：形状在 glyphAt 依次出现，色块（各自的空间）从 spaceAt 起每隔 step 秒弹出一个。 */
export function problemRow({ glyphAt, spaceAt, step }) {
  return problems
    .map(
      ({ shape, tile, radius }, index) => `
      <div class="problem">
        <i class="problem-space tile-${tile}" style="border-radius:${radius}px;${at(spaceAt + index * step)}"></i>
        <i class="problem-glyph glyph-${shape}" style="${at(glyphAt + index * 0.07)}--ink-at:${spaceAt + index * step}s;"></i>
      </div>`,
    )
    .join("");
}

// 第二句话落在第 3 秒，色块按八分音符一个个弹出来。
const TURN = 3;

export const hook = {
  id: "hook",
  duration: 6,
  music: 0,
  html: `
    <div class="stage stage-night hook">
      <div class="hook-lines">
        <h1 class="hook-line">${lines(["不存在一个能解决", "所有问题的 Agent。"], 0.3, { out: 2.55 })}</h1>
        <h1 class="hook-line">${lines(["每个问题，", "都有它的<em>空间</em>。"], TURN)}</h1>
      </div>
      <div class="hook-row">
        <div class="hook-catchall fade" style="${at(1.3, 2.6)}"><span>一个 Agent · 所有问题</span></div>
        ${problemRow({ glyphAt: 0.8, spaceAt: TURN, step: 0.25 })}
      </div>
    </div>`,
};

export const brand = {
  id: "brand",
  duration: 4,
  enter: 0.7,
  transition: "iris",
  music: 1,
  html: `
    <div class="stage stage-peach brand">
      <img class="brand-mark pop" style="${at(0.3)}" src="${markUrl}" alt="">
      <div class="brand-word">${lines(["ActSpace"], 0.4)}</div>
      <p class="brand-tagline">${lines(["会自我进化的 Agent 运行空间"], 1)}</p>
      <ul class="brand-chips">
        <li class="rise" style="${at(1.5)}">本地优先</li>
        <li class="rise" style="${at(1.62)}">开源</li>
        <li class="rise" style="${at(1.74)}">一切皆插件</li>
      </ul>
    </div>`,
};

import { beats } from "../soundtrack.js";
import { at, lines, markUrl } from "./shared.js";

// 开场的图形隐喻：形状各异的「问题」，先被一个大框笼统罩住，再各自得到一块合身的「空间」。
const problems = [
  { shape: "circle", x: 96, y: 72, tile: "peach", w: 208, h: 208, r: 104 },
  { shape: "square", x: 420, y: 40, tile: "mint", w: 236, h: 196, r: 30 },
  { shape: "triangle", x: 248, y: 300, tile: "lemon", w: 228, h: 220, r: 48 },
  { shape: "ring", x: 560, y: 318, tile: "slate", w: 196, h: 196, r: 98 },
  { shape: "bars", x: 60, y: 520, tile: "violet", w: 252, h: 172, r: 26 },
  { shape: "diamond", x: 452, y: 566, tile: "peach-soft", w: 200, h: 200, r: 64 },
];

// 第二句话落在第 7 拍上，六块空间跟着弹出来。
const TURN = beats(6);

const problemField = problems
  .map(
    ({ shape, x, y, tile, w, h, r }, index) => `
      <div class="problem" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;">
        <i class="problem-space tile-${tile}" style="border-radius:${r}px;${at(TURN + 0.05 + index * 0.11)}"></i>
        <i class="problem-glyph glyph-${shape}" style="${at(0.9 + index * 0.09)}"></i>
      </div>`,
  )
  .join("");

export const hook = {
  id: "hook",
  duration: beats(12),
  html: `
    <div class="grain"></div>
    <div class="hook-copy">
      <p class="eyebrow rise" style="${at(0.3)}"><i></i>唯变所适</p>
      <h1 class="display hook-line">${lines(["不存在一个能解决", "所有问题的 Agent。"], 0.6, { out: TURN - 0.7 })}</h1>
      <h1 class="display hook-line">${lines(["每一个问题，", "都有它的<em>空间</em>。"], TURN)}</h1>
    </div>
    <div class="hook-field">
      <div class="hook-catchall fade" style="${at(1.5, TURN - 0.6)}"><span>一个 Agent · 所有问题</span></div>
      ${problemField}
    </div>`,
};

export const brand = {
  id: "brand",
  duration: beats(8),
  enter: 0.9,
  transition: "iris",
  html: `
    <div class="stage stage-peach stage-full"></div>
    <div class="brand">
      <img class="brand-mark pop" style="${at(0.35)}" src="${markUrl}" alt="">
      <div class="brand-word">${lines(["ActSpace"], 0.55)}</div>
      <div class="brand-formula">
        <span class="token rise" style="${at(1.3)}">Act</span>
        <span class="op rise" style="${at(1.45)}">+</span>
        <span class="token rise" style="${at(1.6)}">Space</span>
        <span class="op rise" style="${at(1.8)}">=</span>
        <span class="token token-accent rise" style="${at(1.95)}">运行空间</span>
      </div>
      <p class="brand-tagline">${lines(["会自我进化的 Agent 运行空间"], 2.5)}</p>
      <p class="brand-sub rise" style="${at(3)}">本地优先的 Agent 桌面应用<i></i>从 Coding Agent 开始</p>
    </div>`,
};

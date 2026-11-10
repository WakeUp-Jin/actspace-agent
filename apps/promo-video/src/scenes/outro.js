import spaceUrl from "@site-assets/screenshots/home/space.png";
import { at, chrome, lines, markUrl } from "./shared.js";

// 状态与官网首页「方向」一致：只有上下文管理引擎标「已上线」，其余如实标「进行中」。
const directions = [
  { status: "live", label: "已上线", name: "上下文管理引擎", note: "结构化压缩、渐进披露、上下文面板" },
  { status: "wip", label: "进行中", name: "Harness 自进化", note: "现在：在会话里让 Agent 新增或修改工具" },
  { status: "wip", label: "进行中", name: "Actor 与 Space", note: "现在：前端演示，数据为模拟" },
];

const directionList = directions
  .map(
    ({ status, label, name, note }, index) => `
      <li class="direction rise" style="${at(1.5 + index * 0.35)}">
        <em class="status status-${status}">${label}</em>
        <b>${name}</b>
        <span>${note}</span>
      </li>`,
  )
  .join("");

export const next = {
  id: "next",
  duration: 7.6,
  enter: 0.7,
  shots: {
    space: {
      size: [3180, 2400],
      keys: [
        { at: 0, rect: [0, 0, 1, 0.74], pad: 0 },
        { at: 2.6, move: 3.6, rect: [0, 0.03, 0.86, 0.66], pad: 0 },
      ],
    },
  },
  html: `
    <div class="grain"></div>
    ${chrome("04", "接下来")}
    <div class="next">
      <div class="next-copy">
        <p class="eyebrow rise" style="${at(0.2)}"><i></i>它还在长</p>
        <h2 class="display-s">${lines(["从一个 Agent，", "到一群 Actor"], 0.3)}</h2>
        <p class="lead rise" style="${at(0.8)}">在不同场景里长成专业的 Actor，在 Space 里一起解决问题。</p>
        <ol class="directions">${directionList}</ol>
      </div>
      <div class="stage stage-slate next-stage rise" style="${at(0.5)}">
        <span class="demo-note fade" style="${at(1.4)}">Space 开发中演示 · 数据为模拟</span>
        <div class="cam" data-cam="space">
          <div class="cam-layer"><img src="${spaceUrl}" alt=""></div>
        </div>
      </div>
    </div>`,
};

export const closing = {
  id: "closing",
  duration: 9,
  enter: 0.9,
  html: `
    <div class="stage stage-peach stage-full"></div>
    <div class="closing">
      <img class="closing-mark pop" style="${at(0.7)}" src="${markUrl}" alt="">
      <h1 class="display closing-line">${lines(["给下一个问题，", "一个<em>空间</em>。"], 1.1, { step: 0.2 })}</h1>
      <div class="closing-links">
        <p class="rise" style="${at(2.6)}"><span>开源</span><b>github.com/WakeUp-Jin/actspace-agent</b></p>
        <p class="rise" style="${at(2.85)}"><span>官网</span><b>actspace.top</b></p>
      </div>
      <p class="closing-foot fade" style="${at(3.5)}">ActSpace<i></i>本地优先的 Agent 运行空间<i></i>Apache-2.0</p>
    </div>`,
};

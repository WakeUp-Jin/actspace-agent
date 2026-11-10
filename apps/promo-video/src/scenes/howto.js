import modelUrl from "@site-assets/screenshots/docs/model-connection.png";
import workspaceUrl from "@site-assets/screenshots/docs/workspace-overview.png";
import { at, chrome, focusBox, lines, span } from "./shared.js";

// 三步各占一段时间；左边的步骤条和右边的画面按同一组时刻切换。
const STEPS = [
  { from: 0.9, until: 5.9 },
  { from: 5.9, until: 10 },
  { from: 10, until: 14.4 },
];

const commands = [
  "git clone https://github.com/WakeUp-Jin/actspace-agent.git",
  "cd actspace-agent",
  "pnpm install",
  "pnpm dev:log",
];

// 每条命令敲完再停一拍，下一条才开始。
const TYPING_SPEED = 60;
let typingClock = STEPS[0].from + 0.5;
const terminalLines = commands
  .map((command) => {
    const start = typingClock;
    typingClock += command.length / TYPING_SPEED + 0.32;
    return `<p class="term-line fade" style="${at(start - 0.05)}"><i>$</i><span data-type="${command}" data-at="${start.toFixed(2)}" data-cps="${TYPING_SPEED}"></span></p>`;
  })
  .join("");

const copy = [
  { title: "拉下来，跑起来", note: "目前从源码运行：克隆仓库，装依赖，一条命令启动桌面端。" },
  { title: "连上你的模型", note: "设置 › 模型 里添加连接，填入自己的 API Key。" },
  { title: "选个文件夹，说出任务", note: "它读代码、调工具；你审批命令、检查改动。" },
];

const rail = copy
  .map(
    ({ title, note }, index) => `
      <li class="how-step rise" style="${at(0.35 + index * 0.12)}${span(STEPS[index].from, STEPS[index].until)}">
        <i>0${index + 1}</i>
        <div><b>${title}</b><span>${note}</span></div>
      </li>`,
  )
  .join("");

const panel = (index) => at(STEPS[index].from, index === STEPS.length - 1 ? undefined : STEPS[index].until - 0.35);

export const howto = {
  id: "howto",
  duration: STEPS.at(-1).until + 0.4,
  enter: 0.7,
  shots: {
    model: {
      size: [1722, 1026],
      keys: [
        { at: 0, rect: [0, 0, 1, 1], pad: 0 },
        { at: STEPS[1].from + 1.5, move: 1.1, rect: [0.025, 0.59, 0.62, 0.39], pad: 0.02 },
      ],
    },
    workspace: {
      size: [2880, 1800],
      keys: [
        { at: 0, rect: [0, 0, 1, 1], pad: 0 },
        { at: STEPS[2].from + 0.9, move: 1.2, rect: [0.2, 0.36, 0.76, 0.64], pad: 0 },
      ],
    },
  },
  html: `
    <div class="grain"></div>
    ${chrome("03", "怎么用")}
    <div class="how">
      <div class="how-copy">
        <p class="eyebrow rise" style="${at(0.15)}"><i></i>三步开始</p>
        <h2 class="display-s">${lines(["从零到第一个任务"], 0.25)}</h2>
        <ol class="how-rail">${rail}</ol>
      </div>
      <div class="how-visual">
        <div class="how-panel rise" style="${panel(0)}">
          <div class="stage stage-slate how-stage">
            <div class="term">
              <div class="term-bar"><i></i><i></i><i></i><span>终端</span></div>
              <div class="term-body">
                ${terminalLines}
                <p class="term-out fade" style="${at(typingClock + 0.1)}">ActSpace 桌面端已启动</p>
              </div>
            </div>
          </div>
        </div>
        <div class="how-panel rise" style="${panel(1)}">
          <div class="stage stage-mint how-stage">
            <div class="cam" data-cam="model">
              <div class="cam-layer"><img src="${modelUrl}" alt="">${focusBox([0.855, 0.185, 0.125, 0.09], STEPS[1].from + 0.6, STEPS[1].from + 1.6)}</div>
            </div>
          </div>
        </div>
        <div class="how-panel rise" style="${panel(2)}">
          <div class="stage stage-peach how-stage">
            <div class="cam" data-cam="workspace">
              <div class="cam-layer"><img src="${workspaceUrl}" alt="">${focusBox([0.283, 0.872, 0.615, 0.075], STEPS[2].from + 2.2, STEPS[2].until - 0.4)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>`,
};

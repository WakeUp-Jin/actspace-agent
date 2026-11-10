import { at, icons, lines, markUrl } from "./shared.js";

// 命令和步骤都来自仓库 README 的「快速开始」，不写仓库里没有的安装方式。
const COMMANDS = [
  { text: "git clone https://github.com/WakeUp-Jin/actspace-agent.git", at: 0.8, cps: 70 },
  { text: "cd actspace-agent && pnpm install", at: 1.9, cps: 60 },
  { text: "pnpm dev:log", at: 2.7, cps: 40 },
];

const STEPS = [
  { icon: icons.terminal, title: "克隆，启动", note: "三条命令，桌面端就开了" },
  { icon: icons.key, title: "连上你的模型", note: "在设置里填自己的模型连接" },
  { icon: icons.folder, title: "选文件夹，说任务", note: "Agent 就在这个工作区里干活" },
];

/** 怎么用：三条命令加三步。 */
export const start = {
  id: "start",
  duration: 6,
  enter: 0.6,
  transition: "lift",
  music: 2,
  html: `
    <div class="stage stage-paper start">
      <div class="start-copy">
        <p class="tag rise" style="${at(0.3)}"><b>开源</b>本地优先</p>
        <h2 class="start-title">${lines(["三步，", "跑起来。"], 0.35)}</h2>
      </div>
      <div class="start-main">
        <div class="terminal pop" style="${at(0.5)}">
          <div class="terminal-bar"><i></i><i></i><i></i><span class="mono">终端</span></div>
          <ol class="terminal-lines mono">
            ${COMMANDS.map((command) => `<li class="fade" style="${at(command.at - 0.15)}"><em>$</em><span data-type="${command.text}" data-at="${command.at}" data-cps="${command.cps}"></span></li>`).join("")}
          </ol>
        </div>
        <ol class="start-steps">
          ${STEPS.map(
            (step, index) => `
            <li class="start-step rise" style="${at(3.3 + index * 0.3)}">
              <span class="start-step-no mono">${index + 1}</span>
              <span class="start-step-icon">${step.icon}</span>
              <b>${step.title}</b>
              <span class="start-step-note">${step.note}</span>
            </li>`,
          ).join("")}
        </ol>
      </div>
    </div>
  `,
};

const FOOT = ["会自我进化的 Agent 运行空间", "本地优先", "Apache-2.0"];

/** 收尾：标志、一句话、去哪里找。每个版本换自己的那句话和页脚。 */
export function closing({ line, duration = 6, foot = FOOT }) {
  return {
    id: "closing",
    duration,
    enter: 0.8,
    transition: "iris",
    music: 1,
    html: `
      <div class="stage stage-peach closing">
        <div class="closing-brand">
          <img class="closing-mark pop" style="${at(0.5)}" src="${markUrl}" alt="">
          <span class="closing-word rise" style="${at(0.65)}">ActSpace</span>
        </div>
        <h1 class="closing-line">${lines(line, 0.9, { step: 0.14 })}</h1>
        <div class="closing-links">
          <p class="rise" style="${at(1.7)}"><span>开源</span><b class="mono">github.com/WakeUp-Jin/actspace-agent</b></p>
          <p class="rise" style="${at(1.9)}"><span>官网</span><b class="mono">actspace.top</b></p>
        </div>
        <p class="closing-foot fade" style="${at(2.5)}">${foot.join("<i></i>")}</p>
      </div>
    `,
  };
}

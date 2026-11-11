import { beats } from "../soundtrack.js";
import { at, chrome, icons, lines } from "./shared.js";

// 命令和步骤都来自仓库 README 的「快速开始」，不写仓库里没有的安装方式。
const COMMANDS = [
  { text: "git clone https://github.com/WakeUp-Jin/actspace-agent.git", at: 0.9, cps: 70 },
  { text: "cd actspace-agent && pnpm install", at: 2.05, cps: 60 },
  { text: "pnpm dev:log", at: 2.9, cps: 40 },
];

// 配乐的鼓在本分镜第 6 拍回来：桌面端在那一拍启动，三步跟着亮出来。
const STARTED_AT = beats(6);

const STEPS = [
  { icon: icons.terminal, title: "拉下来，跑起来", note: "三条命令，启动桌面端" },
  { icon: icons.key, title: "连上你的模型", note: "设置里填自己的 API Key" },
  { icon: icons.folder, title: "选文件夹，说任务", note: "它干活，你审批和检查" },
];

export const howto = {
  id: "howto",
  duration: beats(12),
  enter: 0.7,
  html: `
    <div class="grain"></div>
    ${chrome("03", "怎么用")}
    <div class="feature-copy">
      <p class="eyebrow rise" style="${at(0.15)}"><i></i>三步开始</p>
      <h2 class="display-m">${lines(["从零到", "第一个任务"], 0.25)}</h2>
      <p class="lead rise" style="${at(0.55)}">目前从源码运行，<br>模型用你自己的连接和 Key。</p>
    </div>
    <div class="stage stage-slate feature-stage">
      <div class="stage-body">
        <div class="term pop" style="${at(0.45)}">
          <div class="term-bar"><i></i><i></i><i></i><span>终端</span></div>
          <div class="term-body">
            ${COMMANDS.map((command) => `<p class="term-line fade" style="${at(command.at - 0.1)}"><i>$</i><span data-type="${command.text}" data-at="${command.at}" data-cps="${command.cps}"></span></p>`).join("")}
            <p class="term-out fade" style="${at(STARTED_AT)}">ActSpace 桌面端已启动</p>
          </div>
        </div>
        <ol class="start-steps">
          ${STEPS.map(
            ({ icon, title, note }, index) => `
            <li class="start-step rise" style="${at(STARTED_AT + 0.35 + index * 0.25)}">
              <span class="start-step-no mono">0${index + 1}</span>
              <i class="start-step-icon">${icon}</i>
              <b>${title}</b>
              <span class="start-step-note">${note}</span>
            </li>`,
          ).join("")}
        </ol>
      </div>
    </div>`,
};

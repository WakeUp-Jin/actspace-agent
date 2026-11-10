import { at, icons, lines } from "./shared.js";

// 「动效图形」版里的一次任务：界面按视频的尺寸重画，一步占一拍。任务和「真实界面」版是同一句。
const TASK = "把登录页的表单校验补完，跑一下测试。";
const TYPE_AT = 0.7;
const TYPE_SPEED = 14;
const SENT_AT = Number((TYPE_AT + TASK.length / TYPE_SPEED + 0.15).toFixed(2));
const FIRST_STEP = 2.5;
const BEAT = 0.5;

const steps = [
  { icon: "file", verb: "读代码", target: "src/pages/Login.tsx", code: true },
  { icon: "spark", verb: "加载 Skill", target: "表单校验约定" },
  { icon: "agents", verb: "派出子 Agent", target: "查找可复用的校验函数" },
  { icon: "pencil", verb: "修改文件", target: "src/lib/validate.ts", code: true, diff: true },
];

const stepList = steps
  .map(({ icon, verb, target, code, diff }, index) => {
    const start = FIRST_STEP + index * BEAT;
    return `
      <li class="step rise" style="${at(start)}">
        <span class="step-icon">${icons[icon]}</span>
        <b>${verb}</b>
        <span class="step-target${code ? " mono" : ""}">${target}</span>
        ${diff ? '<span class="step-diff mono"><i class="plus">+24</i><i class="minus">−3</i></span>' : ""}
        <i class="step-check pop" style="${at(start + 0.35)}">${icons.check}</i>
      </li>`;
  })
  .join("");

export const demo = {
  id: "demo",
  duration: 6,
  enter: 0.5,
  transition: "lift",
  music: 2,
  html: `
    <div class="stage stage-paper demo">
      <h2 class="demo-title">${lines(["说一句话，<em>它来动手</em>。"], 0.25)}</h2>
      <div class="composer card pop" style="${at(0.45)}">
        <i class="composer-plus">${icons.plus}</i>
        <span class="composer-text" data-type="${TASK}" data-at="${TYPE_AT}" data-cps="${TYPE_SPEED}"></span>
        <span class="composer-model mono">deepseek-flash</span>
        <i class="composer-send press" style="${at(SENT_AT)}">${icons.arrowUp}</i>
      </div>
      <ol class="steps">${stepList}</ol>
    </div>`,
};

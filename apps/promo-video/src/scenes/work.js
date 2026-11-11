import { beats } from "../soundtrack.js";
import { at, chrome, icons, lines } from "./shared.js";

// 「是什么」：一句话交代任务，右边按视频尺寸重画的界面把它做完。
// 不放录屏和整幅截图——缩进视频里字太小，看不清它在做什么。
const TASK = "把登录页的表单校验补完，跑一下测试。";
const TYPE_AT = 0.8;
const TYPE_SPEED = 17;
const SEND_AT = TYPE_AT + TASK.length / TYPE_SPEED + 0.25;

const STEPS = [
  { icon: icons.file, name: "读代码", target: "src/pages/Login.tsx" },
  { icon: icons.spark, name: "加载 Skill", target: "表单校验约定" },
  { icon: icons.agents, name: "派出子 Agent", target: "查找可复用的校验函数" },
  { icon: icons.pencil, name: "修改文件", target: "src/lib/validate.ts", diff: ["+9", "−0"] },
];
const FIRST_STEP = SEND_AT + 0.4;
const STEP_GAP = 0.62;
const DONE_AT = FIRST_STEP + STEPS.length * STEP_GAP + 0.1;

const stepRows = STEPS.map(({ icon, name, target, diff }, index) => {
  const start = FIRST_STEP + index * STEP_GAP;
  return `
    <li class="step rise" style="${at(start)}">
      <i class="step-icon">${icon}</i>
      <b>${name}</b>
      <span class="step-target${/[a-z]/.test(target) ? " mono" : ""}">${target}</span>
      ${diff ? `<span class="diff mono"><em class="plus">${diff[0]}</em><em class="minus">${diff[1]}</em></span>` : ""}
      <i class="step-check pop" style="${at(start + 0.42)}">${icons.check}</i>
    </li>`;
}).join("");

export const work = {
  id: "work",
  duration: beats(10),
  enter: 0.8,
  html: `
    <div class="grain"></div>
    ${chrome("01", "是什么")}
    <div class="feature-copy">
      <p class="eyebrow rise" style="${at(0.15)}"><i></i>一次任务</p>
      <h2 class="display-m">${lines(["说出任务，", "看它做完"], 0.25)}</h2>
      <p class="lead rise" style="${at(0.55)}">在你的本地项目里读代码、调工具，<br>交付可以审阅的改动。</p>
    </div>
    <div class="stage stage-peach feature-stage">
      <div class="stage-body">
        <div class="composer card pop" style="${at(0.45)}">
          <i class="composer-plus">${icons.plus}</i>
          <span class="composer-text" data-type="${TASK}" data-at="${TYPE_AT}" data-cps="${TYPE_SPEED}"></span>
          <i class="composer-send press" style="${at(SEND_AT)}">${icons.arrowUp}</i>
        </div>
        <ol class="steps">${stepRows}</ol>
        <p class="done card pop" style="${at(DONE_AT)}">
          <i>${icons.check}</i><b>18 个测试全部通过</b><span>已编辑 3 个文件</span>
          <span class="diff mono"><em class="plus">+23</em><em class="minus">−1</em></span>
        </p>
      </div>
    </div>`,
};

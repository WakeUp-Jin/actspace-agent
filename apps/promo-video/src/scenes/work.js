import { at, lines, span } from "./shared.js";

// 录好的首屏演示在分镜开始后多久起播，以及播放倍速。
const FOOTAGE_AT = 1;
const FOOTAGE_RATE = 1.12;
const FOOTAGE_SECONDS = 18;

/** 演示里的时刻（秒）换算成分镜里的时刻。 */
const cue = (seconds) => Number((FOOTAGE_AT + seconds / FOOTAGE_RATE).toFixed(2));

// 右侧旁白跟着演示走：每一条在对应的界面变化出现时亮起。
const steps = [
  { from: 0.45, title: "一句话交代任务", note: "不用拆步骤，说清要什么" },
  { from: 1.9, title: "读代码，加载 Skill", note: "只把用得上的放进上下文" },
  { from: 4.4, title: "派出子 Agent", note: "检索交给它，主会话只收结论" },
  { from: 8.7, title: "跑命令前先问你", note: "你点了运行，它才执行" },
  { from: 12.5, title: "上下文自动压缩", note: "任务再长也装得下" },
  { from: 15, title: "交付改动与用量", note: "改了什么、花了多少，列清楚" },
];

const stepList = steps
  .map(({ from, title, note }, index) => {
    const until = steps[index + 1]?.from ?? FOOTAGE_SECONDS + 4;
    return `
      <li class="work-step rise" style="${at(cue(from))}${span(cue(from), cue(until))}">
        <b>${title}</b><span>${note}</span>
      </li>`;
  })
  .join("");

export const work = {
  id: "work",
  duration: Number((FOOTAGE_AT + FOOTAGE_SECONDS / FOOTAGE_RATE + 1.7).toFixed(2)),
  enter: 1,
  html: `
    <div class="work-footage" data-seq-frame>
      <img data-seq="hero" data-at="${FOOTAGE_AT}" data-rate="${FOOTAGE_RATE}" alt="">
      <p class="work-missing">还没有录制首屏演示。先运行 <code>pnpm --filter @actspace/promo-video capture:hero</code></p>
    </div>
    <aside class="work-title">
      <p class="eyebrow rise" style="${at(0.9)}"><b>01</b><i></i>是什么</p>
      <h2 class="display-s">${lines(["说出任务，", "看它做完。"], 1.1)}</h2>
      <p class="work-lead rise" style="${at(1.6)}">ActSpace 在你的本地项目里读代码、调工具，交付可以审阅的改动。</p>
      <p class="work-hint rise" style="${at(3.2)}">四周的每个开关，都是一个插件。<br>用到哪个，哪个亮起。</p>
    </aside>
    <ol class="work-steps">${stepList}</ol>`,
};

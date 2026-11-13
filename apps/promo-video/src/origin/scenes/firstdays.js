import { at, axis, chapter, journey, lines, timing } from "../shared.js";

const night = timing("night");
const first = timing("first");

// 第一夜的流水账：[时刻, 发生了什么, 落在第几个和弦, 到这时累计多少条开发记录]。时刻和内容都来自 docs/histories/2026-05/。
// 02:33 那句引号里的话摘自当条记录的 User Query，原句后面还有半句，所以用省略号收尾。
const log = [
  ["14:21", "第一条开发记录，是修一个 bug。", 0, 1],
  ["15:00", "界面设计，一份一份写下来。", 0.5, 2],
  ["18:58", "第一次提交：125 个文件，没有一行产品代码。", 1, 16],
  ["22:15", "开始搭工程骨架。", 2, 21],
  ["23:56", "打通第一条本地对话链路。", 3, 24],
  ["01:33", "应用启动失败。", 4, 29],
  ["02:33", "还是起不来。「不要只打补丁……」", 4.5, 30],
  ["02:40", "窗口终于弹出来了——一片空白。", 5, 31],
].map(([time, text, slot, records]) => ({ time, text, records, start: night.beat(slot, slot === 0 ? 0.25 : 0) }));

const next = (index) => log[index + 1]?.start;

const logRows = log
  .map(({ time, text, start }, index) => {
    const dim = next(index) === undefined ? "" : `--dim:${next(index)}s;`;
    return `<li class="o-log-row" style="${at(start)}${dim}"><time>${time}</time><span>${text}</span></li>`;
  })
  .join("");

// 钟面上的数字先淡出再换下一个，两个时刻不叠在一起。
const clock = log
  .map(({ time, start }, index) => `<span style="${at(start, next(index) === undefined ? undefined : (next(index) - 0.2).toFixed(3))}">${time}</span>`)
  .join("");
// 条数只在每一行落下的那一下滚到位，其余时间不动：钟面上是几点，旁边就是那一刻的条数。
const ROLL = 0.6;
const recordKeys = log
  .flatMap(({ records, start }, index) => [`${log[index - 1]?.records ?? 0}@${start}`, `${records}@${(start + ROLL).toFixed(3)}`])
  .join(" ");

const SKELETON = log[3].start;
const FAILED = log[5].start;
const WINDOW = log[7].start;

// 过了零点是第 2 天。
const nightTrip = journey("night", [[0, 1], [FAILED - 0.2, 1], [FAILED + 0.2, 2], [night.duration, 2]]);

export const firstNight = {
  id: "night",
  duration: night.duration,
  enter: 0.7,
  html: `
    ${chapter("01", "第一夜", { dark: true })}
    <div class="o-night">
      <p class="eyebrow rise" style="${at(0.15)}"><b>2026-05-21</b><i></i>从下午，到第二天凌晨</p>
      <ol class="o-log">${logRows}</ol>
    </div>
    <div class="o-night-side">
      <p class="o-clock">${clock}</p>
      <p class="o-records fade" style="${at(log[0].start)}">开发记录<b data-count="${recordKeys}"></b>条</p>
      <div class="o-frame">
        <p class="o-frame-ghost fade" style="${at(SKELETON, FAILED)}">桌面窗口 · 还没有画面</p>
        <p class="o-frame-ghost is-failed fade" style="${at(FAILED, WINDOW)}">启动失败</p>
        <div class="o-window o-frame-window pop" style="${at(WINDOW)}">
          <p class="o-window-bar"><i></i><i></i><i></i></p>
        </div>
      </div>
    </div>
    ${axis(nightTrip)}`,
};

const firstTrip = journey("first", [[0, 3]]);

// 回复用灰条代替文字：开发记录里只写了「流式返回一段固定的探测文本」，没有留下原文，不编。
const reply = [86, 94, 72, 48]
  .map((width, index) => `<i class="o-stream-bar" style="width:${width}%;${at((0.5 + index * 0.75).toFixed(2))}"></i>`)
  .join("");

export const firstWords = {
  id: "first",
  duration: first.duration,
  html: `
    <div class="grain"></div>
    ${chapter("02", "第一句话")}
    <div class="o-first-copy">
      <p class="eyebrow rise" style="${at(0.1)}"><b>2026-05-23 23:46</b><i></i>第 3 天</p>
      <h2 class="display">${lines(["第 3 天深夜，", "它<em>开口说话</em>了。"], 0.1)}</h2>
      <p class="lead rise" style="${at(first.beat(1))}">接上真实模型，回复在窗口里一个字一个字流出来。</p>
    </div>
    <div class="stage stage-mint o-first-stage">
      <div class="o-window o-first-window">
        <p class="o-window-bar"><i></i><i></i><i></i><span>ActSpace</span></p>
        <div class="o-stream">
          <i class="o-stream-ask"></i>
          ${reply}
        </div>
        <p class="o-stream-status"><i></i>deepseek-chat · 流式输出</p>
      </div>
    </div>
    ${axis(firstTrip)}`,
};

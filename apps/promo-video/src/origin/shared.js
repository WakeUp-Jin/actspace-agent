import { at, lines, markUrl } from "../scenes/shared.js";
import { cue } from "./cues.js";
import { curve, totals } from "./data.js";

export { at, lines, markUrl };

/** 入场动画要走一小段才看得清，所以比和弦早起一点，字正好在拍子上到位。 */
const EARLY = 0.12;

/** 取一个分镜的时间表：duration 是时长，beat(n) 是它的第 n 个和弦对应的入场时刻（秒，可再加偏移）。 */
export function timing(id) {
  const { duration, at: chordAt } = cue(id);
  return { duration, beat: (slot, shift = 0) => Number(Math.max(0, chordAt(slot) + shift - EARLY).toFixed(3)) };
}

const AXIS_WIDTH = 1680;
const CHART_MAX = 180_000;
const MONTHS = [
  [1, "5 月"],
  [12, "6 月"],
  [42, "7 月"],
  [73, "8 月"],
  [104, "9 月"],
  [134, "10 月"],
  [165, "11 月"],
];

const fraction = (day) => (day - 1) / (totals.days - 1);

/** 曲线上的折点：没有提交的日子行数不变，所以先平着走到前一天，再跳到新值。 */
const steps = curve.flatMap(([day, value], index) => {
  const previous = curve[index - 1];
  return previous && day - previous[0] > 1 ? [[day - 1, previous[1]], [day, value]] : [[day, value]];
});

/** 分镜角标：左上片名，右上章节。夜色分镜里不放图标（图标的深色圆环在深底上看不见）。 */
export function chapter(number, name, { dark = false } = {}) {
  return `
    <header class="o-chrome fade" style="${at(0.1)}">
      <span class="o-chrome-brand">${dark ? "" : `<img src="${markUrl}" alt="">`}ActSpace 诞生记</span>
      <span class="o-chrome-chapter"><b>${number}</b>${name}</span>
    </header>`;
}

/**
 * 一条「讲到第几天」的轨迹。keys 是 [分镜内的时刻, 第几天]，相邻两点之间匀速走。
 * 时间轴的进度、曲线揭开到哪里、天数和代码行数两个数字都从它算，所以四样东西永远对得上。
 */
export function journey(id, keys) {
  const points = keys[0][0] === 0 ? [...keys] : [[0, keys[0][1]], ...keys];
  if (points.length === 1) points.push([1, points[0][1]]);
  const total = points.at(-1)[0];
  const firstDay = points[0][1];
  const lastDay = points.at(-1)[1];

  const timeOf = (day) => {
    if (day <= firstDay) return 0;
    for (let index = 1; index < points.length; index += 1) {
      const [fromTime, fromDay] = points[index - 1];
      const [toTime, toDay] = points[index];
      if (toDay > fromDay && day <= toDay) return fromTime + ((day - fromDay) / (toDay - fromDay)) * (toTime - fromTime);
    }
    return total;
  };

  const frames = (declaration) =>
    points.map(([time, day]) => `${((time / total) * 100).toFixed(3)}% { ${declaration(fraction(day))} }`).join(" ");
  const style = `<style>
    @keyframes fill-${id} { ${frames((f) => `transform: scaleX(${f.toFixed(5)});`)} }
    @keyframes head-${id} { ${frames((f) => `transform: translateX(${(f * AXIS_WIDTH).toFixed(2)}px);`)} }
    @keyframes clip-${id} { ${frames((f) => `clip-path: inset(-20px ${((1 - f) * 100).toFixed(3)}% 0 0);`)} }
  </style>`;

  const codeKeys = [
    [0, steps.findLast(([day]) => day <= firstDay)[1]],
    ...steps.filter(([day]) => day > firstDay && day <= lastDay).map(([day, value]) => [timeOf(day), value]),
  ];

  return {
    style,
    timeOf,
    run: (name) => `animation: ${name}-${id} ${total}s linear both;`,
    dayKeys: points.map(([time, day]) => `${day}@${time}`).join(" "),
    codeKeys: codeKeys.map(([time, value]) => `${value}@${time.toFixed(3)}`).join(" "),
  };
}

/** 画面底部的时间轴：176 天从左到右，圆点和「第 N 天」跟着 journey 走。chartHeight 是上方曲线的高度，标签浮在曲线上面。 */
export function axis(trip, { chartHeight = 0 } = {}) {
  const ticks = MONTHS.map(
    ([day, label]) => `<span class="o-axis-tick" style="left:${(fraction(day) * AXIS_WIDTH).toFixed(1)}px">${label}</span>`,
  ).join("");
  return `
    <footer class="o-axis fade" style="${at(0.1)}">
      ${trip.style}
      <i class="o-axis-rail"></i>
      <i class="o-axis-fill" style="${trip.run("fill")}"></i>
      ${ticks}
      <b class="o-axis-head" style="${trip.run("head")}--guide:${chartHeight}px;"><span>第 <i data-count="${trip.dayKeys}" data-linear></i> 天</span></b>
    </footer>`;
}

const chartY = (value, height) => Number((height - (value / CHART_MAX) * height).toFixed(1));

/** 代码行数曲线，画在时间轴正上方、和它共用横坐标；跟着 journey 从左往右揭开。extra 是叠在曲线上的标注。 */
export function chart(trip, { height, extra = "" }) {
  const x = (day) => (fraction(day) * AXIS_WIDTH).toFixed(1);
  const line = steps.map(([day, value], index) => `${index === 0 ? "M" : "L"}${x(day)},${chartY(value, height)}`).join(" ");
  const grid = [50_000, 100_000, 150_000]
    .map((value) => `<i class="o-chart-grid" style="top:${chartY(value, height)}px"><span>${value / 10_000} 万行</span></i>`)
    .join("");
  return `
    <div class="o-chart fade" style="height:${height}px;${at(0.1)}">
      ${grid}
      <div class="o-chart-plot" style="${trip.run("clip")}">
        <svg viewBox="0 0 ${AXIS_WIDTH} ${height}" width="${AXIS_WIDTH}" height="${height}" aria-hidden="true">
          <path class="o-chart-area" d="${line} L${AXIS_WIDTH},${height} L0,${height} Z"/>
          <path class="o-chart-line" d="${line}"/>
        </svg>
      </div>
      ${extra}
    </div>`;
}

/** 曲线上的定位：某一天到某一天的横向区间、某个行数对应的高度、某一天从一个行数落到另一个行数的那一段、曲线在某一天所在的那个点（都是内联样式片段）。 */
export const between = (fromDay, toDay) =>
  `left:${(fraction(fromDay) * AXIS_WIDTH).toFixed(1)}px;width:${((fraction(toDay) - fraction(fromDay)) * AXIS_WIDTH).toFixed(1)}px;`;
export const level = (value, height) => `top:${chartY(value, height)}px;`;
export const fall = (day, fromValue, toValue, height) =>
  `left:${(fraction(day - 0.5) * AXIS_WIDTH).toFixed(1)}px;top:${chartY(fromValue, height)}px;height:${(chartY(toValue, height) - chartY(fromValue, height)).toFixed(1)}px;`;
export const point = (day, height) =>
  `left:${(fraction(day) * AXIS_WIDTH).toFixed(1)}px;top:${chartY(curve.findLast(([commitDay]) => commitDay <= day)[1], height)}px;`;

/** 右上角的大数字：仓库里此刻有多少行代码。keys 默认跟着 journey 匀速走，也可以单独写。 */
export const counter = (keys, { linear = true } = {}) =>
  `<p class="o-counter fade" style="${at(0.1)}"><b data-count="${keys}" data-group${linear ? " data-linear" : ""}></b><span>行代码 · 不含测试</span></p>`;

/** 一排带日期的小标签，journey 讲到那一天时弹出来。items 是 [日期, 第几天, 名称]。 */
export function chips(trip, items) {
  let last = -1;
  return items
    .map(([date, day, label]) => {
      // 同一天的几个标签错开一点，不要同时弹出。
      const time = Math.max(trip.timeOf(day) - EARLY, last + 0.18, 0);
      last = time;
      return `<li class="o-chip" style="${at(time.toFixed(2))}"><time>${date}</time>${label}</li>`;
    })
    .join("");
}

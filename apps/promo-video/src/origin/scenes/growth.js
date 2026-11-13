import { rewrite } from "../data.js";
import { at, axis, chapter, chart, chips, counter, journey, level, lines, point, timing } from "../shared.js";

const CHART = 360;

const grow = timing("grow");
const again = timing("again");

// 头两周东西落得最密，所以前两个和弦只走到第 17 天，后面三个和弦走完剩下两个月。
const growTrip = journey("grow", [[0.5, 3], [grow.beat(2), 17], [grow.beat(5, -0.4), 83], [grow.duration, 83]]);

// [日期, 第几天, 做出了什么]。日期取自 docs/roadmap.md 的里程碑和 docs/histories/ 里对应的记录。
const built = [
  ["05-22", 2, "桌面工作台跑起来"],
  ["05-23", 3, "真实模型流式对话"],
  ["05-26", 6, "Bash、文件编辑与工具审批"],
  ["05-26", 6, "Token 用量统计"],
  ["05-27", 7, "Kairos 自治模式"],
  ["05-28", 8, "Lab 实验页"],
  ["05-30", 10, "可视化 HTML 回复"],
  ["05-30", 10, "工作区文件树"],
  ["06-04", 15, "Skills"],
  ["06-06", 17, "SubAgent 协作"],
  ["06-14", 25, "改用 Apache-2.0"],
  ["07-03", 44, "后台 Bash"],
  ["07-04", 45, "Bash 沙盒"],
  ["07-25", 66, "多供应商模型"],
  ["07-26", 67, "会话分支"],
  ["07-28", 69, "官网与文档"],
  ["07-28", 69, "图片生成"],
  ["07-30", 71, "内置终端"],
];

export const growing = {
  id: "grow",
  duration: grow.duration,
  enter: 0.6,
  html: `
    <div class="grain"></div>
    ${chapter("03", "越长越多")}
    <h2 class="display-m o-growth-title">${lines(["然后，它开始长。"], 0.2, { out: grow.beat(5, -0.5) })}</h2>
    <h2 class="display-m o-growth-title">${lines(["不到三个月，<em>11 万行</em>代码。"], grow.beat(5))}</h2>
    ${counter(growTrip.codeKeys)}
    <ul class="o-chips">${chips(growTrip, built)}</ul>
    ${chart(growTrip, { height: CHART })}
    ${axis(growTrip, { chartHeight: CHART })}`,
};

// 头两个和弦（间奏）走到第 116 天，主题回来的那一下钉住「它开始写自己」；第 140 天重新越过重写前的高度，落在第 4 个和弦上。
const againTrip = journey("again", [
  [0.4, 102],
  [again.beat(2), 116],
  [again.beat(4), 140],
  [again.beat(5, 1.2), 164],
  [again.duration, 164],
]);

const rebuilt = [
  ["09-09", 112, "界面中文化"],
  ["09-12", 115, "会话自动命名"],
  ["09-26", 129, "设置中心重做"],
  ["09-28", 131, "Mermaid 图表"],
  ["09-29", 132, "Chat / Plan / Agent 三种模式"],
  ["09-29", 132, "Browser Use"],
  ["10-01", 134, "回复批注与引用"],
  ["10-04", 137, "独立 Agent Host"],
  ["10-07", 140, "Harness 自进化 V1"],
  ["10-07", 140, "Actor 与 Space 演示"],
  ["10-12", 145, "上下文管理引擎"],
  ["10-15", 148, "轮尾交付卡"],
  ["10-17", 150, "Web / PWA 客户端"],
];

const oldPeak = `
  <i class="o-chart-mark fade" style="${level(rewrite.codeBefore, CHART)}${at(again.beat(3))}">
    <span>重写前 ${rewrite.codeBefore.toLocaleString("en-US")} 行</span>
  </i>`;

// 第 116 天钉在曲线上的一条标注，出现后一直留到分镜结束。出处：docs/histories/2026-09/20260913-1540-tool-result-interaction-fixes.md。
const selfHosted = `
  <div class="o-chart-pin pop" style="${point(116, CHART)}${at(again.beat(2))}">
    <div class="o-chart-note">
      <p class="o-chart-note-field"><span>Runtime</span><b>ActSpace desktop v2</b></p>
      <p class="o-chart-note-text"><time>09-13 · 第 116 天</time>开发记录的 Runtime 一栏，第一次写着 ActSpace 自己。</p>
    </div>
  </div>`;

export const growingAgain = {
  id: "again",
  duration: again.duration,
  enter: 0.6,
  html: `
    <div class="grain"></div>
    ${chapter("05", "再长一遍")}
    <h2 class="display-m o-growth-title">${lines(["然后，再长一遍。"], 0.2, { out: again.beat(4, -0.5) })}</h2>
    <p class="o-growth-lead rise" style="${at(1.1, again.beat(4, -0.5))}"><b>${rewrite.packagesBefore} 个包 → ${rewrite.packagesAfter} 个包</b>这一次，后端是一组可以替换的插件。</p>
    <h2 class="display-m o-growth-title">${lines(["38 天后，代码比重写前<em>还多</em>。"], again.beat(4))}</h2>
    ${counter(againTrip.codeKeys)}
    <ul class="o-chips">${chips(againTrip, rebuilt)}</ul>
    ${chart(againTrip, { height: CHART, extra: oldPeak + selfHosted })}
    ${axis(againTrip, { chartHeight: CHART })}`,
};

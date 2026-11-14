import { beats } from "../soundtrack.js";
import { at, chrome, icons, lines, pointer, span } from "./shared.js";

/**
 * 核心特点的三个分镜共用一套版式：左边一个标题、一句话和三个要点，右边是按视频尺寸重画的界面。
 * 右边每发生一件事，左边对应的那条要点亮起——字和画面说的是同一件事，不用观众自己去截图里找。
 * 重画的界面是示意，数字是一条演示任务的数据；产品改了对应的文案或数字，要手动对一遍这个文件。
 */
const DURATION = beats(10);
const END = DURATION + 0.6;

function feature({ id, index, tone, title, lead, points, visual }) {
  const rows = points
    .map(({ text, on }, pointIndex) => {
      const off = points[pointIndex + 1]?.on ?? END;
      return `<li class="point rise" style="${at(0.7 + pointIndex * 0.1)}${span(on, off)}"><b>${text}</b></li>`;
    })
    .join("");
  return {
    id: `feature-${id}`,
    duration: DURATION,
    enter: 0.6,
    html: `
      <div class="grain"></div>
      ${chrome("02", "核心特点")}
      <div class="feature-copy">
        <p class="eyebrow rise" style="${at(0.15)}"><b>0${index}</b><i></i>共 03 项</p>
        <h2 class="display-m">${lines(title, 0.25)}</h2>
        <p class="lead rise" style="${at(0.55)}">${lead}</p>
        <ol class="points">${rows}</ol>
      </div>
      <div class="stage stage-${tone} feature-stage">
        <div class="stage-body">${visual}</div>
      </div>`,
  };
}

// ── 上下文 ──────────────────────────────────────────────
// 数字取自产品「上下文」面板的演示数据：200K 的窗口，约 160K 时自动压缩。
const FILL_AT = 0.9;
const FULL_AT = 2.5;
const COMPACT_AT = 3;
const COMPACTED_AT = 3.6;
const SHARES_AT = 4.2;
const USED = `42@${FILL_AT} 161@${FULL_AT} 161@${COMPACT_AT} 65.9@${COMPACTED_AT}`;
const PERCENT = `21@${FILL_AT} 80@${FULL_AT} 80@${COMPACT_AT} 33@${COMPACTED_AT}`;

const SHARES = [
  { name: "系统提示", share: "6%", tone: "slate" },
  { name: "工具", share: "18%", tone: "violet" },
  { name: "规则", share: "4%", tone: "mint" },
  { name: "Skills", share: "2%", tone: "lemon" },
  { name: "会话摘要", share: "8%", tone: "peach" },
  { name: "会话消息", share: "62%", tone: "ink" },
];

const context = feature({
  id: "context",
  index: 1,
  tone: "mint",
  title: ["上下文，", "看得见"],
  lead: "每次请求带了什么、占了多少，随时能查。",
  points: [
    { text: "用了多少，随时可查", on: FILL_AT - 0.1 },
    { text: "快满了，自动压缩", on: COMPACT_AT - 0.2 },
    { text: "花在哪里，逐项列出", on: SHARES_AT - 0.1 },
  ],
  visual: `
    <div class="meter card pop" style="${at(0.45)}">
      <div class="meter-head">
        <span>当前上下文</span>
        <span class="badge badge-live pop" style="${at(COMPACT_AT + 0.15)}">${icons.check}已自动压缩</span>
      </div>
      <p class="meter-figure">
        <b class="mono">≈<span data-count="${USED}" data-digits="1"></span>K</b>
        <span class="meter-total">/ 200K tokens</span>
        <span class="meter-percent mono"><span data-count="${PERCENT}"></span>%</span>
      </p>
      <div class="meter-bar">
        <i class="meter-fill" style="--fill:${FILL_AT}s;--full:${FULL_AT - FILL_AT}s;--compact:${COMPACT_AT}s;--settle:${COMPACTED_AT - COMPACT_AT}s;"></i>
        <i class="meter-mark"><span class="mono">自动压缩 ≈160K</span></i>
      </div>
      <ul class="meter-shares">
        ${SHARES.map(
          ({ name, share, tone }, shareIndex) =>
            `<li class="rise" style="${at(SHARES_AT + shareIndex * 0.08)}"><i class="dot dot-${tone}"></i><span>${name}</span><b class="mono">${share}</b></li>`,
        ).join("")}
      </ul>
    </div>`,
});

// ── 审批 ────────────────────────────────────────────────
const RUN_AT = 2.7;
const MODES_AT = 4.3;

const approval = feature({
  id: "approval",
  index: 2,
  tone: "lemon",
  title: ["执行，", "有边界"],
  lead: "写文件、跑命令之前先问你，<br>放行多少由你定。",
  points: [
    { text: "命令原样列出，等你确认", on: 0.8 },
    { text: "点了运行，它才动手", on: RUN_AT - 0.2 },
    { text: "三档权限，随时切换", on: MODES_AT - 0.1 },
  ],
  visual: `
    <div class="ask card pop" style="${at(0.45)}">
      <p class="ask-head"><i>${icons.shield}</i>运行项目测试<span class="mono">pnpm</span></p>
      <p class="ask-command mono"><em>$</em>pnpm test</p>
      <div class="ask-actions">
        <span class="btn">拒绝</span>
        <span class="btn btn-soft">本会话允许 pnpm</span>
        <span class="aim">
          <span class="btn btn-solid press" style="${at(RUN_AT)}">运行</span>
          ${pointer({ from: [230, 240], to: [22, 20], start: RUN_AT - 1.1, click: RUN_AT })}
        </span>
      </div>
    </div>
    <p class="done card pop" style="${at(RUN_AT + 0.45)}">
      <i>${icons.check}</i><b>18 个测试全部通过</b><span class="mono">Tests 18 passed (18)</span>
    </p>
    <p class="modes rise" style="${at(MODES_AT)}">
      <span>权限模式</span><b class="is-current">自动</b><b>替我审批</b><b>完全权限</b>
    </p>`,
});

// ── 过程与结果 ──────────────────────────────────────────
const TRACE_AT = 0.9;
const CHANGES_AT = 2.9;
const USAGE_AT = 4.5;

// 时间线上的每一段：[起点 %, 宽度 %]。工具那一行里有一次失败的调用，照样记着。
const LANES = [
  { name: "输入", tone: "input", segments: [[1, 5]] },
  {
    name: "模型",
    tone: "model",
    segments: [
      [8, 9],
      [27, 7],
      [46, 7],
      [66, 6],
      [86, 10],
    ],
  },
  {
    name: "工具",
    tone: "tool",
    segments: [
      [18, 8],
      [35, 10],
      [54, 5, "fail"],
      [60, 5],
      [73, 12],
    ],
  },
];

const lanes = LANES.map(
  ({ name, tone, segments }) => `
    <div class="lane">
      <span>${name}</span>
      <div class="lane-track">
        ${segments
          .map(
            ([left, width, state]) =>
              `<i class="seg seg-${state ?? tone}" style="left:${left}%;width:${width}%;${at((TRACE_AT + 0.2 + left * 0.016).toFixed(2))}"></i>`,
          )
          .join("")}
      </div>
    </div>`,
).join("");

const CHANGES = [
  { path: "src/lib/validate.ts", plus: 9, minus: 0 },
  { path: "src/pages/Login.tsx", plus: 4, minus: 1 },
  { path: "src/lib/validate.test.ts", plus: 10, minus: 0 },
];

const diff = (plus, minus) =>
  `<span class="diff mono"><em class="plus">+${plus}</em><em class="minus">−${minus}</em></span>`;

const record = feature({
  id: "record",
  index: 3,
  tone: "slate",
  title: ["过程，", "有据可查"],
  lead: "每一步调用留在时间线上；<br>改了什么、花了多少，列成清单。",
  points: [
    { text: "每一步调用，按轮次排开", on: TRACE_AT - 0.1 },
    { text: "改了哪些文件，加减几行", on: CHANGES_AT - 0.1 },
    { text: "这一轮的用量，跟在末尾", on: USAGE_AT - 0.1 },
  ],
  visual: `
    <div class="trace card pop" style="${at(0.45)}">
      <p class="card-head"><b>轨迹</b><span class="mono">8 轮 · 47 步</span></p>
      ${lanes}
    </div>
    <div class="changes card pop" style="${at(CHANGES_AT)}">
      <p class="card-head"><b>已编辑 3 个文件</b>${diff(23, 1)}</p>
      <ul>
        ${CHANGES.map(
          ({ path, plus, minus }, changeIndex) =>
            `<li class="rise" style="${at(CHANGES_AT + 0.25 + changeIndex * 0.12)}"><i>${icons.file}</i><span class="mono">${path}</span>${diff(plus, minus)}</li>`,
        ).join("")}
      </ul>
    </div>
    <p class="usage card pop" style="${at(USAGE_AT)}">
      <i>${icons.gauge}</i><b>本轮用量</b><span class="mono">73.5K tokens · 1 分 37 秒</span>
    </p>`,
});

export const featureScenes = [context, approval, record];

import { at, icons, lines, pointer } from "./shared.js";

// 「动效图形」版的三个能力分镜：版式固定（左边一句话，右边一张重画的界面卡片），只换卡片里的内容。

// 数字取自产品「上下文」面板的演示数据：200K 的窗口，约 160K 时自动压缩。
const FULL_AT = 2.2;
const COMPACT_AT = 2.8;
const COMPACTED_AT = 3.4;
const USED = `42@0.6 161@${FULL_AT} 161@${COMPACT_AT} 65.9@${COMPACTED_AT}`;
const PERCENT = `21@0.6 80@${FULL_AT} 80@${COMPACT_AT} 33@${COMPACTED_AT}`;

const SHARES = [
  { name: "系统提示", share: "6%", tone: "slate" },
  { name: "工具", share: "18%", tone: "violet" },
  { name: "规则", share: "4%", tone: "mint" },
  { name: "Skills", share: "2%", tone: "lemon" },
  { name: "会话摘要", share: "8%", tone: "peach" },
  { name: "会话消息", share: "62%", tone: "ink" },
];

export const context = {
  id: "context",
  duration: 6,
  enter: 0.6,
  transition: "slide",
  music: 3,
  html: `
    <div class="stage stage-mint">
      <div class="shot-copy">
        <p class="tag rise" style="${at(0.3)}"><b>已上线</b>上下文管理引擎</p>
        <h2 class="shot-title">${lines(["上下文，", "<em>自己会管</em>。"], 0.35)}</h2>
        <p class="shot-sub rise" style="${at(0.7)}">快满了自动压缩，花在哪逐项可查。</p>
      </div>
      <div class="shot-visual">
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
            <i class="meter-fill" style="--full:${FULL_AT - 0.6}s;--compact:${COMPACT_AT}s;--settle:${COMPACTED_AT - COMPACT_AT}s;"></i>
            <i class="meter-mark"><span class="mono">自动压缩 ≈160K</span></i>
          </div>
          <ul class="meter-shares">
            ${SHARES.map(
              ({ name, share, tone }, index) =>
                `<li class="rise" style="${at(3.7 + index * 0.08)}"><i class="dot dot-${tone}"></i><span>${name}</span><b class="mono">${share}</b></li>`,
            ).join("")}
          </ul>
        </div>
      </div>
    </div>`,
};

const RUN_AT = 2;

export const approval = {
  id: "approval",
  duration: 6,
  enter: 0.6,
  transition: "slide",
  music: 3,
  html: `
    <div class="stage stage-lemon">
      <div class="shot-copy">
        <p class="tag rise" style="${at(0.3)}"><b>权限</b>与审批</p>
        <h2 class="shot-title">${lines(["要动手？", "<em>先问你</em>。"], 0.35)}</h2>
        <p class="shot-sub rise" style="${at(0.7)}">读写文件、跑命令，都过权限这一关。</p>
      </div>
      <div class="shot-visual">
        <div class="ask card pop" style="${at(0.45)}">
          <p class="ask-head"><i>${icons.shield}</i>运行项目测试<span class="mono">pnpm</span></p>
          <p class="ask-command mono"><em>$</em>pnpm test</p>
          <div class="ask-actions">
            <span class="btn">拒绝</span>
            <span class="btn btn-soft">本会话允许 pnpm</span>
            <span class="aim">
              <span class="btn btn-solid press" style="${at(RUN_AT)}">运行</span>
              ${pointer({ from: [240, 250], to: [22, 20], start: 1.1, click: RUN_AT })}
            </span>
          </div>
        </div>
        <p class="ask-result card pop" style="${at(RUN_AT + 0.45)}">
          <i>${icons.check}</i><b>18 个测试全部通过</b><span class="mono">Tests 18 passed (18)</span>
        </p>
        <p class="modes rise" style="${at(3.5)}">
          <span>权限模式</span><b class="is-current">自动</b><b>替我审批</b><b>完全权限</b>
        </p>
      </div>
    </div>`,
};

// 名称对应插件目录里真实的能力；「操控浏览器」「英语学习」默认关闭，在 扩展 › 插件 里开启。
const FLIP_AT = 2.5;
const PLUGINS = [
  { icon: "file", name: "读写文件", on: true },
  { icon: "terminal", name: "终端命令", on: true },
  { icon: "spark", name: "Skills", on: true },
  { icon: "agents", name: "子 Agent", on: true },
  { icon: "open", name: "操控浏览器", flip: true },
  { icon: "pencil", name: "英语学习" },
];

const pluginRows = PLUGINS.map(({ icon, name, on, flip }, index) => {
  const toggle = `<i class="switch${on ? " is-on" : ""}${flip ? " is-flip" : ""}"${flip ? ` style="${at(FLIP_AT)}"` : ""}></i>`;
  return `
    <li class="plug rise" style="${at(0.5 + index * 0.09)}">
      <i class="plug-icon">${icons[icon]}</i>
      <b>${name}</b>
      ${flip ? `<span class="aim">${toggle}${pointer({ from: [200, 190], to: [14, 16], start: FLIP_AT - 0.9, click: FLIP_AT })}</span>` : toggle}
    </li>`;
}).join("");

export const plugins = {
  id: "plugins",
  duration: 6,
  enter: 0.6,
  transition: "slide",
  music: 3,
  html: `
    <div class="stage stage-night">
      <div class="shot-copy">
        <p class="tag tag-night rise" style="${at(0.3)}"><b>一切</b>皆插件</p>
        <h2 class="shot-title">${lines(["能力，", "<em>按需开关</em>。"], 0.35)}</h2>
        <p class="shot-sub rise" style="${at(0.7)}">工具、Skill、子 Agent，都是可以装卸的插件。</p>
      </div>
      <div class="shot-visual">
        <ul class="plugs">${pluginRows}</ul>
      </div>
    </div>`,
};

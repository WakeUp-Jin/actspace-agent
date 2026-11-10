import approvalUrl from "@site-assets/screenshots/home/approval.png";
import contextUrl from "@site-assets/screenshots/home/context-panel.png";
import trajectoryUrl from "@site-assets/screenshots/home/trajectory.png";
import deliverablesUrl from "@site-assets/screenshots/home/turn-deliverables.png";
import usageUrl from "@site-assets/screenshots/docs/usage.png";
import { at, chrome, focusBox, lines, span } from "./shared.js";

// 每个要点高亮多久，以及第一个要点从什么时候开始。
const FIRST_POINT = 1.2;
const POINT_SECONDS = 1.7;

/**
 * 核心特点的五个分镜共用一套版式：左边一句话加三个要点，右边是真实界面截图。
 * 要点的 rect 是它在截图里的位置（相对整张图的 [左, 上, 宽, 高]），与官网功能块保持一致；
 * 镜头会依次推到每个要点上，同时点亮左边对应的那一条。
 */
const features = [
  {
    id: "context",
    tone: "mint",
    title: ["上下文，", "看得见"],
    lead: "每次请求带了什么、占了多少，随时能查。",
    image: contextUrl,
    size: [1320, 3426],
    overview: [0, 0, 1, 0.3],
    points: [
      {
        title: "每次请求带了什么",
        detail: "按系统提示词、工具、规则、Skills 和会话拆开。",
        rect: [0.02, 0.325, 0.96, 0.27],
      },
      { title: "结构化压缩", detail: "快到上限时，旧历史收成摘要，没做完的事都留下。", rect: [0.02, 0.6, 0.96, 0.165] },
      { title: "渐进披露", detail: "Skill、规则和文件，用到时才放进来。", rect: [0.02, 0.77, 0.96, 0.19] },
    ],
  },
  {
    id: "approval",
    tone: "peach",
    title: ["执行，", "有边界"],
    lead: "写文件、跑命令之前先问你，放行多少由你定。",
    image: approvalUrl,
    size: [2280, 1410],
    overview: [0, 0, 1, 1],
    points: [
      { title: "确认后才执行", detail: "命令原样列出，标明在沙盒还是真实环境里跑。", rect: [0.05, 0.255, 0.89, 0.26] },
      {
        title: "按命令放行",
        detail: "同类命令可在本会话放行，换个会话重新问。",
        rect: [0.645, 0.425, 0.29, 0.08],
        pad: 0.5,
      },
      {
        title: "权限模式",
        detail: "「完全权限」不再逐条确认，硬性安全检查照旧生效。",
        rect: [0.125, 0.72, 0.205, 0.245],
        pad: 0.45,
      },
    ],
  },
  {
    id: "trajectory",
    tone: "slate",
    title: ["过程，", "可追溯"],
    lead: "每一步调用、结果和失败，都留在时间线上。",
    image: trajectoryUrl,
    size: [2820, 2280],
    overview: [0, 0, 1, 0.6],
    points: [
      {
        title: "时间线",
        detail: "输入、模型、工具按轮次排开，慢在哪一步一眼看出。",
        rect: [0, 0.05, 0.55, 0.115],
        pad: 0.1,
      },
      { title: "调用与结果", detail: "参数和返回并排列出，不用逐个展开。", rect: [0, 0.2, 0.72, 0.4] },
      { title: "失败与停止", detail: "报错、重试、停止和压缩，按发生顺序记着。", rect: [0, 0.595, 0.62, 0.36] },
    ],
  },
  {
    id: "deliverables",
    tone: "lemon",
    title: ["结果，", "可交付"],
    lead: "一轮结束，改了什么、交付了什么，列成清单。",
    image: deliverablesUrl,
    size: [2460, 3210],
    overview: [0, 0.1, 1, 0.5],
    points: [
      { title: "本轮改动", detail: "改了哪些文件、各加减几行，点开看差异。", rect: [0.065, 0.18, 0.87, 0.285] },
      {
        title: "交付文件",
        detail: "报告、表格、幻灯片单独列出，可预览或用本机应用打开。",
        rect: [0.065, 0.462, 0.87, 0.135],
      },
      {
        title: "本轮用量",
        detail: "这一轮用了多少 token，跟在回复末尾。",
        rect: [0.065, 0.95, 0.34, 0.042],
        pad: 0.45,
      },
    ],
  },
  {
    id: "cost",
    tone: "peach",
    title: ["成本，", "可控"],
    lead: "用你自己的模型和 Key，花在哪里都有账。",
    image: usageUrl,
    size: [1701, 1479],
    overview: [0, 0, 1, 0.62],
    points: [
      {
        title: "Token 与费用",
        detail: "用了多少、花了多少，按时间段汇总。",
        rect: [0.26, 0.215, 0.48, 0.135],
        pad: 0.3,
      },
      { title: "缓存命中率", detail: "多少输入走了缓存，一个数字看清。", rect: [0.745, 0.215, 0.245, 0.135], pad: 0.5 },
      { title: "逐条记录", detail: "模型和工具的每一次调用，都能查到。", rect: [0.02, 0.545, 0.965, 0.455], pad: 0.04 },
    ],
  },
];

function featureScene(feature, index) {
  const pointWindow = (pointIndex) => {
    const on = FIRST_POINT + pointIndex * POINT_SECONDS;
    return [on, on + POINT_SECONDS];
  };

  const points = feature.points
    .map(({ title, detail }, pointIndex) => {
      const [on, off] = pointWindow(pointIndex);
      return `
        <li class="point rise" style="${at(0.75 + pointIndex * 0.1)}${span(on, off)}">
          <b>${title}</b><span>${detail}</span>
        </li>`;
    })
    .join("");

  const focuses = feature.points
    .map(({ rect }, pointIndex) => {
      const [on, off] = pointWindow(pointIndex);
      return focusBox(rect, on + 0.45, off - 0.1);
    })
    .join("");

  return {
    id: `feature-${feature.id}`,
    duration: Number((FIRST_POINT + feature.points.length * POINT_SECONDS + 0.6).toFixed(2)),
    enter: 0.6,
    shots: {
      main: {
        size: feature.size,
        keys: [
          { at: 0, rect: feature.overview, pad: 0 },
          ...feature.points.map(({ rect, pad }, pointIndex) => ({
            at: pointWindow(pointIndex)[0] - 0.15,
            move: 0.95,
            rect,
            pad: pad ?? 0.14,
          })),
        ],
      },
    },
    html: `
      ${chrome("02", "核心特点")}
      <div class="feature">
        <div class="feature-copy">
          <p class="eyebrow rise" style="${at(0.15)}"><b>0${index + 1}</b><i></i>共 0${features.length} 项</p>
          <h2 class="display-m">${lines(feature.title, 0.25)}</h2>
          <p class="lead rise" style="${at(0.55)}">${feature.lead}</p>
          <ol class="points">${points}</ol>
        </div>
        <div class="stage stage-${feature.tone} feature-stage">
          <div class="cam" data-cam="main">
            <div class="cam-layer"><img src="${feature.image}" alt="">${focuses}</div>
          </div>
        </div>
      </div>`,
  };
}

export const featureScenes = features.map(featureScene);

import { at, lines } from "./shared.js";

/**
 * 「真实界面」版的主体：同一个产品窗口从头到尾留在场上，一条任务从输入、审批、交付看到上下文和轨迹。
 * 窗口里的每个状态都是 capture:ui 从产品里截下来的；这里只安排三件事——什么时候换到哪个状态、
 * 指针点哪里、镜头看哪里。按钮和区域的位置都读 meta.json，不手写坐标。
 */

/** 各个动作的时刻（秒，以本分镜开始为零点）。 */
const T = {
  hookOut: 2.1,
  settle: 2.0,
  type: 3.0,
  send: 5.2,
  approval: 5.3,
  askFocus: 7.1,
  run: 9.3,
  result: 9.42,
  hover: 11.95,
  diff: 12.05,
  diffOut: 14.0,
  panel: 15.0,
  context: 15.8,
  contextFocus: 16.0,
  contextOut: 19.5,
  trajectory: 20.6,
  trajectoryFocus: 20.9,
  trajectoryOut: 23.7,
};

export const WORKBENCH_DURATION = 26;

/** 配乐分段：先是提问，交出任务后加一层，看到结果后再加一层。 */
export const WORKBENCH_MUSIC = [
  [0, 0],
  [2, 1],
  [T.approval + 0.7, 2],
  [10, 3],
];

const TITLES = [
  { at: 2.5, chip: "交给它", text: "说一句话，把活交出去" },
  { at: 5.5, chip: "交给它", text: "读代码、改文件，它自己来" },
  { at: 7.5, chip: "管得住", text: "要跑命令？先问你" },
  { at: 9.7, chip: "看得见", text: "改了什么，一眼看清" },
  { at: 15.3, chip: "看得见", text: "上下文花在哪，逐项可查" },
  { at: 20.9, chip: "看得见", text: "每一步，都留了轨迹" },
];

const center = ([x, y, width, height]) => [x + width / 2, y + height / 2];
const grow = ([x, y, width, height], dx, dy = dx) => [x - dx, y - dy, width + dx * 2, height + dy * 2];

function titles() {
  return TITLES.map((title, index) => {
    const out = TITLES[index + 1] ? TITLES[index + 1].at - 0.2 : undefined;
    return `<div class="wb-title rise" style="${at(title.at, out)}"><span class="wb-chip">${title.chip}</span><h2>${title.text}</h2></div>`;
  }).join("");
}

const ARROW =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8.5-6.2 1.3L10.5 19z" fill="#1d1c1a" stroke="#fbfaf7" stroke-width="1.6" stroke-linejoin="round"/></svg>';

/** 指针从 from 滑到 to（窗口坐标）。click 给了就在那一刻按下并冒一圈波纹；out 是指针消失的时刻。 */
function pointer({ from, to, start, arrive, click, out }) {
  const style = `--fx:${from[0]}px;--fy:${from[1]}px;--tx:${to[0]}px;--ty:${to[1]}px;${at(start, out)}--move:${(arrive - start).toFixed(2)}s;`;
  const press = click === undefined ? "" : `--click:${click}s;`;
  const ripple = click === undefined ? "" : `<i class="wb-ripple" style="left:${to[0]}px;top:${to[1]}px;${at(click)}"></i>`;
  return `${ripple}<i class="wb-pointer" style="${style}${press}">${ARROW}</i>`;
}

/**
 * @param {{ size: [number, number], typing: Array<{ still: string, chars: number }>, rects: Record<string, number[]> }} ui
 */
export function workbench(ui) {
  const { rects, size, typing } = ui;
  const [width, height] = size;
  const relative = ([x, y, w, h]) => [x / width, y / height, w / width, h / height];
  const full = [0, 0, 1, 1];

  // 逐段输入：每两字一张图，匀速换。
  const typeStep = (T.send - 0.75 - T.type) / (typing.length - 1);
  const stills = [
    ...typing.map((entry, index) => ({ name: entry.still, at: index === 0 ? 0 : T.type + index * typeStep, cut: true })),
    { name: "approval", at: T.approval },
    { name: "result", at: T.result },
    { name: "diff", at: T.diff },
    { name: "result", at: T.diffOut },
    { name: "panel", at: T.panel + 0.1 },
    { name: "context", at: T.context + 0.1 },
    { name: "trajectory", at: T.trajectory + 0.1 },
  ];

  const send = center(rects.send);
  const run = center(rects.run);
  const file = [rects.fileRow[0] + 150, rects.fileRow[1] + rects.fileRow[3] / 2];
  const panelButton = center(rects.panelButton);
  const contextEntry = [rects.contextEntry[0] + 70, rects.contextEntry[1] + rects.contextEntry[3] / 2];
  const trajectoryButton = center(rects.trajectoryButton);

  const pointers = [
    pointer({ from: [send[0] - 190, send[1] + 110], to: send, start: T.send - 0.7, arrive: T.send - 0.1, click: T.send, out: T.send + 0.3 }),
    pointer({ from: [run[0] - 200, run[1] + 120], to: run, start: T.run - 0.8, arrive: T.run - 0.1, click: T.run, out: T.run + 0.3 }),
    pointer({ from: [file[0] + 230, file[1] + 130], to: file, start: T.hover - 0.75, arrive: T.hover, out: T.diffOut }),
    pointer({ from: [panelButton[0] - 240, panelButton[1] + 170], to: panelButton, start: T.panel - 0.7, arrive: T.panel - 0.1, click: T.panel, out: T.panel + 0.25 }),
    pointer({ from: panelButton, to: contextEntry, start: T.panel + 0.25, arrive: T.context - 0.1, click: T.context, out: T.context + 0.3 }),
    pointer({ from: [trajectoryButton[0] + 260, trajectoryButton[1] + 190], to: trajectoryButton, start: T.trajectory - 0.75, arrive: T.trajectory - 0.1, click: T.trajectory, out: T.trajectory + 0.3 }),
  ];

  const diffView = [rects.diff[0], rects.fileRow[1] - 110, rects.diff[2], rects.diff[1] + rects.diff[3] - rects.fileRow[1] + 130];
  const trajectoryView = [rects.trajectory[0], rects.trajectory[1], rects.trajectory[2], rects.failure[1] + rects.failure[3] + 40 - rects.trajectory[1]];

  return {
    id: "workbench",
    duration: WORKBENCH_DURATION,
    music: WORKBENCH_MUSIC,
    shots: {
      window: {
        size,
        keys: [
          { at: 0, rect: full, pad: 0 },
          { at: 2.6, move: 0.9, rect: relative(grow(rects.composer, 36, 60)), pad: 0.03 },
          { at: T.approval, move: 0.8, rect: full, pad: 0 },
          { at: T.askFocus, move: 0.9, rect: relative(rects.work), pad: 0.07 },
          { at: T.result + 0.1, move: 0.8, rect: relative(rects.result), pad: 0.07 },
          { at: T.diff, move: 0.7, rect: relative(diffView), pad: 0.03 },
          { at: T.diffOut, move: 0.8, rect: full, pad: 0 },
          { at: T.contextFocus, move: 0.9, rect: relative(rects.context), pad: 0.06 },
          { at: T.contextOut, move: 0.8, rect: full, pad: 0 },
          { at: T.trajectoryFocus, move: 0.9, rect: relative(trajectoryView), pad: 0.03 },
          { at: T.trajectoryOut, move: 0.8, rect: full, pad: 0 },
        ],
      },
    },
    html: `
      <div class="stage stage-paper wb">
        <div class="wb-titles">${titles()}</div>
        <div class="wb-window" style="--at:${T.settle}s;--w:${width};--h:${height};">
          <div class="wb-view" data-cam="window">
            <div class="cam-layer" data-stills>
              ${stills.map((still) => `<img class="wb-still" src="/ui/${still.name}.png" alt="" data-at="${still.at.toFixed(3)}"${still.cut ? " data-cut" : ""} />`).join("")}
              <div class="wb-lights"><i></i><i></i><i></i></div>
              ${pointers.join("")}
            </div>
          </div>
          <div class="wb-veil" style="--out:${T.hookOut - 0.1}s;"></div>
        </div>
        <h1 class="wb-hook">${lines(["把活交给 Agent，", "你敢<em>放手</em>吗？"], 0.15, { step: 0.12, out: T.hookOut - 0.25 })}</h1>
      </div>
    `,
  };
}

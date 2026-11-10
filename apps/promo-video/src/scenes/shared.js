import markUrl from "@site-assets/brand/actspace-mark.png";

export { markUrl };

/** 入场时刻（秒）写成 CSS 变量，动画延时全靠它；可选的离场时刻用 out。时刻都以所在分镜的开始为零点。 */
export const at = (seconds, out) => `--at:${seconds}s;${out === undefined ? "" : `--out:${out}s;`}`;

/** 「激活」区间：左侧要点在 on 到 off 之间亮起，前后压暗。 */
export const span = (on, off) => `--on:${on}s;--off:${off}s;`;

/** 大标题逐行从遮罩里升起。 */
export function lines(rows, start, { step = 0.14, out } = {}) {
  return rows
    .map(
      (row, index) =>
        `<span class="mask"><span class="up" style="${at(start + index * step, out === undefined ? undefined : out + index * 0.06)}">${row}</span></span>`,
    )
    .join("");
}

/** 分镜角标：左上品牌，右上章节。 */
export function chrome(number, chapter) {
  return `
    <header class="chrome fade" style="${at(0.1)}">
      <span class="chrome-brand"><img src="${markUrl}" alt="">ActSpace</span>
      <span class="chrome-chapter"><b>${number}</b>${chapter}</span>
    </header>`;
}

const stroke = (paths) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** 线性图标，画法跟桌面端一致：24 网格、1.8 描边。 */
export const icons = {
  file: stroke('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  spark: stroke('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16v4M17 18h4"/>'),
  agents: stroke(
    '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9.5" r="2.3"/><path d="M17 14.2c2.3.3 4 2.3 4 4.8"/>',
  ),
  pencil: stroke('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  terminal: stroke('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9l3 3-3 3M13 15h4"/>'),
  folder: stroke('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  check: stroke('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  arrowUp: stroke('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  plus: stroke('<path d="M12 5v14M5 12h14"/>'),
  shield: stroke('<path d="M12 3l7 3v5.5c0 4.3-2.9 7.8-7 9.5-4.1-1.7-7-5.2-7-9.5V6z"/><path d="M9 12l2.2 2.2L15 10.5"/>'),
  key: stroke('<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2.5 2.5"/>'),
  gauge: stroke('<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-6"/>'),
};

/** 鼠标指针：放在包住目标按钮的 .aim 里，从 from 滑到 to（相对按钮中心的像素），到位后按一下。 */
export const pointer = ({ from, to, start, click }) => `
  <i class="pointer" style="--fx:${from[0]}px;--fy:${from[1]}px;--tx:${to[0]}px;--ty:${to[1]}px;${at(start)}--move:${(click - start - 0.1).toFixed(2)}s;--click:${click}s;">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8.5-6.2 1.3L10.5 19z" fill="#1d1c1a" stroke="#fbfaf7" stroke-width="1.6" stroke-linejoin="round"/></svg>
  </i>`;

import markUrl from "@site-assets/brand/actspace-mark.png";

export { markUrl };

/** 入场时间（秒）写成 CSS 变量，动画延时全靠它。 */
export const at = (seconds, out) => `--at:${seconds}s;${out === undefined ? "" : `--out:${out}s;`}`;

/** 「激活」区间：要点高亮、截图聚光框都用 on / off 两个时刻。 */
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

/** 相对整张图的关注区域，转成聚光框的定位变量。 */
export const focusBox = ([x, y, w, h], on, off) =>
  `<i class="focus" style="--x:${x};--y:${y};--w:${w};--h:${h};${span(on, off)}"></i>`;

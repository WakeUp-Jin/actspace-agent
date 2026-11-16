// 压缩分隔线像素精灵的纯计算（front-轮尾与导航规范「上下文压缩分隔线」）。坐标单位都是「像素格」，1 格 = 2px。

/** 一拍 320ms；两拍一组：抬起 → 压低往前顶。 */
export const SPRITE_BEAT_MS = 320;
/** 收尾时每拍 70ms，一口气压成方块。 */
export const SPRITE_FINISH_BEAT_MS = 70;
/** 越往后越推不动：条长的下限按 e^(-t/τ) 收向最短长度。 */
export const SPRITE_EASE_TAU_MS = 12_000;

export const SPRITE_PX = 2;
export const STAGE_ROWS = 8;
export const SPRITE_W = 12;
export const BAR_Y = 4;
export const BAR_H = 3;
/** 舞台最左的竖墙占 2 格（1 格墙 + 1 格空）。 */
export const WALL_UNITS = 2;

export type SpriteFrame = "stand" | "push" | "melt" | "happy";

// X 身体，E 眼睛，. 透明。朝左推。
export const SPRITE_FRAMES: Record<SpriteFrame, readonly string[]> = {
  stand: ["....XXXXX...", "..XXXXXXXXX.", ".XXXXXXXXXXX", "XXXXXXXXXXXX", "XXEEXEEXXXXX", "XXXXXXXXXXXX", ".XXXX.XXXXX."],
  push: ["............", "..XXXXXX....", "XXXXXXXXXX..", "XXXXXXXXXXX.", "XEEXEEXXXXXX", "XXXXXXXXXXXX", ".XXXX.XXXXX."],
  melt: ["............", "............", "....XXXX....", "..XXXXXXXX..", ".XXXXXXXXXX.", "XXXEEXXEEXXX", "XXXXXXXXXXXX"],
  happy: ["....XXXX....", "..XXXXXXXX..", ".XXXXXXXXXX.", "XXXXXXXXXXXX", "XXXEEXXEEXXX", "XXXXXXXXXXXX", ".XXXX..XXXX."],
};

/** 收尾压成的小方块；完成行的图标是同一个形状多两行。 */
export const PACK_ROWS: readonly string[] = ["XXXXXX", "X....X", "XXXXXX"];
export const PACK_ICON_ROWS: readonly string[] = ["XXXXXX", "X....X", "XXXXXX", "X....X", "XXXXXX"];
export const PACK_UNITS = PACK_ROWS[0]!.length;

/** 把像素图拆成每格坐标，身体和眼睛分开。 */
export function framePixels(rows: readonly string[]): { body: [number, number][]; eyes: [number, number][] } {
  const body: [number, number][] = [];
  const eyes: [number, number][] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === "X") body.push([x, y]);
      else if (row[x] === "E") eyes.push([x, y]);
    }
  });
  return { body, eyes };
}

/** 固定种子生成长短不一的消息块（2–8 格），块间 1 格缝，总长不超过 room。 */
export function makeBricks(seed: number, room: number): number[] {
  let state = seed;
  const next = () => (state = (state * 9301 + 49_297) % 233_280) / 233_280;
  const widths: number[] = [];
  let used = 0;
  for (;;) {
    const width = 2 + Math.floor(next() * 7);
    const add = width + (widths.length > 0 ? 1 : 0);
    if (used + add > room) break;
    used += add;
    widths.push(width);
  }
  return widths;
}

export function naturalLength(widths: readonly number[]): number {
  return widths.length === 0 ? 0 : widths.reduce((sum, width) => sum + width, 0) + widths.length - 1;
}

export interface BrickSegment {
  x: number;
  width: number;
  squeezed: boolean;
}

/**
 * 把条压到 length 格：靠精灵那头（右端）的缝先合上，再从右往左把块压窄（每块至少 1 格）。
 * 返回从墙往外的每块位置；挤过的块 squeezed=true（颜色更深）。
 */
export function layoutBricks(widths: readonly number[], length: number): BrickSegment[] {
  const count = widths.length;
  if (count === 0) return [];
  let excess = Math.max(0, naturalLength(widths) - length);
  const gaps = Array.from({ length: count - 1 }, () => 1);
  const sized = widths.slice();
  for (let index = count - 2; index >= 0 && excess > 0; index -= 1) {
    gaps[index] = 0;
    excess -= 1;
  }
  for (let index = count - 1; index >= 0 && excess > 0; index -= 1) {
    const take = Math.min(sized[index]! - 1, excess);
    sized[index] = sized[index]! - take;
    excess -= take;
  }
  const segments: BrickSegment[] = [];
  let x = 0;
  for (let index = 0; index < count; index += 1) {
    const squeezed = sized[index]! < widths[index]! || (index > 0 && gaps[index - 1] === 0) || (index < count - 1 && gaps[index] === 0);
    segments.push({ x, width: sized[index]!, squeezed });
    x += sized[index]! + (index < count - 1 ? gaps[index]! : 0);
  }
  return segments;
}

/**
 * 已用 elapsedMs 时的条长（闭式，不按拍累加：切回会话、改窗宽都能一步算到当前位置）。
 * 每组两拍最多短 1 格；同时不低于 minLength + (full - minLength)·e^(-t/τ)，越往后越推不动，不会推到底。
 */
export function barLengthAt(full: number, minLength: number, elapsedMs: number): number {
  if (full <= minLength) return full;
  const t = Math.max(0, elapsedMs);
  const pushes = Math.floor(t / (SPRITE_BEAT_MS * 2));
  const floor = minLength + Math.ceil((full - minLength) * Math.exp(-t / SPRITE_EASE_TAU_MS));
  return Math.max(full - pushes, Math.min(full, floor));
}

/** 这一拍是不是「压低往前顶」的那一拍。 */
export function isPushBeat(elapsedMs: number): boolean {
  return Math.floor(Math.max(0, elapsedMs) / SPRITE_BEAT_MS) % 2 === 1;
}

/** 收尾每拍的条长：剩下的三分之一一口气压掉，至少 2 格，最后停在方块宽度。 */
export function finishStep(length: number): number {
  if (length <= PACK_UNITS) return PACK_UNITS;
  return Math.max(PACK_UNITS, length - Math.max(2, Math.ceil((length - PACK_UNITS) / 3)));
}

/** 失败且一出现就是失败（没看到推的过程）时，条画在 55% 处。 */
export function failedLength(full: number, minLength: number): number {
  return Math.max(minLength, Math.round(full * 0.55));
}

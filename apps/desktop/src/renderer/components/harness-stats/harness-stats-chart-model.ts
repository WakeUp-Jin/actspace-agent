/** 图表的纯计算：刻度、散点坐标、标签避让。组件只负责画。 */

export type LabelBox = { x: number; y: number; width: number; height: number };

export function niceCeil(value: number): number {
  if (!(value > 0)) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return step * base;
}

export function linearTicks(max: number, count = 4): number[] {
  const top = niceCeil(max);
  return Array.from({ length: count + 1 }, (_, index) => Math.round((top / count) * index));
}

const boxesOverlap = (a: LabelBox, b: LabelBox) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** 文字宽度的粗估（按 11px 无衬线，中文按 2 倍宽）。 */
export function estimateTextWidth(text: string, fontSize = 11): number {
  let units = 0;
  for (const char of text) units += char.charCodeAt(0) > 255 ? 1 : 0.58;
  return units * fontSize;
}

export type ScatterPoint = { readonly id: string; readonly x: number; readonly y: number; readonly priority: number };
export type PlacedLabel = { readonly id: string; readonly x: number; readonly y: number; readonly anchor: "start" | "end" };

/**
 * 给散点挑标签位置：优先级高的先放，右侧放不下就放左侧，仍与已放标签重叠时上下错开，
 * 实在放不下的不标（悬停仍有提示）。
 */
export function placeLabels(points: readonly ScatterPoint[], bounds: { width: number; height: number }, fontSize = 11, gap = 8): PlacedLabel[] {
  const placed: LabelBox[] = [];
  const result: PlacedLabel[] = [];
  const offsets = [0, -13, 13, -26, 26];
  for (const point of [...points].sort((a, b) => b.priority - a.priority)) {
    const width = estimateTextWidth(point.id, fontSize);
    const height = fontSize + 2;
    const sides: Array<"start" | "end"> = point.x + gap + width <= bounds.width ? ["start", "end"] : ["end", "start"];
    let chosen: PlacedLabel | null = null;
    outer: for (const anchor of sides) {
      for (const offset of offsets) {
        const x = anchor === "start" ? point.x + gap : point.x - gap - width;
        const y = point.y + 4 + offset;
        const box = { x, y: y - fontSize + 1, width, height };
        if (box.x < 0 || box.x + box.width > bounds.width || box.y < 0 || box.y + box.height > bounds.height) continue;
        if (placed.some((other) => boxesOverlap(box, other))) continue;
        placed.push(box);
        chosen = { id: point.id, x: anchor === "start" ? x : point.x - gap, y, anchor };
        break outer;
      }
    }
    if (chosen) result.push(chosen);
  }
  return result;
}

/** 趋势图：把序列映射到 [left, right] × [top, bottom] 的坐标。 */
export function linePoints(values: readonly number[], box: { left: number; right: number; top: number; bottom: number }, max: number): Array<{ x: number; y: number }> {
  const span = Math.max(1, values.length - 1);
  return values.map((value, index) => ({
    x: values.length === 1 ? (box.left + box.right) / 2 : box.left + (index * (box.right - box.left)) / span,
    y: box.bottom - (max > 0 ? value / max : 0) * (box.bottom - box.top),
  }));
}

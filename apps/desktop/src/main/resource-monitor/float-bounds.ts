/** 悬浮窗位置与展开状态：本机窗口状态，存在数据目录的小 JSON 里，不进设置文件。 */
import { readFile, writeFile } from "node:fs/promises";

export interface FloatWindowState {
  readonly x: number;
  readonly y: number;
  readonly expanded: boolean;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const FLOAT_WIDTH_COLLAPSED = 340;
export const FLOAT_WIDTH_EXPANDED = 360;
export const FLOAT_HEIGHT_COLLAPSED = 34;
const MARGIN = 16;

export function parseFloatWindowState(raw: string): FloatWindowState | null {
  try {
    const value = JSON.parse(raw) as Partial<FloatWindowState>;
    if (typeof value.x !== "number" || typeof value.y !== "number" || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
    return { x: Math.round(value.x), y: Math.round(value.y), expanded: value.expanded === true };
  } catch {
    return null;
  }
}

export async function readFloatWindowState(file: string): Promise<FloatWindowState | null> {
  const raw = await readFile(file, "utf8").catch(() => null);
  return raw === null ? null : parseFloatWindowState(raw);
}

export async function writeFloatWindowState(file: string, state: FloatWindowState): Promise<void> {
  await writeFile(file, `${JSON.stringify(state)}\n`, "utf8");
}

/** 记住的位置还在某块屏幕上（标题栏至少露出一半）就用它，否则放主屏右上角。 */
export function resolveFloatPosition(saved: Pick<FloatWindowState, "x" | "y"> | null, width: number, workAreas: readonly Rect[], primary: Rect): { x: number; y: number } {
  if (saved) {
    const visible = workAreas.some(area => saved.x + width / 2 >= area.x && saved.x + width / 2 <= area.x + area.width
      && saved.y >= area.y && saved.y + FLOAT_HEIGHT_COLLAPSED / 2 <= area.y + area.height);
    if (visible) return { x: saved.x, y: saved.y };
  }
  return { x: primary.x + primary.width - width - MARGIN, y: primary.y + MARGIN };
}

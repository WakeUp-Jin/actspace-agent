/**
 * 截图镜头：把一张大图放进固定取景框，按时间在几个关注区域之间推拉平移。
 * 区域用相对整张图的 [左, 上, 宽, 高]（0–1）表示，和官网功能块的写法一致。
 */

const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/** 让 rect 落在取景框中央并尽量放大；图片边缘不会被拉进画面内侧。 */
function frameFor(rect, pad, image, view) {
  const [x, y, w, h] = rect;
  const scale = Math.min(view.width / (w * image.width), view.height / (h * image.height)) * (1 - pad);
  const place = (start, size, imageSize, viewSize) => {
    const scaled = imageSize * scale;
    if (scaled <= viewSize) return (viewSize - scaled) / 2;
    const centered = viewSize / 2 - (start + size / 2) * scaled;
    return Math.min(0, Math.max(viewSize - scaled, centered));
  };
  return { scale, x: place(x, w, image.width, view.width), y: place(y, h, image.height, view.height) };
}

/**
 * @param {{ size: [number, number], keys: Array<{ at: number, move?: number, rect: number[], pad?: number }> }} shot
 * @param {{ width: number, height: number }} view
 * @returns {(local: number) => { scale: number, x: number, y: number }}
 */
export function createCamera(shot, view) {
  const image = { width: shot.size[0], height: shot.size[1] };
  const frames = shot.keys.map((key) => ({
    at: key.at,
    move: key.move ?? 1,
    frame: frameFor(key.rect, key.pad ?? 0.06, image, view),
  }));

  return (local) => {
    let current = frames[0].frame;
    for (let index = 1; index < frames.length; index += 1) {
      const { at, move, frame } = frames[index];
      if (local <= at) break;
      const progress = easeInOut(Math.min(1, (local - at) / move));
      current = {
        // 缩放按比例插值，推近和拉远的速度感才一致。
        scale: current.scale * (frame.scale / current.scale) ** progress,
        x: current.x + (frame.x - current.x) * progress,
        y: current.y + (frame.y - current.y) * progress,
      };
    }
    return current;
  };
}

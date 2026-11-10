/**
 * 可定位的时间线：给定任意时刻 t，画面都能直接摆到那一帧。
 *
 * 所有入场动画都写成普通的 CSS 动画（用 animation-delay 排先后），这里把它们全部暂停，
 * 再把每个动画的 currentTime 设成「t 减去所在分镜的开始时间」。
 * 预览时按真实时间连续调用 seek，渲染时按帧号逐帧调用，两边走的是同一条路。
 */
import { createCamera } from "./camera.js";

const pad = (value, length) => String(value).padStart(length, "0");

function typingDriver(element) {
  const text = element.dataset.type;
  const at = Number(element.dataset.at ?? 0);
  const speed = Number(element.dataset.cps ?? 30);
  return (local) => {
    const count = Math.max(0, Math.min(text.length, Math.floor((local - at) * speed)));
    const next = text.slice(0, count);
    if (element.textContent !== next) element.textContent = next;
    element.classList.toggle("is-typing", local >= at && count < text.length);
    element.classList.toggle("is-typed", count >= text.length);
  };
}

function cameraDriver(element, shot) {
  const layer = element.querySelector(".cam-layer");
  layer.style.width = `${shot.size[0]}px`;
  layer.style.height = `${shot.size[1]}px`;
  let camera = null;
  return (local) => {
    // 取景框尺寸要等分镜显示出来才量得到。
    camera ??= createCamera(shot, { width: element.clientWidth, height: element.clientHeight });
    const { scale, x, y } = camera(local);
    layer.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scale.toFixed(5)})`;
    layer.style.setProperty("--inv", (1 / scale).toFixed(4));
  };
}

function sequenceDriver(image, footage, pending) {
  const at = Number(image.dataset.at ?? 0);
  const rate = Number(image.dataset.rate ?? 1);
  let shown = -1;
  return (local) => {
    const frame = Math.max(0, Math.min(footage.frames - 1, Math.round((local - at) * footage.fps * rate)));
    if (frame === shown) return;
    shown = frame;
    image.src = `${footage.base}f${pad(frame, 4)}.jpg`;
    pending.push(image.decode().catch(() => {}));
  };
}

/**
 * @param {HTMLElement} film 1920×1080 的画布容器
 * @param {Array<{ id: string, duration: number, enter?: number, html: string, shots?: object, update?: Function }>} scenes
 * @param {{ footage: Record<string, { base: string, fps: number, frames: number }> }} assets
 */
export function createTimeline(film, scenes, assets) {
  const pending = [];
  let cursor = 0;

  const entries = scenes.map((scene, index) => {
    const element = document.createElement("section");
    element.className = `scene scene-${scene.id}`;
    element.style.zIndex = String(index + 1);
    element.style.setProperty("--dur", `${scene.duration}s`);
    element.style.setProperty("--enter", `${scene.enter ?? 0.7}s`);
    element.innerHTML = scene.html;
    film.append(element);

    const drivers = [];
    for (const node of element.querySelectorAll("[data-type]")) drivers.push(typingDriver(node));
    for (const node of element.querySelectorAll("[data-cam]"))
      drivers.push(cameraDriver(node, scene.shots[node.dataset.cam]));
    for (const node of element.querySelectorAll("[data-seq]")) {
      const footage = assets.footage[node.dataset.seq];
      if (footage) drivers.push(sequenceDriver(node, footage, pending));
      else node.closest("[data-seq-frame]")?.classList.add("is-missing");
    }
    if (scene.update) drivers.push((local) => scene.update(element, local));

    // 下一个分镜在本分镜结束前开始入场，两者重叠的这段就是转场。
    const start = index === 0 ? 0 : cursor - (scene.enter ?? 0.7);
    cursor = start + scene.duration;
    return { id: scene.id, element, start, duration: scene.duration, drivers, on: false };
  });

  const duration = cursor;

  async function seek(time) {
    const t = Math.max(0, Math.min(duration - 1e-4, time));
    for (const entry of entries) {
      const local = t - entry.start;
      const on = local >= 0 && local < entry.duration;
      if (on !== entry.on) {
        entry.on = on;
        entry.element.classList.toggle("is-on", on);
      }
      if (!on) continue;
      for (const animation of entry.element.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = local * 1000;
      }
      for (const driver of entry.drivers) driver(local);
    }
    if (pending.length) await Promise.all(pending.splice(0));
  }

  return {
    duration,
    seek,
    scenes: entries.map(({ id, start, duration: length }) => ({ id, start, duration: length })),
  };
}

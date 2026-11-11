/**
 * 可定位的时间线：给定任意时刻 t，画面都能直接摆到那一帧。
 *
 * 所有动效都写成普通的 CSS 动画（用 animation-delay 排先后），这里把它们全部暂停，
 * 再把每个动画的 currentTime 设成「t 减去所在分镜的开始时间」。
 * 预览时按真实时间连续调用 seek，渲染时按帧号逐帧调用，两边走的是同一条路。
 */
import { createCamera } from "./camera.js";
import { formatNumber, parseKeys, valueAt } from "./tween.js";

function typingDriver(element) {
  const text = element.dataset.type;
  const at = Number(element.dataset.at ?? 0);
  const speed = Number(element.dataset.cps ?? 30);
  return (local) => {
    const count = Math.max(0, Math.min(text.length, Math.floor((local - at) * speed)));
    const next = text.slice(0, count);
    if (element.textContent !== next) element.textContent = next;
    element.classList.toggle("is-typing", local >= at && count < text.length);
  };
}

function countDriver(element) {
  const keys = parseKeys(element.dataset.count);
  const format = { digits: Number(element.dataset.digits ?? 0), group: element.dataset.group !== undefined };
  return (local) => {
    const next = formatNumber(valueAt(keys, local), format);
    if (element.textContent !== next) element.textContent = next;
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
  };
}

/**
 * @param {HTMLElement} film 1920×1080 的画布容器
 * @param {Array<{ id: string, duration: number, enter?: number, transition?: string, html: string, shots?: object }>} scenes
 *   duration：从本分镜开始到下一个分镜开始的秒数，所以各分镜的开始时刻就是前面 duration 的累加。
 *   enter：本分镜入场转场的秒数。转场期间上一个分镜还留在下面，不会露出空画布。
 */
export function createTimeline(film, scenes) {
  let cursor = 0;

  const entries = scenes.map((scene, index) => {
    const tail = scenes[index + 1]?.enter ?? 0;
    const element = document.createElement("section");
    element.className = `scene scene-${scene.id} enter-${scene.transition ?? "fade"}`;
    element.style.zIndex = String(index + 1);
    element.style.setProperty("--enter", `${scene.enter ?? 0}s`);
    element.innerHTML = scene.html;
    film.append(element);

    const drivers = [];
    for (const node of element.querySelectorAll("[data-type]")) drivers.push(typingDriver(node));
    for (const node of element.querySelectorAll("[data-count]")) drivers.push(countDriver(node));
    for (const node of element.querySelectorAll("[data-cam]")) drivers.push(cameraDriver(node, scene.shots[node.dataset.cam]));

    const start = cursor;
    cursor += scene.duration;
    return { id: scene.id, element, start, duration: scene.duration, visible: scene.duration + tail, drivers, on: false };
  });

  const duration = cursor;

  function seek(time) {
    const t = Math.max(0, Math.min(duration - 1e-4, time));
    for (const entry of entries) {
      const local = t - entry.start;
      const on = local >= 0 && local < entry.visible;
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
  }

  return {
    duration,
    seek,
    scenes: entries.map(({ id, start, duration: length }) => ({ id, start, duration: length })),
  };
}

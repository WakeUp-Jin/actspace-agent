// 真实界面功能块的聚焦：先看全貌，再依次把截图放大到每个要点对应的区域。
// 悬停或键盘进入某个要点就停在那里，离开后接着轮播；点按（触屏）切换固定。
import { createClock, playWhenVisible } from './home-stage';

type Rect = [number, number, number, number];

const HOLD = 3600;
const OVERVIEW = 1600;
const MAX_ZOOM = 1.7;

export function initializeFocusStages() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const root of document.querySelectorAll<HTMLElement>('[data-focus-stage]')) {
    const section = root.closest('section')!;
    const view = root.querySelector<HTMLElement>('[data-focus-view]')!;
    const canvas = root.querySelector<HTMLElement>('[data-focus-canvas]')!;
    const img = canvas.querySelector('img')!;
    const ring = root.querySelector<HTMLElement>('[data-focus-ring]')!;
    const label = root.querySelector<HTMLElement>('[data-focus-label]')!;
    const rects = JSON.parse(root.dataset.points ?? '[]') as Rect[];
    const buttons = [...section.querySelectorAll<HTMLButtonElement>('[data-focus-point]')];
    const titles = buttons.map((button, index) => `0${index + 1} ${button.querySelector('b')?.textContent ?? ''}`);
    const clock = createClock();
    let active = -1;
    let pinned = -1;
    let hovered = -1;
    let playing = false;

    // 全貌：宽度铺满、从顶部开始；图比窗口矮时放大到铺满高度。
    // 聚焦框画在截图画布里，用百分比定位，跟着画布一起缩放平移。
    // 画布按最大放大倍数排版，平时缩小显示：放大时是缩回原尺寸，浏览器不会拿
    // 小尺寸的栅格去拉伸，字不会糊。放大倍数也不超过截图本身的分辨率。
    canvas.style.width = `${MAX_ZOOM * 100}%`;
    const sourceWidth = Number(root.dataset.sourceWidth) || Infinity;
    const layout = (index: number) => {
      const vw = view.clientWidth;
      const vh = view.clientHeight;
      const ih = img.clientHeight / MAX_ZOOM;
      if (!vw || !ih) return;
      const base = Math.max(1, vh / ih);
      const maxZoom = Math.max(base, Math.min(MAX_ZOOM, sourceWidth / (vw * Math.min(2, devicePixelRatio || 1))));
      let scale = base;
      let x = (vw - vw * scale) / 2;
      let y = 0;
      if (index >= 0) {
        const [rx, ry, rw, rh] = rects[index];
        scale = Math.min(maxZoom, Math.max(base, Math.min(0.9 / rw, (vh * 0.8) / (rh * ih))));
        x = vw / 2 - (rx + rw / 2) * vw * scale;
        y = vh / 2 - (ry + rh / 2) * ih * scale;
        x = Math.min(0, Math.max(vw - vw * scale, x));
        y = Math.min(0, Math.max(vh - ih * scale, y));
        ring.style.left = `${rx * 100}%`;
        ring.style.top = `${ry * 100}%`;
        ring.style.width = `${rw * 100}%`;
        ring.style.height = `${rh * 100}%`;
        label.textContent = titles[index];
        // 区域贴着窗口顶部时，标签放到框里面。
        ring.classList.toggle('label-in', y + ry * ih * scale < 30);
      }
      canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale / MAX_ZOOM})`;
      canvas.style.setProperty('--zoom', String(scale / MAX_ZOOM));
      ring.classList.toggle('on', index >= 0);
    };

    const show = (index: number) => {
      active = index;
      buttons.forEach((button, i) => {
        button.classList.toggle('on', i === index);
        button.setAttribute('aria-pressed', String(i === pinned));
      });
      section.classList.toggle('focus-auto', playing && pinned < 0 && hovered < 0 && index >= 0);
      layout(index);
    };

    const cycle = (from: number) => {
      clock.stop();
      if (!playing || pinned >= 0 || hovered >= 0) return;
      if (from >= rects.length) {
        show(-1);
        clock.at(OVERVIEW, () => cycle(0));
        return;
      }
      show(from);
      clock.at(HOLD, () => cycle(from + 1));
    };

    const hold = () => {
      const index = pinned >= 0 ? pinned : hovered;
      clock.stop();
      if (index >= 0) show(index);
      else if (playing) clock.at(900, () => cycle(active + 1));
      else show(-1);
    };

    buttons.forEach((button, index) => {
      button.addEventListener('mouseenter', () => { hovered = index; hold(); });
      button.addEventListener('mouseleave', () => { hovered = -1; hold(); });
      button.addEventListener('focus', () => { if (button.matches(':focus-visible')) { hovered = index; hold(); } });
      button.addEventListener('blur', () => { if (hovered === index) { hovered = -1; hold(); } });
      button.addEventListener('click', () => { pinned = pinned === index ? -1 : index; hold(); });
    });

    new ResizeObserver(() => layout(active)).observe(view);
    new ResizeObserver(() => layout(active)).observe(img);
    show(-1);
    if (reduced) { root.classList.add('still'); continue; }
    playWhenVisible(root, () => { playing = true; clock.at(OVERVIEW, () => cycle(0)); }, () => {
      playing = false;
      clock.stop();
      if (pinned < 0 && hovered < 0) show(-1);
    });
  }
}

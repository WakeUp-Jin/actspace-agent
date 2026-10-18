// 示意舞台的分步循环：按 data-loop 里的「步骤:毫秒」依次给窗口设置 data-p，
// 一轮 data-period 毫秒。只在可见时播放；减少动态效果时停在最后一步。
import { createClock, playWhenVisible } from './home-stage';

export function initializeLoops() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-loop]')) {
    const win = root.querySelector<HTMLElement>('.win')!;
    const steps = (root.dataset.loop ?? '').split(',').map((pair) => pair.split(':').map(Number) as [number, number]);
    const period = Number(root.dataset.period ?? 9000);
    const last = String(steps.at(-1)?.[0] ?? 0);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { win.dataset.p = last; continue; }
    const clock = createClock();
    const run = () => {
      clock.stop();
      for (const [step, at] of steps) clock.at(at, () => { win.dataset.p = String(step); });
      clock.at(period, run);
    };
    playWhenVisible(root, run, () => { clock.stop(); win.dataset.p = last; });
  }
}

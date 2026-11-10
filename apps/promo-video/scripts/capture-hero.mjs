/**
 * 把官网首屏的桌面端演示录成逐帧图片，供宣传片当作「产品在工作」的镜头。
 *
 * 演示由定时器和 CSS 动画驱动。这里不按真实时间录屏，而是在页面里接管时钟：
 * 定时器、requestAnimationFrame 和所有动画都只在「下一帧」被调用时前进 1/fps 秒，
 * 所以录出来的画面和机器快慢无关，重录结果一致。
 *
 * 用法：node scripts/capture-hero.mjs [--seconds 21] [--fps 30] [--scale 2]
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { launchChrome } from "./lib/chrome.mjs";
import { ensureSite, packageRoot, startComposition } from "./lib/servers.mjs";

const { values } = parseArgs({
  options: {
    seconds: { type: "string", default: "21" },
    fps: { type: "string", default: "30" },
    scale: { type: "string", default: "2" },
  },
});
const fps = Number(values.fps);
const seconds = Number(values.seconds);
const scale = Number(values.scale);
const frameMs = 1000 / fps;
const frameCount = Math.round(seconds * fps);
const outDir = join(packageRoot, ".cache", "hero");

// 录制时把首屏舞台钉满整个视口，整屏截图就是成片要用的 16:9 画面。
// 宽度要大于 1400px，否则官网会切到隐藏侧栏的窄屏布局。
const VIEWPORT = { width: 1440, height: 810 };

const pageHook = (fontsUrl) => `
(() => {
  const native = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    now: performance.now.bind(performance),
    scrollTo: Element.prototype.scrollTo,
  };

  // 接管前一切照常运行（页面要先正常加载）；接管后新建的定时器只跟着虚拟时钟走。
  let frozen = false;
  let clock = 0;
  let nextId = 1e9;
  const timers = new Map();
  let frameCallbacks = new Map();

  window.setTimeout = (callback, delay = 0, ...args) => {
    if (!frozen) return native.setTimeout(callback, delay, ...args);
    nextId += 1;
    timers.set(nextId, { due: clock + Math.max(0, Number(delay) || 0), run: () => callback(...args) });
    return nextId;
  };
  window.clearTimeout = (id) => {
    if (!timers.delete(id)) native.clearTimeout(id);
  };
  window.requestAnimationFrame = (callback) => {
    if (!frozen) return native.requestAnimationFrame(callback);
    nextId += 1;
    frameCallbacks.set(nextId, callback);
    return nextId;
  };
  window.cancelAnimationFrame = (id) => {
    if (!frameCallbacks.delete(id)) native.cancelAnimationFrame(id);
  };
  performance.now = () => (frozen ? clock : native.now());

  // 平滑滚动由浏览器自己计时，这里改成每帧向底部靠近一段。
  const following = new Set();
  Element.prototype.scrollTo = function (...args) {
    const options = args[0];
    if (frozen && options && typeof options === "object" && options.behavior === "smooth") {
      following.add(this);
      return;
    }
    following.delete(this);
    return native.scrollTo.apply(this, args);
  };

  const seen = new WeakMap();
  const finished = new WeakSet();
  function syncAnimations() {
    for (const animation of document.getAnimations()) {
      // 播完后保持末态的动画还会留在列表里，不能当成新动画重放。
      if (finished.has(animation)) continue;
      if (!seen.has(animation)) seen.set(animation, clock);
      const local = clock - seen.get(animation);
      const end = animation.effect?.getComputedTiming?.().endTime ?? Infinity;
      if (Number.isFinite(end) && local >= end) {
        animation.finish();
        finished.add(animation);
        continue;
      }
      animation.pause();
      animation.currentTime = local;
    }
  }

  window.__freeze = () => {
    frozen = true;
    clock = 0;
    syncAnimations();
  };

  /** 前进到 now（毫秒）：依次跑到期的定时器、这一帧的 rAF，再把动画对齐到这个时刻。 */
  window.__advance = (now) => {
    for (;;) {
      let nextTimer = null;
      for (const [id, timer] of timers) {
        if (timer.due <= now && (!nextTimer || timer.due < nextTimer.timer.due)) nextTimer = { id, timer };
      }
      if (!nextTimer) break;
      timers.delete(nextTimer.id);
      clock = nextTimer.timer.due;
      nextTimer.timer.run();
    }
    clock = now;
    const callbacks = frameCallbacks;
    frameCallbacks = new Map();
    for (const callback of callbacks.values()) callback(clock);
    syncAnimations();
    for (const element of following) {
      const goal = element.scrollHeight - element.clientHeight;
      const gap = goal - element.scrollTop;
      element.scrollTop = Math.abs(gap) < 0.5 ? goal : element.scrollTop + gap * 0.18;
    }
    return document.querySelector('[data-h="feed"]')?.childElementCount ?? 0;
  };

  window.__prepareStage = async () => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = ${JSON.stringify(fontsUrl)};
    document.head.append(link);
    await new Promise((resolve, reject) => {
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", () => reject(new Error("字体样式加载失败")), { once: true });
    });
    const style = document.createElement("style");
    style.textContent = [
      ':root {',
      '  --site-font-sans: "Noto Sans SC Variable", sans-serif;',
      '  --site-font-display: "Noto Serif SC Variable", serif;',
      '  --site-font-mono: "JetBrains Mono Variable", "Noto Sans SC Variable", monospace;',
      '}',
      // 圆角和取景留给宣传片自己处理。
      '[data-hero-stage] { position: fixed !important; inset: 0 !important; z-index: 2147483000; border-radius: 0 !important; }',
      'html { overflow: hidden; }',
      // 「悬停看说明 · 点击开关后重跑」是给网页访客的操作提示，在视频里没有意义。
      '[data-hero-stage] .count small { display: none !important; }',
    ].join("\\n");
    document.head.append(style);
    // 演示里的文字是脚本后填的，等不到「用到才加载」，这里把字体分片一次载齐。
    await Promise.all([...document.fonts].filter((face) => /Noto|JetBrains/.test(face.family)).map((face) => face.load()));
    await document.fonts.ready;

    const stage = document.querySelector("[data-hero-stage]");
    if (!stage) throw new Error("官网首页没有找到 [data-hero-stage]");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const box = stage.getBoundingClientRect();
    const relative = (selector) => {
      const rect = stage.querySelector(selector)?.getBoundingClientRect();
      if (!rect) return null;
      return [(rect.x - box.x) / box.width, (rect.y - box.y) / box.height, rect.width / box.width, rect.height / box.height].map((value) => Number(value.toFixed(4)));
    };
    return {
      size: [box.width, box.height],
      regions: {
        window: relative("[data-hero-window]"),
        conversation: relative(".conv"),
        tools: relative(".g-tools"),
        behaviors: relative(".g-beh"),
        contexts: relative(".g-ctx"),
      },
    };
  };
})();
`;

const composition = await startComposition();
const site = await ensureSite();
const chrome = await launchChrome(VIEWPORT);

try {
  const page = await chrome.newPage({ deviceScaleFactor: scale });
  page.onConsole((type, text) => process.stderr.write(`[官网页面 ${type}] ${text.slice(0, 400)}\n`));
  await page.call("Page.addScriptToEvaluateOnNewDocument", {
    source: pageHook(`${composition.url}src/styles/fonts.css`),
  });
  await page.goto(site.url);
  const { size, regions } = await page.evaluate("window.__prepareStage()");

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // 接管时钟后关掉再打开一个插件，演示会从头重播，重播的每一步都落在虚拟时钟上。
  await page.evaluate(`(() => {
    window.__freeze();
    const toggle = document.querySelector('[data-hero-stage] .m[data-m="read"]');
    toggle.click();
    toggle.click();
  })()`);

  let tick = 0;
  const step = () => {
    tick += 1;
    return page.evaluate(`window.__advance(${tick * frameMs})`);
  };

  // 重播要等一小段延时才清空上一轮的内容；这段不录，从清空后的第一帧开始。
  const leftover = await step();
  for (let waited = 0; ; waited += 1) {
    if ((await step()) < leftover) break;
    if (waited > 2 * fps) throw new Error("演示没有按预期重播：2 秒内对话区没有清空");
  }

  const startedAt = Date.now();
  for (let frame = 0; frame < frameCount; frame += 1) {
    await step();
    const image = await page.screenshot({ format: "jpeg", quality: 92 });
    await writeFile(join(outDir, `f${String(frame).padStart(4, "0")}.jpg`), image);
    if (frame % fps === 0) process.stdout.write(`\r录制首屏演示 ${frame}/${frameCount}`);
  }

  const meta = {
    fps,
    frames: frameCount,
    width: Math.round(size[0] * scale),
    height: Math.round(size[1] * scale),
    regions,
  };
  await writeFile(join(outDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  process.stdout.write(
    `\r录制完成：${frameCount} 帧，${meta.width}×${meta.height}，用时 ${((Date.now() - startedAt) / 1000).toFixed(1)} 秒\n`,
  );
} finally {
  await chrome.close();
  await site.close();
  await composition.close();
}

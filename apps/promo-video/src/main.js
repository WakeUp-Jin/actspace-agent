import "./styles/fonts.css";
import "./styles/base.css";
import "./styles/scenes.css";
import "./styles/player.css";
import { FPS, HEIGHT, scenes, WIDTH } from "./film.js";
import { createTimeline } from "./timeline.js";

const params = new URLSearchParams(location.search);
const rendering = params.has("render");
const film = document.querySelector("#film");

/** 录好的首屏演示帧序列；没录过时对应分镜会显示提示，其余分镜照常。 */
async function loadFootage() {
  try {
    const response = await fetch("/hero/meta.json");
    if (!response.ok) return {};
    const meta = await response.json();
    return { hero: { base: "/hero/", fps: meta.fps, frames: meta.frames } };
  } catch {
    return {};
  }
}

/** 中文字体按 unicode-range 切成了上百片，等它们全部就绪再出第一帧，否则前几帧会用回退字体。 */
async function loadFonts() {
  const faces = [...document.fonts].filter((face) => /Noto|JetBrains/.test(face.family));
  await Promise.all(faces.map((face) => face.load().catch(() => {})));
  await document.fonts.ready;
}

async function decodeImages() {
  // 分镜默认是 display:none，里面的图不会自己加载；逐个解码一遍，seek 到那一帧时才不会空着。
  const images = [...film.querySelectorAll("img")].filter((image) => image.getAttribute("src"));
  await Promise.all(images.map((image) => image.decode().catch(() => {})));
}

function startPreview(timeline) {
  const viewport = document.querySelector("#viewport");
  const player = document.querySelector("#player");
  const play = document.querySelector("#play");
  const scrub = document.querySelector("#scrub");
  const clock = document.querySelector("#clock");
  const sceneName = document.querySelector("#scene-name");
  const audio = new Audio("/music.wav");
  audio.preload = "auto";

  document.body.classList.add("is-preview");
  player.hidden = false;
  scrub.max = String(timeline.duration);

  const fit = () => {
    const scale = Math.min(viewport.clientWidth / WIDTH, viewport.clientHeight / HEIGHT) * 0.96;
    film.style.setProperty("--fit", scale.toFixed(4));
  };
  new ResizeObserver(fit).observe(viewport);
  fit();

  let time = Number(params.get("t") ?? 0);
  let playing = false;
  let last = 0;

  const show = async () => {
    await timeline.seek(time);
    scrub.value = String(time);
    const minutes = Math.floor(time / 60);
    clock.value = `${minutes}:${(time - minutes * 60).toFixed(1).padStart(4, "0")}`;
    sceneName.value = timeline.scenes.findLast((scene) => time >= scene.start)?.id ?? "";
  };

  const setPlaying = (next) => {
    playing = next;
    play.textContent = playing ? "暂停" : "播放";
    if (!playing) {
      audio.pause();
      return;
    }
    if (time >= timeline.duration - 0.05) time = 0;
    audio.currentTime = time;
    audio.play().catch(() => {});
    last = performance.now();
    requestAnimationFrame(tick);
  };

  const tick = (now) => {
    if (!playing) return;
    time = Math.min(timeline.duration, time + (now - last) / 1000);
    last = now;
    void show();
    if (time >= timeline.duration) setPlaying(false);
    else requestAnimationFrame(tick);
  };

  play.addEventListener("click", () => setPlaying(!playing));
  scrub.addEventListener("input", () => {
    time = Number(scrub.value);
    if (playing) audio.currentTime = time;
    void show();
  });
  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || event.target === scrub) return;
    event.preventDefault();
    setPlaying(!playing);
  });

  return show();
}

const ready = (async () => {
  const [footage] = await Promise.all([loadFootage(), loadFonts()]);
  const timeline = createTimeline(film, scenes, { footage });
  await decodeImages();
  if (rendering) await timeline.seek(0);
  else await startPreview(timeline);
  return timeline;
})();

// 渲染脚本的入口：等 ready，再按帧调用 seek。
window.__promo = {
  fps: FPS,
  width: WIDTH,
  height: HEIGHT,
  ready: ready.then((timeline) => ({ duration: timeline.duration, scenes: timeline.scenes })),
  seek: async (time) => (await ready).seek(time),
};

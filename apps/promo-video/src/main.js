import "./styles/fonts.css";
import "./styles/base.css";
import "./styles/scenes.css";
import "./styles/cards.css";
import "./styles/player.css";
import { FPS, HEIGHT, scenes, WIDTH } from "./film.js";
import { soundtrack } from "./soundtrack.js";
import { createTimeline } from "./timeline.js";

const params = new URLSearchParams(location.search);
const rendering = params.has("render");
const film = document.querySelector("#film");

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
  // 配乐由 `pnpm music` 下载到 .cache/music/；没有下载时预览照常播放，只是没有声音。
  const audio = new Audio(`/${soundtrack.file}`);
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

  const show = () => {
    timeline.seek(time);
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
    audio.currentTime = soundtrack.start + time;
    audio.play().catch(() => {});
    last = performance.now();
    requestAnimationFrame(tick);
  };

  const tick = (now) => {
    if (!playing) return;
    time = Math.min(timeline.duration, time + (now - last) / 1000);
    last = now;
    show();
    if (time >= timeline.duration) setPlaying(false);
    else requestAnimationFrame(tick);
  };

  play.addEventListener("click", () => setPlaying(!playing));
  scrub.addEventListener("input", () => {
    time = Number(scrub.value);
    if (playing) audio.currentTime = soundtrack.start + time;
    show();
  });
  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || event.target === scrub) return;
    event.preventDefault();
    setPlaying(!playing);
  });

  show();
}

const ready = (async () => {
  await loadFonts();
  const timeline = createTimeline(film, scenes);
  await decodeImages();
  if (rendering) timeline.seek(0);
  else startPreview(timeline);
  return timeline;
})();

ready.catch((error) => {
  film.innerHTML = `<p class="film-error">${error.message}</p>`;
});

// 渲染脚本的入口：等 ready，再按帧调用 seek。
window.__promo = {
  fps: FPS,
  width: WIDTH,
  height: HEIGHT,
  ready: ready.then((timeline) => ({ duration: timeline.duration, scenes: timeline.scenes })),
  seek: async (time) => (await ready).seek(time),
};

import "./styles/fonts.css";
import "./styles/base.css";
import "./styles/scenes.css";
import "./styles/motion.css";
import "./styles/short.css";
import "./styles/player.css";
import { DEFAULT_FILM, FPS, films, HEIGHT, WIDTH } from "./films/index.js";
import { createTimeline } from "./timeline.js";

const params = new URLSearchParams(location.search);
const rendering = params.has("render");
const film = document.querySelector("#film");
const filmId = params.get("film") ?? DEFAULT_FILM;

/** capture:ui 截下来的产品画面和各个按钮的位置；只有用到真实界面的版本才需要。 */
async function loadUi() {
  const response = await fetch("/ui/meta.json");
  // 文件不存在时开发服务器会回退到首页 HTML，所以还要看内容类型。
  if (!response.ok || !response.headers.get("content-type")?.includes("json")) {
    throw new Error("还没有截取产品画面。先运行：pnpm --filter @actspace/promo-video capture:ui");
  }
  return response.json();
}

/** 中文字体按 unicode-range 切成了上百片，等它们全部就绪再出第一帧，否则前几帧会用回退字体。 */
async function loadFonts() {
  const faces = [...document.fonts].filter((face) => /Noto|JetBrains/.test(face.family));
  await Promise.all(faces.map((face) => face.load().catch(() => {})));
  await document.fonts.ready;
}

async function decodeImages() {
  // 分镜默认是 display:none，里面的图不会自己加载；逐个解码一遍，seek 到那一帧时才不会空着。
  // 按时刻切换的整幅画面（data-at）由时间线在换上来时解码，不在这里一次占满内存。
  const images = [...film.querySelectorAll("img:not([data-at])")].filter((image) => image.getAttribute("src"));
  await Promise.all(images.map((image) => image.decode().catch(() => {})));
}

function startPreview(timeline) {
  const viewport = document.querySelector("#viewport");
  const player = document.querySelector("#player");
  const play = document.querySelector("#play");
  const scrub = document.querySelector("#scrub");
  const clock = document.querySelector("#clock");
  const sceneName = document.querySelector("#scene-name");
  const audio = new Audio(`/music-${filmId}.wav`);
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
  const definition = films[filmId];
  if (!definition) throw new Error(`没有「${filmId}」这个版本。可选：${Object.keys(films).join("、")}`);
  const [ui] = await Promise.all([definition.needs === "ui" ? loadUi() : null, loadFonts()]);
  const timeline = createTimeline(film, definition.scenes({ ui }));
  await decodeImages();
  if (rendering) await timeline.seek(0);
  else await startPreview(timeline);
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

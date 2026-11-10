/**
 * 把宣传片的一个版本逐帧渲染成 MP4。
 *
 *   node scripts/render.mjs --film real        渲染「真实界面」版到 out/actspace-real.mp4
 *   node scripts/render.mjs --film motion      其它版本见 src/films/index.js
 *   node scripts/render.mjs --no-audio         不合成、不混入配乐
 *   node scripts/render.mjs --from 20 --to 30  只渲染一段，调某个分镜时用
 *   node scripts/render.mjs --stills 3,12.5    只导出这些时刻的 PNG 到 out/stills/<版本>/
 *
 * 做法：无头 Chrome 打开合成页，每一帧先 seek 到对应时刻再截图，图片顺序喂给 ffmpeg。
 * 画面完全由时刻决定，所以渲染多慢都不会掉帧。
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { launchChrome } from "./lib/chrome.mjs";
import { composeMusic, encodeWav, scoreFor } from "./lib/music.mjs";
import { packageRoot, startComposition } from "./lib/servers.mjs";

const { values: options } = parseArgs({
  options: {
    film: { type: "string", default: "real" },
    out: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    stills: { type: "string" },
    "no-audio": { type: "boolean", default: false },
  },
});

const composition = await startComposition();
const chrome = await launchChrome({ width: 1920, height: 1080 });

try {
  const page = await chrome.newPage({ deviceScaleFactor: 1 });
  page.onConsole((type, text) => {
    if (type === "error" || type === "warning") console.warn(`[页面 ${type}] ${text}`);
  });
  await page.goto(`${composition.url}?render=1&film=${encodeURIComponent(options.film)}`);
  const film = await page.evaluate("window.__promo.ready.then((info) => ({ ...info, fps: window.__promo.fps }))");
  console.log(`「${options.film}」版 ${film.duration.toFixed(2)} 秒，${film.fps} 帧/秒，${film.scenes.length} 个分镜`);
  for (const scene of film.scenes) console.log(`  ${scene.start.toFixed(2).padStart(6)} 秒  ${scene.id}`);

  const frameAt = async (time) => {
    await page.evaluate(`window.__promo.seek(${time})`);
    return page.screenshot({ format: "png" });
  };

  if (options.stills) {
    const directory = resolve(packageRoot, "out/stills", options.film);
    await mkdir(directory, { recursive: true });
    for (const value of options.stills.split(",")) {
      const time = Number(value);
      const file = resolve(directory, `t${time.toFixed(2).padStart(6, "0")}.png`);
      await writeFile(file, await frameAt(time));
      console.log(file);
    }
  } else {
    const from = Number(options.from ?? 0);
    const to = Math.min(film.duration, Number(options.to ?? film.duration));
    const first = Math.round(from * film.fps);
    const count = Math.round((to - from) * film.fps);
    const output = resolve(packageRoot, options.out ?? `out/actspace-${options.film}.mp4`);
    const music = resolve(packageRoot, `.cache/music-${options.film}.wav`);
    const withAudio = !options["no-audio"];
    if (withAudio) {
      // 配乐跟着分镜时刻走，所以每次渲染都按当前时间线重新合成；预览页也读这个文件。
      await mkdir(resolve(music, ".."), { recursive: true });
      await writeFile(music, encodeWav(composeMusic(scoreFor(film))));
    }
    await mkdir(resolve(output, ".."), { recursive: true });

    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-f",
        "image2pipe",
        "-framerate",
        String(film.fps),
        "-i",
        "-",
        ...(withAudio ? ["-ss", String(from), "-i", music] : []),
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "16",
        "-pix_fmt",
        "yuv420p",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-colorspace",
        "bt709",
        ...(withAudio ? ["-c:a", "aac", "-b:a", "192k"] : []),
        "-t",
        (count / film.fps).toFixed(3),
        "-movflags",
        "+faststart",
        output,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const finished = once(ffmpeg, "close");

    const startedAt = Date.now();
    for (let index = 0; index < count; index += 1) {
      const frame = await frameAt((first + index) / film.fps);
      if (!ffmpeg.stdin.write(frame)) await once(ffmpeg.stdin, "drain");
      if (index % 150 === 0 || index === count - 1) {
        const elapsed = (Date.now() - startedAt) / 1000;
        console.log(`帧 ${index + 1}/${count}，已用 ${elapsed.toFixed(0)} 秒`);
      }
    }
    ffmpeg.stdin.end();
    const [code] = await finished;
    if (code !== 0) throw new Error(`ffmpeg 退出码 ${code}`);
    console.log(`已输出 ${output}${withAudio ? "" : "（无声）"}`);
  }
} finally {
  await chrome.close();
  await composition.close();
}

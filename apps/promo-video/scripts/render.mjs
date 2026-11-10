/**
 * 把宣传片逐帧渲染成 MP4。
 *
 *   node scripts/render.mjs                    渲染整片到 out/actspace-promo.mp4
 *   node scripts/render.mjs --no-audio         不混入配乐
 *   node scripts/render.mjs --music a.mp3 --music-start 12   换一首曲子试听：从它的第 12 秒开始用
 *   node scripts/render.mjs --from 20 --to 30  只渲染一段，调某个分镜时用
 *   node scripts/render.mjs --stills 3,12.5    只导出这些时刻的 PNG 到 out/stills/
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
import { soundtrack } from "../src/soundtrack.js";
import { packageRoot, startComposition } from "./lib/servers.mjs";
import { audioArgs, ensureSoundtrack, measureLoudness } from "./lib/soundtrack.mjs";

const { values: options } = parseArgs({
  options: {
    out: { type: "string", default: "out/actspace-promo.mp4" },
    music: { type: "string" },
    "music-start": { type: "string" },
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
  await page.goto(`${composition.url}?render=1`);
  const film = await page.evaluate("window.__promo.ready.then((info) => ({ ...info, fps: window.__promo.fps }))");
  console.log(`成片 ${film.duration.toFixed(2)} 秒，${film.fps} 帧/秒，${film.scenes.length} 个分镜`);
  for (const scene of film.scenes) console.log(`  ${scene.start.toFixed(2).padStart(6)} 秒  ${scene.id}`);

  const frameAt = async (time) => {
    await page.evaluate(`window.__promo.seek(${time})`);
    return page.screenshot({ format: "png" });
  };

  if (options.stills) {
    const directory = resolve(packageRoot, "out/stills");
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
    const seconds = count / film.fps;
    const output = resolve(packageRoot, options.out);
    let audio = { input: [], output: [] };
    if (!options["no-audio"]) {
      // 默认用 src/soundtrack.js 里写的那首；--music 换成本机的另一个文件。
      const file = options.music ? resolve(options.music) : await ensureSoundtrack();
      const offset = Number(options["music-start"] ?? (options.music ? 0 : soundtrack.start)) + from;
      audio = audioArgs({ file, offset, seconds, loudness: await measureLoudness(file, { offset, seconds }) });
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
        ...audio.input,
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
        ...audio.output,
        "-t",
        seconds.toFixed(3),
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
    console.log(`已输出 ${output}${options["no-audio"] ? "（无声）" : ""}`);
  }
} finally {
  await chrome.close();
  await composition.close();
}

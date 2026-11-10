/**
 * 把宣传片逐帧渲染成 MP4。
 *
 *   node scripts/render.mjs                    渲染整片到 out/actspace-promo.mp4
 *   node scripts/render.mjs --no-audio         不合成、不混入配乐
 *   node scripts/render.mjs --from 20 --to 30  只渲染一段，调某个分镜时用
 *   node scripts/render.mjs --stills 3,12.5    只导出这些时刻的 PNG 到 out/stills/
 *
 * 做法：无头 Chrome 打开合成页，每一帧先 seek 到对应时刻再截图，图片顺序喂给 ffmpeg。
 * 画面完全由时刻决定，所以渲染多慢都不会掉帧。
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { launchChrome } from "./lib/chrome.mjs";
import { composeMusic, encodeWav, scoreFor } from "./lib/music.mjs";
import { packageRoot, startComposition } from "./lib/servers.mjs";

const { values: options } = parseArgs({
  options: {
    out: { type: "string", default: "out/actspace-promo.mp4" },
    from: { type: "string" },
    to: { type: "string" },
    stills: { type: "string" },
    "no-audio": { type: "boolean", default: false },
  },
});

if (!existsSync(resolve(packageRoot, ".cache/hero/meta.json"))) {
  // 少了这段素材，「一次任务」分镜只会显示一句提示，不该悄悄编进成片。
  throw new Error("还没有录制首屏演示。先运行：pnpm --filter @actspace/promo-video capture:hero");
}

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
    const output = resolve(packageRoot, options.out);
    const music = resolve(packageRoot, ".cache/music.wav");
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

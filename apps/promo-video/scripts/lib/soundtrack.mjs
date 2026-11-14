/** 配乐：把片子用的那首曲子下载到 .cache/，并算出混进成片时 ffmpeg 要用的参数。 */
import { execFile } from "node:child_process";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { DEFAULT_FILM, filmById } from "../../src/films.js";

const run = promisify(execFile);
const cacheRoot = fileURLToPath(new URL("../../.cache/", import.meta.url));

/** 成片的响度目标（LUFS）。没有旁白，配乐就是全部声音，取流媒体常用的 -16。 */
const TARGET_LUFS = -16;
const FADE_IN = 0.3;
const FADE_OUT = 3;

/**
 * 曲子在本机的路径；还没有就下载一次。
 * @param {{ title: string, artist: string, license: string, page: string, url: string, file: string }} soundtrack 片子的配乐（src/films.js）
 */
export async function ensureSoundtrack(soundtrack) {
  const file = resolve(cacheRoot, soundtrack.file);
  try {
    await access(file);
    return file;
  } catch {
    // 还没下载过。
  }
  console.log(`下载配乐《${soundtrack.title}》（${soundtrack.artist}，${soundtrack.license}）…`);
  // 这个站点会拒绝不带浏览器 User-Agent 的请求。
  const response = await fetch(soundtrack.url, { headers: { "User-Agent": "Mozilla/5.0 (actspace promo-video)" } });
  if (!response.ok) throw new Error(`配乐下载失败（HTTP ${response.status}）：${soundtrack.url}\n也可以手动从 ${soundtrack.page} 下载，存成 ${file}`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.part`, Buffer.from(await response.arrayBuffer()));
  await rename(`${file}.part`, file);
  return file;
}

/** 量出这一段的综合响度（LUFS），用来算一个固定的增益——不用动态压缩，曲子本来的起伏原样保留。 */
export async function measureLoudness(file, { offset, seconds }) {
  const { stderr } = await run("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-ss",
    offset.toFixed(3),
    "-t",
    seconds.toFixed(3),
    "-i",
    file,
    "-af",
    "loudnorm=print_format=json",
    "-f",
    "null",
    "-",
  ]);
  const match = stderr.match(/"input_i"\s*:\s*"(-?[\d.]+)"/);
  if (!match) throw new Error(`量不出配乐的响度：${file}`);
  return Number(match[1]);
}

/**
 * 混音参数：从曲子的 offset 秒取 seconds 秒，调到目标响度，头尾淡入淡出。
 * fadeIn：从曲子中段切入的片子要淡入得长一点，默认 0.3 秒；从曲子第一个音用起的片子给 0，不淡入。
 * @returns {{ input: string[], output: string[] }} 分别接在 ffmpeg 的输入段和输出段
 */
export function audioArgs({ file, offset, seconds, loudness, fadeIn = FADE_IN }) {
  const gain = TARGET_LUFS - loudness;
  const fadeOut = Math.min(FADE_OUT, seconds / 2);
  const filters = [
    `volume=${gain.toFixed(2)}dB`,
    "alimiter=limit=0.84:level=false",
    // ffmpeg 把 afade 的 d=0 当成「没写」，会按默认淡入 1 秒，所以不淡入时不能带这个滤镜。
    ...(fadeIn > 0 ? [`afade=t=in:d=${fadeIn}`] : []),
    `afade=t=out:st=${(seconds - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`,
  ];
  return {
    input: ["-ss", offset.toFixed(3), "-t", seconds.toFixed(3), "-i", file],
    output: ["-af", filters.join(","), "-ar", "48000", "-c:a", "aac", "-b:a", "192k"],
  };
}

/** 直接运行这个文件：只下载配乐，给预览页用。`--film <id>` 下载另一部片子的那首。 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { film: { type: "string", default: DEFAULT_FILM } } });
  console.log(await ensureSoundtrack(filmById(values.film).soundtrack));
}

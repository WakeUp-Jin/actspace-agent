import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const NONO_VERSION_FILE = join(root, "scripts", "sandbox", "nono-version.json");
const CACHE_DIR = join(root, ".cache", "sandbox", "nono");

/** `<process.platform>-<process.arch>`, the key used in nono-version.json and dist/sandbox-components. */
export function nonoTarget(platform = process.platform, arch = process.arch) { return `${platform}-${arch}`; }

export async function readNonoVersion(file = NONO_VERSION_FILE) {
  const config = JSON.parse(await readFile(file, "utf8"));
  if (typeof config.version !== "string" || typeof config.releaseUrl !== "string" || !config.assets || typeof config.assets !== "object") {
    throw new Error("nono-version.json is invalid.");
  }
  for (const [target, asset] of Object.entries(config.assets)) {
    if (typeof asset?.file !== "string" || asset.file.includes("/") || !/^[a-f0-9]{64}$/.test(asset?.sha256 ?? "")) throw new Error(`nono-version.json has an invalid asset for ${target}.`);
  }
  return config;
}

export async function sha256(file) { return createHash("sha256").update(await readFile(file)).digest("hex"); }

/**
 * Installs the pinned nono for `target` at `out`. The archive is cached by file name and re-verified on every use;
 * a download whose hash does not match is deleted and the call fails.
 */
export async function fetchNono({ target, out, config, cacheDir = CACHE_DIR, download = curlDownload }) {
  const asset = config.assets[target];
  if (!asset) throw new Error(`No pinned nono build for ${target}.`);
  const archive = join(cacheDir, asset.file);
  if (await sha256(archive).catch(() => null) !== asset.sha256) {
    await rm(archive, { force: true });
    await mkdir(cacheDir, { recursive: true });
    const partial = `${archive}.partial`;
    await rm(partial, { force: true });
    await download(`${config.releaseUrl}/${asset.file}`, partial);
    const actual = await sha256(partial);
    if (actual !== asset.sha256) {
      await rm(partial, { force: true });
      throw new Error(`nono archive hash mismatch for ${asset.file}: expected ${asset.sha256}, got ${actual}.`);
    }
    await rename(partial, archive);
  }
  const work = await mkdtemp(join(tmpdir(), "actspace-nono-"));
  try {
    execFileSync("tar", ["-xzf", archive, "-C", work, "nono"]);
    await mkdir(dirname(out), { recursive: true });
    await copyFile(join(work, "nono"), out);
    await chmod(out, 0o755);
  } finally { await rm(work, { recursive: true, force: true }); }
  return { target, out, version: config.version };
}

/** curl honours https_proxy, which Node's fetch does not. */
function curlDownload(url, file) { execFileSync("curl", ["-fsSL", "--retry", "3", "-o", file, url], { stdio: "inherit" }); }

export function parseArgs(argv) {
  const options = { all: false, target: undefined, out: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") options.all = true;
    else if (arg === "--target" || arg === "--out") {
      const value = argv[++index];
      if (!value) throw new Error(`${arg} needs a value.`);
      options[arg.slice(2)] = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.all && (options.target || options.out)) throw new Error("--all cannot be combined with --target or --out.");
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  const config = await readNonoVersion();
  const targets = options.all ? Object.keys(config.assets) : [options.target ?? nonoTarget()];
  for (const target of targets) {
    const out = resolve(options.out ?? join(root, "dist", "sandbox-components", target, "nono"));
    await fetchNono({ target, out, config });
    console.log(`nono ${config.version} (${target}) -> ${out}`);
  }
}

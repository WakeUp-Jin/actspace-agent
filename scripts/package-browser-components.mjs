import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyBrowserComponents } from "./verify-browser-components.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const destination = resolve(process.argv[2] ?? join(root, "dist", "browser-components"));
if (destination !== resolve(root, "dist", "browser-components") && !/^browser-components(-[a-z0-9]+)?$/.test(destination.split("/").at(-1) ?? "") ||
    !destination.startsWith(resolve(root, "dist") + "/")) {
  throw new Error("Browser component output must be a dedicated browser-components directory under dist.");
}
const hostSource = join(root, "browser-bridge", "apps", "cli");
const extensionSource = join(root, "browser-bridge", "apps", "chrome-extension");
const host = join(destination, "bin", "abb");
const extension = join(destination, "extension");

await rm(destination, { recursive: true, force: true });
await mkdir(join(destination, "bin"), { recursive: true });
execFileSync("go", ["build", "-o", host, "."], { cwd: hostSource, stdio: "inherit" });
if (process.platform === "darwin") {
  if (process.env.ACTSPACE_MAC_CODESIGN_IDENTITY) {
    execFileSync("codesign", ["--force", "--options", "runtime", "--timestamp", "--sign", process.env.ACTSPACE_MAC_CODESIGN_IDENTITY, host], { stdio: "inherit" });
  } else if (["1", "true", "yes", "on"].includes((process.env.ACTSPACE_MAC_ADHOC_SIGN ?? "").toLowerCase())) {
    execFileSync("codesign", ["--force", "--sign", "-", "--timestamp=none", host], { stdio: "inherit" });
  }
}
await cp(extensionSource, extension, { recursive: true, filter: (path) => !path.endsWith(".DS_Store") });
const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"));
const files = {};
for (const file of await walk(destination)) {
  if (file === "manifest.json") continue;
  files[file] = createHash("sha256").update(await readFile(join(destination, file))).digest("hex");
}
await writeFile(join(destination, "manifest.json"), JSON.stringify({
  schemaVersion: 1,
  platform: process.platform,
  arch: process.arch,
  hostVersion: "0.1.0-dev",
  extensionVersion: manifest.version,
  protocolVersion: "0.2.0",
  files,
}, null, 2) + "\n");
await verifyBrowserComponents(destination);
console.log(destination);

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(relative(destination, path));
  }
  return result.sort();
}

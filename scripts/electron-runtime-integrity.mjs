import { spawnSync } from "node:child_process";
import { access, lstat, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";

export async function runtimeIntegrityIssue(sourceApp, devApp, identity) {
  // Compare structure and sizes, not signatures: this is a locally renamed/ad-hoc signed copy.
  // Do not follow framework symlinks while walking the source tree.
  async function check(relative) {
    const target = relative === "Contents/MacOS/Electron" ? `Contents/MacOS/${identity.executableName}` : relative;
    const source = join(sourceApp, relative); const cached = join(devApp, target);
    let expected; let actual;
    try { [expected, actual] = await Promise.all([lstat(source), lstat(cached)]); }
    catch { return `missing or unreadable ${target}`; }
    if (expected.isSymbolicLink()) {
      if (!actual.isSymbolicLink()) return `invalid link ${target}`;
      try {
        if (await readlink(source) !== await readlink(cached)) return `changed link ${target}`;
        await access(cached);
      } catch { return `broken link ${target}`; }
    } else if (expected.isDirectory()) {
      if (!actual.isDirectory()) return `invalid directory ${target}`;
      for (const child of await readdir(source)) {
        const issue = await check(relative ? `${relative}/${child}` : child);
        if (issue) return issue;
      }
    } else if (expected.isFile()) {
      if (!actual.isFile() || actual.size === 0 && expected.size > 0) return `empty or invalid file ${target}`;
      if ((expected.mode & 0o111) && !(actual.mode & 0o111)) return `not executable ${target}`;
      const rewritten = relative === "Contents/Info.plist" || relative === "Contents/MacOS/Electron" || relative.startsWith("Contents/_CodeSignature/");
      if (!rewritten && expected.size !== actual.size) return `truncated or changed file ${target}`;
    }
    return null;
  }
  const issue = await check("");
  if (issue) return issue;
  const result = spawnSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", join(devApp, "Contents/Info.plist")], { encoding: "utf8", timeout: 5_000 });
  if (result.status !== 0) return "invalid Contents/Info.plist";
  try {
    const plist = JSON.parse(result.stdout);
    if (plist.CFBundleExecutable !== identity.executableName || plist.CFBundleIdentifier !== identity.appId) return "Info.plist identity mismatch";
  } catch { return "invalid Contents/Info.plist"; }
  return null;
}

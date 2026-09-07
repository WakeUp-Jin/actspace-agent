import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runtimeIntegrityIssue } from "../electron-runtime-integrity.mjs";

const macTest = (name, fn) => test(name, { skip: process.platform !== "darwin" }, fn);
const identity = { executableName: "ActspaceDev-test", appId: "com.actspace.test" };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "actspace-runtime-integrity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "Electron.app"); const cache = join(root, "Dev.app");
  for (const [app, executable, appId] of [[source, "Electron", "com.electron"], [cache, identity.executableName, identity.appId]]) {
    await mkdir(join(app, "Contents/MacOS"), { recursive: true });
    await mkdir(join(app, "Contents/Frameworks/Helper.app/Contents/MacOS"), { recursive: true });
    await writeFile(join(app, "Contents/MacOS", executable), "binary", { mode: 0o755 });
    await writeFile(join(app, "Contents/Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>${executable}</string><key>CFBundleIdentifier</key><string>${appId}</string></dict></plist>`);
    await writeFile(join(app, "Contents/Frameworks/Helper.app/Contents/MacOS/Helper"), "helper", { mode: 0o755 });
    await symlink("Helper.app", join(app, "Contents/Frameworks/Current"));
  }
  return { source, cache };
}
macTest("accepts a complete renamed bundle", async (t) => {
  const { source, cache } = await fixture(t);
  assert.equal(await runtimeIntegrityIssue(source, cache, identity), null);
});
macTest("rejects a surviving executable when Info.plist was removed", async (t) => {
  const { source, cache } = await fixture(t);
  await rm(join(cache, "Contents/Info.plist"));
  assert.match(await runtimeIntegrityIssue(source, cache, identity) ?? "", /Info.plist/);
});
macTest("rejects missing or truncated nested helpers and broken links", async (t) => {
  const { source, cache } = await fixture(t);
  const helper = join(cache, "Contents/Frameworks/Helper.app/Contents/MacOS/Helper");
  await rm(helper);
  assert.match(await runtimeIntegrityIssue(source, cache, identity) ?? "", /Helper/);
  await writeFile(helper, "", { mode: 0o755 });
  assert.match(await runtimeIntegrityIssue(source, cache, identity) ?? "", /Helper/);
  await writeFile(helper, "helper");
  await rm(join(cache, "Contents/Frameworks/Current"));
  await symlink("Missing.app", join(cache, "Contents/Frameworks/Current"));
  assert.match(await runtimeIntegrityIssue(source, cache, identity) ?? "", /Current/);
});
macTest("rejects malformed metadata and wrong bundle identity", async (t) => {
  const { source, cache } = await fixture(t);
  await writeFile(join(cache, "Contents/Info.plist"), "broken");
  assert.match(await runtimeIntegrityIssue(source, cache, identity) ?? "", /Info.plist/);
  await writeFile(join(cache, "Contents/Info.plist"), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Other</string><key>CFBundleIdentifier</key><string>wrong</string></dict></plist>');
  assert.match(await runtimeIntegrityIssue(source, cache, identity) ?? "", /identity/);
});

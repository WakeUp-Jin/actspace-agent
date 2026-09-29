import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { verifyBrowserComponents } from "../verify-browser-components.mjs";

test("validates the complete bundled Chrome component and rejects corruption", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-browser-components-"));
  try {
    await mkdir(join(root, "bin"));
    await mkdir(join(root, "extension", "src"), { recursive: true });
    const files = { "bin/abb": "host", "extension/manifest.json": '{"version":"0.2.2"}', "extension/src/background.js": "extension" };
    const hashes = {};
    for (const [path, content] of Object.entries(files)) {
      await writeFile(join(root, path), content);
      hashes[path] = createHash("sha256").update(content).digest("hex");
    }
    const manifest = { schemaVersion: 1, platform: process.platform, arch: process.arch, hostVersion: "0.1.0-dev", extensionVersion: "0.2.2", protocolVersion: "0.2.0", files: hashes };
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
    assert.equal((await verifyBrowserComponents(root)).extensionVersion, "0.2.2");
    await assert.rejects(verifyBrowserComponents(root, process.platform, "wrong-arch"), /incompatible/);
    await writeFile(join(root, "extension", "src", "background.js"), "tampered");
    await assert.rejects(verifyBrowserComponents(root), /hash mismatch/);
    await writeFile(join(root, "extension", "src", "background.js"), files["extension/src/background.js"]);
    delete manifest.files["extension/src/background.js"];
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
    await assert.rejects(verifyBrowserComponents(root), /missing/);
    assert.equal(await readFile(join(root, "bin", "abb"), "utf8"), "host");
  } finally { await rm(root, { recursive: true, force: true }); }
});

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

export async function verifyBrowserComponents(root, platform = process.platform, arch = process.arch) {
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.platform !== platform || manifest.arch !== arch ||
      typeof manifest.hostVersion !== "string" || typeof manifest.extensionVersion !== "string" ||
      manifest.protocolVersion !== "0.2.0" || !manifest.files || typeof manifest.files !== "object") {
    throw new Error("Browser component manifest is incompatible.");
  }
  for (const required of ["bin/abb", "extension/manifest.json", "extension/src/background.js"]) {
    if (!manifest.files[required]) throw new Error(`Browser component is missing: ${required}`);
  }
  for (const [relative, expected] of Object.entries(manifest.files)) {
    if (isAbsolute(relative) || relative.split("/").some((part) => part === ".." || part === "") ||
        typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) throw new Error("Browser component manifest contains an invalid path or hash.");
    const actual = createHash("sha256").update(await readFile(join(root, relative))).digest("hex");
    if (actual !== expected) throw new Error(`Browser component hash mismatch: ${relative}`);
  }
  const extension = JSON.parse(await readFile(join(root, "extension", "manifest.json"), "utf8"));
  if (extension.version !== manifest.extensionVersion) throw new Error("Browser extension version mismatch.");
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyBrowserComponents(process.argv[2]);
  console.log("Browser components verified.");
}

import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareCliRuntimeAssets } from "../binary/runtime-assets";

describe("prepareCliRuntimeAssets", () => {
  it("does nothing in a regular Node installation", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "actspace-runtime-assets-"));
    const env: NodeJS.ProcessEnv = {};
    await expect(prepareCliRuntimeAssets({ dataDir, env, sea: false })).resolves.toBeUndefined();
    expect(env.ACTSPACE_RG_PATH).toBeUndefined();
  });

  it("atomically installs, reuses, and repairs the embedded ripgrep", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "actspace-runtime-assets-"));
    const bytes = Buffer.from("embedded-ripgrep");
    const expectedSha256 = sha256(bytes);
    const env: NodeJS.ProcessEnv = {};
    const input = {
      dataDir,
      env,
      sea: true,
      version: "test-version",
      platform: "darwin" as const,
      arch: "arm64",
      expectedSha256,
      assetKey: "rg",
      readAsset: () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };

    const target = await prepareCliRuntimeAssets(input);
    expect(target).toBeTruthy();
    await expect(readFile(target!)).resolves.toEqual(bytes);
    expect((await stat(target!)).mode & 0o111).not.toBe(0);

    await writeFile(target!, "corrupt");
    await expect(prepareCliRuntimeAssets({ ...input, env: {} })).resolves.toBe(target);
    await expect(readFile(target!)).resolves.toEqual(bytes);
  });

  it("handles concurrent first installation and validates explicit overrides", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "actspace-runtime-assets-"));
    const bytes = Buffer.from("concurrent-ripgrep");
    const expectedSha256 = sha256(bytes);
    const createInput = () => ({
      dataDir,
      env: {} as NodeJS.ProcessEnv,
      sea: true,
      version: "test-version",
      platform: "darwin" as const,
      arch: "arm64",
      expectedSha256,
      assetKey: "rg",
      readAsset: () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
    const [left, right] = await Promise.all([
      prepareCliRuntimeAssets(createInput()),
      prepareCliRuntimeAssets(createInput()),
    ]);
    expect(left).toBe(right);
    await expect(readFile(left!)).resolves.toEqual(bytes);

    await expect(prepareCliRuntimeAssets({
      dataDir,
      env: { ACTSPACE_RG_PATH: join(dataDir, "missing-rg") },
      sea: false,
    })).rejects.toMatchObject({ code: "INVALID_RG_PATH", exitCode: 2 });
    await expect(access(left!)).resolves.toBeUndefined();
  });
});

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

import { mkdtemp, open, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAuthorizedImage } from "../image-input";

const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe("readAuthorizedImage", () => {
  it.each([
    ["photo.jpg", Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"],
    ["screen.png", PNG_HEADER, "image/png"],
    ["asset.webp", Buffer.from("RIFF0000WEBP", "ascii"), "image/webp"],
  ])("sniffs %s from file bytes", async (name, bytes, expectedMime) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "actspace-image-input-"));
    const path = join(workspaceRoot, name);
    await writeFile(path, bytes);

    await expect(readAuthorizedImage(path, workspaceRoot, { allowedImagePaths: [] })).resolves.toMatchObject({
      sourceName: name,
      mimeType: expectedMime,
      sizeBytes: bytes.length,
    });
  });

  it("allows session artifacts but blocks a symlink that escapes the workspace", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "actspace-image-workspace-"));
    const artifactRoot = await mkdtemp(join(tmpdir(), "actspace-image-artifacts-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "actspace-image-private-"));
    const artifactPath = join(artifactRoot, "generated.png");
    const outsidePath = join(outsideRoot, "private.png");
    const symlinkPath = join(workspaceRoot, "escape.png");
    await writeFile(artifactPath, PNG_HEADER);
    await writeFile(outsidePath, PNG_HEADER);
    await symlink(outsidePath, symlinkPath);

    await expect(readAuthorizedImage(artifactPath, workspaceRoot, {
      artifactRoot,
      allowedImagePaths: [],
    })).resolves.toMatchObject({ sourceName: "generated.png" });
    await expect(readAuthorizedImage(symlinkPath, workspaceRoot, {
      artifactRoot,
      allowedImagePaths: [],
    })).rejects.toMatchObject({ code: "outside_boundary" });
  });

  it("rejects files larger than 20 MiB before reading their contents", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "actspace-image-input-"));
    const path = join(workspaceRoot, "large.png");
    const handle = await open(path, "w");
    try {
      await handle.truncate(20 * 1024 * 1024 + 1);
    } finally {
      await handle.close();
    }

    await expect(readAuthorizedImage(path, workspaceRoot, { allowedImagePaths: [] }))
      .rejects.toMatchObject({ code: "too_large" });
  });

  it("rejects directories as non-regular image inputs", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "actspace-image-input-"));
    await expect(readAuthorizedImage(workspaceRoot, workspaceRoot, { allowedImagePaths: [] }))
      .rejects.toMatchObject({ code: "not_file" });
  });
});
